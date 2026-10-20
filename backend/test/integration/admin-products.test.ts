/**
 * Testes de integração — SOMENTE banco de staging isolado.
 * Requisitos: migration 001 aplicada no staging; variáveis DB_* do staging;
 * STAGING_DB_CONFIRM=isolated; NODE_ENV=test. Recusa rodar caso contrário.
 * Cria apenas produtos com SKU prefixado "ZZTEST-" e os remove ao final.
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { preHandlerHookHandler } from "fastify";

if (process.env["NODE_ENV"] !== "test" || process.env["STAGING_DB_CONFIRM"] !== "isolated") {
  throw new Error("Recusado: defina NODE_ENV=test e STAGING_DB_CONFIRM=isolated apontando para o staging.");
}
if (/prod/i.test(process.env["DB_CONNECT_STRING"] ?? "")) throw new Error("Recusado: connect string parece de produção.");

const { buildApp } = await import("../../src/app.js");
const { withTransaction } = await import("../../src/tx.js");
const { withConnection, closeDb } = await import("../../src/db.js");

/** Stub de auth só para teste: na VPS o preHandler real é o login administrativo existente. */
const requireAdmin: preHandlerHookHandler = async (req, reply) => {
  const h = req.headers.authorization;
  if (!h) return reply.status(401).send({ error: "Autenticação necessária", code: "UNAUTHENTICATED", requestId: req.id });
  if (h === "Bearer expired") return reply.status(401).send({ error: "Sessão expirada", code: "UNAUTHENTICATED", requestId: req.id });
  if (h !== "Bearer admin") return reply.status(403).send({ error: "Sem permissão", code: "FORBIDDEN", requestId: req.id });
  req.adminId = "test-admin";
};

const logs: string[] = [];
const logStream = new Writable({ write(c, _e, cb) { logs.push(String(c)); cb(); } });
let fail: "none" | "afterWrite" = "none";
const app = await buildApp({
  logStream,
  admin: { requireAdmin, afterProductWrite: async () => { if (fail === "afterWrite") throw new Error("falha injetada"); } },
});
const ADMIN = { authorization: "Bearer admin" };
const PRICE_C = 4321.09, PRICE_R = 1234.56;

async function fixture(sku = `ZZTEST-${randomUUID().slice(0, 8)}`, status: "draft" | "published" = "draft") {
  const id = randomUUID();
  // Ajustar colunas obrigatórias (ex.: CREATED_BY, SOURCE_URL_HASH, IMPORTED_AT) ao schema real do staging.
  await withTransaction(async (c) => {
    await c.execute(`INSERT INTO MCI_PRODUCTS (PRODUCT_ID, NAME, BRAND, SKU, CATEGORY, STATUS, CREATED_AT)
                     VALUES (:id, 'Teste', 'Marca', :sku, 'Teste', 'draft', SYSTIMESTAMP)`, { id, sku });
    await c.execute(`INSERT INTO MCI_PRODUCT_IMAGES (PRODUCT_ID, IMAGE_URL, POSITION) VALUES (:id, 'https://example.com/a.jpg', 0)`, { id });
    await c.execute(`INSERT INTO MCI_PRODUCT_SPECS (PRODUCT_ID, LABEL, VALUE) VALUES (:id, 'Cor', 'Preto')`, { id });
    await c.execute(`INSERT INTO MCI_PRODUCT_PRICING (PRODUCT_ID, CURRENCY, CUSTOMER_PRICE, RESELLER_PRICE, UPDATED_AT, ROW_VERSION)
                     VALUES (:id, 'BRL', :c, :r, SYSTIMESTAMP, 1)`, { id, c: PRICE_C, r: PRICE_R });
    if (status === "published") await c.execute(`UPDATE MCI_PRODUCTS SET STATUS = 'published' WHERE PRODUCT_ID = :id`, { id });
  });
  return { id, sku };
}
const get = async (id: string) => (await app.inject({ method: "GET", url: `/api/v1/admin/products/${id}`, headers: ADMIN })).json().product;
const patch = (id: string, body: unknown, headers: Record<string, string> = ADMIN) =>
  app.inject({ method: "PATCH", url: `/api/v1/admin/products/${id}`, headers, payload: body as object });

