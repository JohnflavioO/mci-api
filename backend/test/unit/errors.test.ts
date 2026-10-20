import { test } from "node:test";
import assert from "node:assert/strict";
import { mapOracleError, oracleInfo } from "../../src/errors.js";
import { patchSchema, pricingSchema, publishProblems } from "../../src/adminProducts.js";

const ora = (msg: string) => Object.assign(new Error(msg), { code: msg.slice(0, 9) });

test("ORA-00001 em MCI_PRODUCTS_SKU_UQ vira 409 SKU_DUPLICATE", () => {
  const e = mapOracleError(ora("ORA-00001: unique constraint (MCI.MCI_PRODUCTS_SKU_UQ) violated"));
  assert.equal(e?.status, 409);
  assert.equal(e?.code, "SKU_DUPLICATE");
});

test("ORA-00054 vira 409 LOCKED", () => assert.equal(mapOracleError(ora("ORA-00054: resource busy"))?.code, "LOCKED"));

test("ORA-01400 vira 422 sem texto Oracle", () => {
  const e = mapOracleError(ora("ORA-01400: cannot insert NULL into (\"MCI\".\"MCI_PRODUCTS\".\"BRAND\")"));
  assert.equal(e?.status, 422);
  assert.doesNotMatch(e!.message, /ORA-/);
});

test("erro desconhecido não é mapeado (vira 500)", () => assert.equal(mapOracleError(new Error("x")), null));

test("oracleInfo não inclui a mensagem", () => {
  const info = oracleInfo(ora("ORA-00001: unique constraint (MCI.MCI_PRODUCTS_SKU_UQ) violated"));
  assert.deepEqual(info, { oraCode: "ORA-00001", constraint: "MCI_PRODUCTS_SKU_UQ" });
});

test("PATCH exige rowVersion", () => assert.equal(patchSchema.safeParse({ name: "x" }).success, false));
test("PATCH recusa status (sem status novos)", () => assert.equal(patchSchema.safeParse({ rowVersion: 1, status: "archived" }).success, false));
test("revenda maior que cliente é recusada", () =>
  assert.equal(pricingSchema.safeParse({ currency: "BRL", customerPrice: 10, resellerPrice: 11 }).success, false));
test("publicar exige preços > 0", () =>
  assert.deepEqual(publishProblems({ sku: "A", category: "C", images: [{ url: "https://x", position: 0 }], pricing: { currency: "BRL", customerPrice: 0, resellerPrice: 5, updatedAt: null, rowVersion: 1 } }), ["customerPrice"]));
