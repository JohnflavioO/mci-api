import oracledb from "oracledb";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { z } from "zod";
import { AppError } from "./errors.js";
import { withConnection } from "./db.js";
import { withTransaction } from "./tx.js";

/**
 * Rotas administrativas de produtos (requer migration 001).
 * Status: somente 'draft' | 'published' (MCI_PRODUCTS_STATUS_CK).
 * A autenticação NÃO é implementada aqui: o preHandler `requireAdmin` vem do login
 * administrativo já existente na VPS (401 sem/expirado token, 403 sem papel admin)
 * e deve definir req.adminId.
 */

export type AdminRouteOptions = {
  requireAdmin: preHandlerHookHandler;
  /** Só para testes de rollback: executa dentro da transação, após o UPDATE do produto. */
  afterProductWrite?: (conn: oracledb.Connection) => Promise<void>;
};

declare module "fastify" {
  interface FastifyRequest { adminId?: string }
}

const OBJ = { outFormat: oracledb.OUT_FORMAT_OBJECT } as const;
const money = z.number().finite().nonnegative().multipleOf(0.01).max(9_999_999_999.99);
const httpsUrl = z.string().trim().max(2048).regex(/^https:\/\//, "Use https://");

const specsSchema = z.array(z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(500),
})).max(100).refine(
  (s) => new Set(s.map((x) => x.label.toLowerCase())).size === s.length,
  "Especificações com rótulo repetido",
);
const imagesSchema = z.array(z.object({ url: httpsUrl, position: z.number().int().min(0) })).max(20)
  .refine((i) => new Set(i.map((x) => x.position)).size === i.length, "Posições de imagem repetidas");

export const patchSchema = z.object({
  rowVersion: z.number().int().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().max(100).optional(),
  sku: z.string().trim().min(1).max(64).nullable().optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  category: z.string().trim().min(1).max(100).nullable().optional(),
  specs: specsSchema.optional(),
  images: imagesSchema.optional(),
}).strict();

export const pricingSchema = z.object({
  currency: z.literal("BRL"),
  customerPrice: money.nullable(),
  resellerPrice: money.nullable(),
  rowVersion: z.number().int().min(1).optional(),
}).strict().refine(
  (p) => p.customerPrice == null || p.resellerPrice == null || p.resellerPrice <= p.customerPrice,
  { message: "Preço de revenda maior que o preço ao cliente", path: ["resellerPrice"] },
);