async function cleanup() {
  await withTransaction(async (c) => {
    const scope = `SELECT PRODUCT_ID FROM MCI_PRODUCTS WHERE SKU LIKE 'ZZTEST-%'`;
    for (const t of ["MCI_PRODUCT_SPECS", "MCI_PRODUCT_IMAGES", "MCI_PRODUCT_PRICING"])
      await c.execute(`DELETE FROM ${t} WHERE PRODUCT_ID IN (${scope})`);
    await c.execute(`DELETE FROM MCI_PRODUCTS WHERE SKU LIKE 'ZZTEST-%'`);
  });
}
before(cleanup);
beforeEach(() => { fail = "none"; });
after(async () => { await cleanup(); await app.close(); await closeDb(); });

// Permissões
test("01 sem token → 401 em todas as rotas", async () => {
  const { id } = await fixture();
  for (const [method, url] of [["GET", "/api/v1/admin/products"], ["PATCH", `/api/v1/admin/products/${id}`],
    ["PUT", `/api/v1/admin/products/${id}/pricing`], ["POST", `/api/v1/admin/products/${id}/publish`]] as const) {
    const r = await app.inject({ method, url, payload: {} });
    assert.equal(r.statusCode, 401, `${method} ${url}`);
  }
});
test("02 não-admin → 403 e nada alterado", async () => {
  const { id } = await fixture();
  const r = await patch(id, { rowVersion: 1, name: "Hack" }, { authorization: "Bearer cliente" });
  assert.equal(r.statusCode, 403);
  assert.equal((await get(id)).name, "Teste");
});
test("03 token expirado → 401", async () => {
  const r = await app.inject({ method: "GET", url: "/api/v1/admin/products", headers: { authorization: "Bearer expired" } });
  assert.equal(r.statusCode, 401);
});

// SKU duplicado
test("04 SKU que normaliza igual a um existente → 409, sem alteração", async () => {
  const a = await fixture(`ZZTEST-ABC${Date.now()}`);
  const b = await fixture();
  const r = await patch(b.id, { rowVersion: 1, sku: `  ${a.sku.toLowerCase()} ` });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, "SKU_DUPLICATE");
  const now = await get(b.id);
  assert.equal(now.sku, b.sku);
  assert.equal(now.rowVersion, 1);
});
test("05 erro de SKU não expõe texto Oracle", async () => {
  const a = await fixture();
  const b = await fixture();
  const r = await patch(b.id, { rowVersion: 1, sku: a.sku });
  assert.doesNotMatch(r.body, /ORA-|MCI_PRODUCTS_SKU_UQ/);
});

// Conflito de versão
test("06 PATCH com versão atual → 200, versão +1, UPDATED_AT maior", async () => {
  const { id } = await fixture();
  const before = await get(id);
  const r = await patch(id, { rowVersion: 1, name: "Novo" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().product.rowVersion, 2);
  assert.ok(new Date(r.json().product.updatedAt) > new Date(before.updatedAt));
});
test("07 dois PATCH com mesma versão → segundo 409, primeiro preservado", async () => {
  const { id } = await fixture();
  assert.equal((await patch(id, { rowVersion: 1, name: "Primeiro" })).statusCode, 200);
  const r = await patch(id, { rowVersion: 1, name: "Segundo" });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, "VERSION_CONFLICT");
  assert.equal((await get(id)).name, "Primeiro");
});
test("08 PUT pricing com versão antiga → 409, preços inalterados", async () => {
  const { id } = await fixture();
  const ok = await app.inject({ method: "PUT", url: `/api/v1/admin/products/${id}/pricing`, headers: ADMIN, payload: { currency: "BRL", customerPrice: 100, resellerPrice: 50, rowVersion: 1 } });
  assert.equal(ok.statusCode, 200);
  const r = await app.inject({ method: "PUT", url: `/api/v1/admin/products/${id}/pricing`, headers: ADMIN, payload: { currency: "BRL", customerPrice: 1, resellerPrice: 1, rowVersion: 1 } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, "PRICING_VERSION_CONFLICT");
  assert.equal((await get(id)).pricing.customerPrice, 100);
});
test("09 publish com versão antiga → 409, status inalterado", async () => {
  const { id } = await fixture();
  await patch(id, { rowVersion: 1, name: "X" });
  const r = await app.inject({ method: "POST", url: `/api/v1/admin/products/${id}/publish`, headers: ADMIN, payload: { rowVersion: 1 } });
  assert.equal(r.statusCode, 409);
  assert.equal((await get(id)).status, "draft");
});

// Inexistente
test("10 ID inexistente → 404 em GET/PATCH/PUT/publish", async () => {
  const id = randomUUID();
  const calls = [
    app.inject({ method: "GET", url: `/api/v1/admin/products/${id}`, headers: ADMIN }),
    patch(id, { rowVersion: 1, name: "x" }),
    app.inject({ method: "PUT", url: `/api/v1/admin/products/${id}/pricing`, headers: ADMIN, payload: { currency: "BRL", customerPrice: 1, resellerPrice: 1, rowVersion: 1 } }),
    app.inject({ method: "POST", url: `/api/v1/admin/products/${id}/publish`, headers: ADMIN, payload: { rowVersion: 1 } }),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.statusCode, 404);
});

// Rollback / atomicidade
test("11 falha após gravar specs/imagens → nada persiste", async () => {
  const { id } = await fixture();
  const before = await get(id);
  fail = "afterWrite";
  const r = await patch(id, { rowVersion: 1, name: "Parcial", specs: [{ label: "Peso", value: "1kg" }], images: [{ url: "https://example.com/b.jpg", position: 0 }] });
  assert.equal(r.statusCode, 500);
  assert.deepEqual(await get(id), before);
});
test("12 specs: [] remove especificações sem erro", async () => {
  const { id } = await fixture();
  const r = await patch(id, { rowVersion: 1, specs: [] });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json().product.specs, []);
});
test("13 falha após UPDATE do produto → nome e versão inalterados", async () => {
  const { id } = await fixture();
  fail = "afterWrite";
  await patch(id, { rowVersion: 1, name: "Nunca" });
  const now = await get(id);
  assert.equal(now.name, "Teste");
  assert.equal(now.rowVersion, 1);
});

