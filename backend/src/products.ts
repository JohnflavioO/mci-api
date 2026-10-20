import oracledb from "oracledb";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withConnection } from "./db.js";

/**
 * Rotas públicas (somente leitura) do catálogo.
 * Tabelas: MCI_PRODUCTS, MCI_PRODUCT_PRICING, MCI_PRODUCT_SPECS, MCI_PRODUCT_IMAGES.
 * Nunca expõe CREATED_BY, SOURCE_URL_HASH, SKU_NORMALIZED nem RESELLER_PRICE.
 */

/** Valor de STATUS gravado pelo importador ao publicar. Confirmar com MCI_PRODUCTS_STATUS_CK. */
export const PUBLIC_STATUS = "published";
const MAX_PRODUCTS = 500;

export type PublicProduct = {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  category: string;
  description: string | null;
  specs: { label: string; value: string | null }[];
  images: { url: string; position: number }[];
  pricing: { currency: string; customerPrice: number | null } | null;
};

type ProductRow = {
  PRODUCT_ID: string; NAME: string; BRAND: string | null; SKU: string; CATEGORY: string;
  DESCRIPTION: string | null; CURRENCY: string | null; CUSTOMER_PRICE: number | null;
};
type SpecRow = { PRODUCT_ID: string; LABEL: string; VALUE: string | null };
type ImageRow = { PRODUCT_ID: string; IMAGE_URL: string; POSITION: number };

const PRODUCT_SQL = `
  SELECT p.PRODUCT_ID, p.NAME, p.BRAND, p.SKU, p.CATEGORY, p.DESCRIPTION,
         pr.CURRENCY, pr.CUSTOMER_PRICE
    FROM MCI_PRODUCTS p
    LEFT JOIN MCI_PRODUCT_PRICING pr ON pr.PRODUCT_ID = p.PRODUCT_ID
   WHERE p.STATUS = :status`;

export function toPublicProduct(row: ProductRow, specs: SpecRow[], images: ImageRow[]): PublicProduct {
  return {
    id: row.PRODUCT_ID,
    name: row.NAME,
    brand: row.BRAND,
    sku: row.SKU,
    category: row.CATEGORY,
    description: row.DESCRIPTION,
    specs: specs.map((s) => ({ label: s.LABEL, value: s.VALUE })),
    images: images.filter((i) => /^https:\/\//.test(i.IMAGE_URL)).map((i) => ({ url: i.IMAGE_URL, position: i.POSITION })),
    pricing: row.CURRENCY ? { currency: row.CURRENCY.trim(), customerPrice: row.CUSTOMER_PRICE } : null,
  };
}

async function load(conn: oracledb.Connection, id?: string): Promise<PublicProduct[]> {
  const binds: Record<string, string> = { status: PUBLIC_STATUS };
  if (id) binds["id"] = id;
  const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { DESCRIPTION: { type: oracledb.STRING } } };
  const products = await conn.execute<ProductRow>(
    `${PRODUCT_SQL} ${id ? "AND p.PRODUCT_ID = :id" : ""}
     ORDER BY p.CREATED_AT DESC, p.PRODUCT_ID FETCH FIRST ${MAX_PRODUCTS} ROWS ONLY`,
    binds, opts,
  );
  const rows = products.rows ?? [];
  if (rows.length === 0) return [];
  // Relacionados em 2 consultas (sem N+1), restritos aos mesmos produtos públicos.
  const scope = `SELECT p.PRODUCT_ID FROM MCI_PRODUCTS p WHERE p.STATUS = :status ${id ? "AND p.PRODUCT_ID = :id" : ""}`;
  const [specs, images] = await Promise.all([
    conn.execute<SpecRow>(`SELECT PRODUCT_ID, LABEL, VALUE FROM MCI_PRODUCT_SPECS WHERE PRODUCT_ID IN (${scope}) ORDER BY PRODUCT_ID, SPEC_ID`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    conn.execute<ImageRow>(`SELECT PRODUCT_ID, IMAGE_URL, POSITION FROM MCI_PRODUCT_IMAGES WHERE PRODUCT_ID IN (${scope}) ORDER BY PRODUCT_ID, POSITION`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
  ]);
  const group = <T extends { PRODUCT_ID: string }>(list: T[] = []) =>
    list.reduce<Record<string, T[]>>((acc, r) => ((acc[r.PRODUCT_ID] ??= []).push(r), acc), {});
  const s = group(specs.rows), i = group(images.rows);
  return rows.map((r) => toPublicProduct(r, s[r.PRODUCT_ID] ?? [], i[r.PRODUCT_ID] ?? []));
}

const idParam = z.object({ id: z.string().trim().min(1).max(36) });

export async function registerProductRoutes(app: FastifyInstance) {
  app.get("/api/v1/products", async () => {
    const products = await withConnection((c) => load(c));
    return { products };
  });

  app.get("/api/v1/products/:id", async (req, reply) => {
    const parsed = idParam.safeParse(req.params);
    if (!parsed.success) return reply.status(404).send({ error: "Produto não encontrado" });
    const [product] = await withConnection((c) => load(c, parsed.data.id));
    if (!product) return reply.status(404).send({ error: "Produto não encontrado" });
    return { product };
  });
}