const publishSchema = z.object({ rowVersion: z.number().int().min(1) }).strict();
const idParam = z.object({ id: z.string().trim().min(1).max(36) });
const listQuery = z.object({
  status: z.enum(["draft", "published"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) fields[i.path.join(".") || "_"] ??= i.message;
  throw new AppError(400, "VALIDATION", "Dados inválidos.", fields);
}

type Row = {
  PRODUCT_ID: string; NAME: string; BRAND: string | null; SKU: string | null; CATEGORY: string | null;
  DESCRIPTION: string | null; STATUS: "draft" | "published"; SOURCE_URL: string | null;
  CREATED_AT: Date; UPDATED_AT: Date; ROW_VERSION: number;
  CURRENCY: string | null; CUSTOMER_PRICE: number | null; RESELLER_PRICE: number | null;
  PRICING_UPDATED_AT: Date | null; PRICING_ROW_VERSION: number | null;
};

const SELECT = `
  SELECT p.PRODUCT_ID, p.NAME, p.BRAND, p.SKU, p.CATEGORY, p.DESCRIPTION, p.STATUS, p.SOURCE_URL,
         p.CREATED_AT, p.UPDATED_AT, p.ROW_VERSION,
         pr.CURRENCY, pr.CUSTOMER_PRICE, pr.RESELLER_PRICE,
         pr.UPDATED_AT AS PRICING_UPDATED_AT, pr.ROW_VERSION AS PRICING_ROW_VERSION
    FROM MCI_PRODUCTS p
    LEFT JOIN MCI_PRODUCT_PRICING pr ON pr.PRODUCT_ID = p.PRODUCT_ID`;

async function loadOne(conn: oracledb.Connection, id: string) {
  const r = await conn.execute<Row>(`${SELECT} WHERE p.PRODUCT_ID = :id`, { id },
    { ...OBJ, fetchInfo: { DESCRIPTION: { type: oracledb.STRING } } });
  const row = r.rows?.[0];
  if (!row) return null;
  const [specs, images] = await Promise.all([
    conn.execute<{ LABEL: string; VALUE: string }>(`SELECT LABEL, VALUE FROM MCI_PRODUCT_SPECS WHERE PRODUCT_ID = :id ORDER BY SPEC_ID`, { id }, OBJ),
    conn.execute<{ IMAGE_URL: string; POSITION: number }>(`SELECT IMAGE_URL, POSITION FROM MCI_PRODUCT_IMAGES WHERE PRODUCT_ID = :id ORDER BY POSITION`, { id }, OBJ),
  ]);
  return toAdmin(row, specs.rows ?? [], images.rows ?? []);
}

/** Formato administrativo: inclui resellerPrice. Nunca reutilizar em rotas públicas. */
function toAdmin(r: Row, specs: { LABEL: string; VALUE: string }[] = [], images: { IMAGE_URL: string; POSITION: number }[] = []) {
  return {
    id: r.PRODUCT_ID, name: r.NAME, brand: r.BRAND ?? "", sku: r.SKU, category: r.CATEGORY,
    description: r.DESCRIPTION, status: r.STATUS, sourceUrl: r.SOURCE_URL,
    createdAt: r.CREATED_AT, updatedAt: r.UPDATED_AT, rowVersion: r.ROW_VERSION,
    specs: specs.map((s) => ({ label: s.LABEL, value: s.VALUE })),
    images: images.map((i) => ({ url: i.IMAGE_URL, position: i.POSITION })),
    pricing: r.CURRENCY == null ? null : {
      currency: r.CURRENCY.trim(), customerPrice: r.CUSTOMER_PRICE, resellerPrice: r.RESELLER_PRICE,
      updatedAt: r.PRICING_UPDATED_AT, rowVersion: r.PRICING_ROW_VERSION,
    },
  };
}
type AdminProduct = NonNullable<Awaited<ReturnType<typeof loadOne>>>;

/** Requisitos para um produto ficar/permanecer publicado. */
export function publishProblems(p: Pick<AdminProduct, "sku" | "category" | "images" | "pricing">): string[] {
  const out: string[] = [];
  if (!p.sku) out.push("sku");
  if (!p.category) out.push("category");
  if (p.images.length === 0) out.push("images");
  if (!(p.pricing?.customerPrice && p.pricing.customerPrice > 0)) out.push("customerPrice");
  if (!(p.pricing?.resellerPrice && p.pricing.resellerPrice > 0)) out.push("resellerPrice");
  return out;
}
function assertPublishable(p: AdminProduct) {
  const missing = publishProblems(p);
  if (missing.length) throw new AppError(422, "RULE_VIOLATION", "Produto publicado precisa de SKU, categoria, imagem e preços maiores que zero.",
    Object.fromEntries(missing.map((m) => [m, "obrigatório para publicar"])));
}

async function exists(conn: oracledb.Connection, id: string) {
  const r = await conn.execute(`SELECT 1 FROM MCI_PRODUCTS WHERE PRODUCT_ID = :id`, { id });
  return (r.rows?.length ?? 0) > 0;
}

async function bumpVersion(conn: oracledb.Connection, id: string, rowVersion: number, sets: string[], binds: Record<string, string | number | null>) {
  const sql = `UPDATE MCI_PRODUCTS SET ${[...sets, "UPDATED_AT = SYSTIMESTAMP", "ROW_VERSION = ROW_VERSION + 1"].join(", ")}
                WHERE PRODUCT_ID = :id AND ROW_VERSION = :rowVersion`;
  const r = await conn.execute(sql, { ...binds, id, rowVersion });
  if (r.rowsAffected === 1) return;
  if (!(await exists(conn, id))) throw new AppError(404, "NOT_FOUND", "Produto não encontrado.");
  throw new AppError(409, "VERSION_CONFLICT", "Produto alterado por outra pessoa. Recarregue.");
}

const COLS = { name: "NAME", brand: "BRAND", sku: "SKU", description: "DESCRIPTION", category: "CATEGORY" } as const;

export async function registerAdminProductRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  const pre = { preHandler: opts.requireAdmin };

  app.get("/api/v1/admin/products", pre, async (req) => {
    const q = parse(listQuery, req.query);
    const where = ["1=1"];
    const binds: Record<string, string | number | null> = {};
    if (q.status) { where.push("p.STATUS = :status"); binds["status"] = q.status; }
    if (q.q) { where.push("(UPPER(p.NAME) LIKE :term OR p.SKU_NORMALIZED LIKE :term)"); binds["term"] = `%${q.q.toUpperCase()}%`; }
    return withConnection(async (c) => {
      const total = await c.execute<{ N: number }>(`SELECT COUNT(*) AS N FROM MCI_PRODUCTS p WHERE ${where.join(" AND ")}`, binds, OBJ);
      const rows = await c.execute<Row>(
        `${SELECT} WHERE ${where.join(" AND ")} ORDER BY p.UPDATED_AT DESC, p.PRODUCT_ID
         OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`,
        { ...binds, off: (q.page - 1) * q.pageSize, lim: q.pageSize },
        { ...OBJ, fetchInfo: { DESCRIPTION: { type: oracledb.STRING } } },
      );
      return { products: (rows.rows ?? []).map((r) => toAdmin(r)), page: q.page, pageSize: q.pageSize, total: total.rows?.[0]?.N ?? 0 };
    });
  });

  app.get("/api/v1/admin/products/:id", pre, async (req) => {
    const { id } = parse(idParam, req.params);
    const product = await withConnection((c) => loadOne(c, id));
    if (!product) throw new AppError(404, "NOT_FOUND", "Produto não encontrado.");
    return { product };
  });

  app.patch("/api/v1/admin/products/:id", pre, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(patchSchema, req.body);
    const product = await withTransaction(async (c) => {
      const sets: string[] = [];
      const binds: Record<string, string | number | null> = {};
      for (const [key, col] of Object.entries(COLS)) {
        const v = body[key as keyof typeof COLS];
        if (v !== undefined) { sets.push(`${col} = :${key}`); binds[key] = v; }
      }
      await bumpVersion(c, id, body.rowVersion, sets, binds);
      if (body.specs) {
        await c.execute(`DELETE FROM MCI_PRODUCT_SPECS WHERE PRODUCT_ID = :id`, { id });
        // executeMany falha com lista vazia (NJS-005): só chamar se houver itens.
        if (body.specs.length) await c.executeMany(`INSERT INTO MCI_PRODUCT_SPECS (PRODUCT_ID, LABEL, VALUE) VALUES (:id, :label, :value)`,
          body.specs.map((s) => ({ id, label: s.label, value: s.value })));
      }
      if (body.images) {
        await c.execute(`DELETE FROM MCI_PRODUCT_IMAGES WHERE PRODUCT_ID = :id`, { id });
        if (body.images.length) await c.executeMany(`INSERT INTO MCI_PRODUCT_IMAGES (PRODUCT_ID, IMAGE_URL, POSITION) VALUES (:id, :url, :position)`,
          body.images.map((i) => ({ id, url: i.url, position: i.position })));
      }
      await opts.afterProductWrite?.(c);
      const after = (await loadOne(c, id))!;
      if (after.status === "published") assertPublishable(after);
      return after;
    });
    return { product };
  });

  app.put("/api/v1/admin/products/:id/pricing", pre, async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(pricingSchema, req.body);
    const product = await withTransaction(async (c) => {
      const cur = await c.execute<{ ROW_VERSION: number }>(
        `SELECT pr.ROW_VERSION FROM MCI_PRODUCTS p LEFT JOIN MCI_PRODUCT_PRICING pr ON pr.PRODUCT_ID = p.PRODUCT_ID WHERE p.PRODUCT_ID = :id`, { id }, OBJ);
      if (!cur.rows?.length) throw new AppError(404, "NOT_FOUND", "Produto não encontrado.");
      const hasPricing = cur.rows[0]!.ROW_VERSION != null;
      const binds = { id, currency: body.currency, customer: body.customerPrice, reseller: body.resellerPrice };
      if (hasPricing) {
        if (body.rowVersion == null) throw new AppError(400, "VALIDATION", "Dados inválidos.", { rowVersion: "obrigatório" });
        const r = await c.execute(
          `UPDATE MCI_PRODUCT_PRICING SET CURRENCY = :currency, CUSTOMER_PRICE = :customer, RESELLER_PRICE = :reseller,
                  UPDATED_AT = SYSTIMESTAMP, ROW_VERSION = ROW_VERSION + 1
            WHERE PRODUCT_ID = :id AND ROW_VERSION = :rowVersion`, { ...binds, rowVersion: body.rowVersion });
        if (r.rowsAffected !== 1) throw new AppError(409, "PRICING_VERSION_CONFLICT", "Preços alterados por outra pessoa. Recarregue.");
      } else {
        await c.execute(
          `INSERT INTO MCI_PRODUCT_PRICING (PRODUCT_ID, CURRENCY, CUSTOMER_PRICE, RESELLER_PRICE, UPDATED_AT, ROW_VERSION)
           VALUES (:id, :currency, :customer, :reseller, SYSTIMESTAMP, 1)`, binds);
      }
      const after = (await loadOne(c, id))!;
      if (after.status === "published") assertPublishable(after);
      return after;
    });
    return { pricing: product.pricing };
  });

  /** Substitui a rota publish atual da VPS: agora exige rowVersion e incrementa a versão. */
  app.post("/api/v1/admin/products/:id/publish", pre, async (req) => {
    const { id } = parse(idParam, req.params);
    const { rowVersion } = parse(publishSchema, req.body);
    const product = await withTransaction(async (c) => {
      const before = await loadOne(c, id);
      if (!before) throw new AppError(404, "NOT_FOUND", "Produto não encontrado.");
      if (before.status === "published") throw new AppError(409, "RULE_VIOLATION", "Produto já está publicado.");
      assertPublishable(before);
      await bumpVersion(c, id, rowVersion, ["STATUS = 'published'"], {});
      return (await loadOne(c, id))!;
    });
    return { product };
  });
}