// Isolamento de preços de revenda
test("14 rotas públicas nunca retornam resellerPrice", async () => {
  const { id } = await fixture(undefined, "published");
  const one = await app.inject({ method: "GET", url: `/api/v1/products/${id}` });
  const list = await app.inject({ method: "GET", url: "/api/v1/products" });
  for (const r of [one, list]) {
    assert.doesNotMatch(r.body, /resellerPrice|RESELLER_PRICE/i);
    assert.ok(!r.body.includes(String(PRICE_R)));
  }
});
test("15 rota admin retorna resellerPrice", async () => {
  const { id } = await fixture();
  assert.equal((await get(id)).pricing.resellerPrice, PRICE_R);
});
test("16 logs não contêm preços, token nem senha", async () => {
  const { id } = await fixture();
  logs.length = 0;
  await patch(id, { rowVersion: 1, name: "Log" });
  await patch(id, { rowVersion: 1, name: "Log2" });
  await app.inject({ method: "PUT", url: `/api/v1/admin/products/${id}/pricing`, headers: ADMIN, payload: { currency: "BRL", customerPrice: 777.77, resellerPrice: 333.33, rowVersion: 9 } });
  const all = logs.join("\n");
  for (const secret of ["777.77", "333.33", String(PRICE_R), "Bearer admin", process.env["DB_PASSWORD"] ?? "\u0000"])
    assert.ok(!all.includes(secret), `log contém dado sensível`);
});

// Status
test("17 status diferente de draft/published → 400 sem tocar no banco", async () => {
  const { id } = await fixture();
  const r = await patch(id, { rowVersion: 1, status: "archived" });
  assert.equal(r.statusCode, 400);
  assert.equal((await get(id)).rowVersion, 1);
});
test("18 publicar sem preços > 0 → 422", async () => {
  const { id } = await fixture();
  await withConnection(async (c) => { await c.execute(`UPDATE MCI_PRODUCT_PRICING SET CUSTOMER_PRICE = 0 WHERE PRODUCT_ID = :id`, { id }); await c.commit(); });
  const r = await app.inject({ method: "POST", url: `/api/v1/admin/products/${id}/publish`, headers: ADMIN, payload: { rowVersion: 1 } });
  assert.equal(r.statusCode, 422);
  assert.equal((await get(id)).status, "draft");
});

// Formato de erro
test("19 todo erro tem error, code, requestId e nunca ORA-", async () => {
  const { id } = await fixture();
  fail = "afterWrite";
  const responses = [
    await patch(id, { rowVersion: 1, name: "x" }),
    await patch(randomUUID(), { rowVersion: 1, name: "x" }),
    await patch(id, { nope: true }),
  ];
  for (const r of responses) {
    const b = r.json();
    assert.ok(b.error && b.code && b.requestId);
    assert.equal(r.headers["x-request-id"], b.requestId);
    assert.doesNotMatch(r.body, /ORA-|NJS-/);
  }
});
