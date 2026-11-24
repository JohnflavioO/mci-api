// Confere que create_order cobra o mesmo que o site mostra (quoteResellerVolume) para o desconto progressivo,
// incluindo o teto no preço de revenda (20261125120000).
// Postgres em memória (PGlite); não toca em banco real.
// Como rodar (de uma pasta temporária, para não adicionar dependência ao projeto):
//   mkdir pgtest && cd pgtest && npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <repo>/supabase/tests/volume_discount_pricing.pglite.mjs . && node volume_discount_pricing.pglite.mjs <repo>/supabase/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MIG = process.argv[2];
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table public.user_roles (user_id uuid, role text);
  create table public.products (id uuid primary key, name text, status text default 'published', stock_quantity int);
  create table public.product_prices (product_id uuid, customer_price numeric(12,2));
  create table public.product_reseller_prices (product_id uuid, reseller_price numeric(12,2));
  create table public.reseller_volume_discount_rules (id uuid primary key default gen_random_uuid(), is_active boolean default true,
    product_ids text[], min_quantity int, max_quantity int, discount_type text, discount_value numeric, quantity_discounts jsonb);
  create table public.orders (id uuid primary key default gen_random_uuid(), user_id uuid, idempotency_key uuid,
    total numeric(12,2), shipping_amount numeric(12,2) default 0, volume_discount_amount numeric(12,2) default 0,
    updated_at timestamptz, unique (user_id, idempotency_key));
  create table public.order_items (order_id uuid, product_id uuid, name_snapshot text, unit_price numeric(12,2), qty int, line_total numeric(12,2));
`);
// Gatilho real que impede faixas sobrepostas no mesmo produto (a regra por unidade 2–4 precisa caber com 5–9 e 10+).
await db.exec(readFileSync(`${MIG}/20261103130000_reseller_volume_discount_product_conflict_guard.sql`, "utf8"));
for (const m of ["20261125090000_volume_discount_on_customer_price.sql", "20261125120000_volume_discount_reseller_ceiling.sql", "20261125150000_volume_discount_per_unit_with_ranges.sql"]) {
  await db.exec(readFileSync(`${MIG}/${m}`, "utf8"));
}

const RES = "11111111-1111-4111-8111-111111111111", CLI = "22222222-2222-4222-8222-222222222222";
const RAY = "33333333-3333-4333-8333-333333333333", FIX = "44444444-4444-4444-8444-444444444444", UNIT = "55555555-5555-4555-8555-555555555555";
const LOW = "66666666-6666-4666-8666-666666666666", DEEP = "77777777-7777-4777-8777-777777777777";
const ONLY = "88888888-8888-4888-8888-888888888888";
await db.exec(`
  insert into public.user_roles values ('${RES}', 'revendedor');
  insert into public.products values ('${RAY}','Ray 360c','published',100), ('${FIX}','Fixo','published',100), ('${UNIT}','Por unidade','published',100),
    ('${LOW}','Ray 660c','published',100), ('${DEEP}','Por unidade 30','published',100);
  insert into public.product_prices values ('${RAY}',4210), ('${FIX}',1000), ('${UNIT}',1000), ('${LOW}',4999), ('${DEEP}',1000);
  insert into public.product_reseller_prices values ('${RAY}',3073.30), ('${FIX}',800), ('${UNIT}',800), ('${LOW}',3999.20), ('${DEEP}',800);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value) values
    (array['${LOW}'],5,null,'percentage',15);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts) values
    (array['${DEEP}'],2,null,'percentage',0,'[{"quantity":2,"discount_type":"percentage","discount_value":30}]');
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value) values
    (array['${RAY}'],5,9,'percentage',29), (array['${RAY}'],10,null,'percentage',31), (array['${FIX}'],3,null,'fixed',50);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts) values
    (array['${UNIT}'],2,null,'percentage',0,'[{"quantity":2,"discount_type":"percentage","discount_value":10}]');
  -- Ray 360c como no admin: por unidade 2ª a 4ª (R$ 80 fixo) junto das faixas 5–9 e 10+.
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts) values
    (array['${RAY}'],2,4,'fixed',80,'[{"quantity":2,"discount_type":"fixed","discount_value":80},{"quantity":3,"discount_type":"fixed","discount_value":80},{"quantity":4,"discount_type":"fixed","discount_value":80}]');
  -- Produto só com regra por unidade 2ª a 4ª, para conferir que ela segue valendo acima da 4ª.
  insert into public.products values ('${ONLY}','Só por unidade','published',100);
  insert into public.product_prices values ('${ONLY}',4210);
  insert into public.product_reseller_prices values ('${ONLY}',3073.30);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts) values
    (array['${ONLY}'],2,4,'fixed',80,'[{"quantity":2,"discount_type":"fixed","discount_value":80},{"quantity":3,"discount_type":"fixed","discount_value":80},{"quantity":4,"discount_type":"fixed","discount_value":80}]');
`);

// Uma regra "2 ou mais, sem limite" (como era salva antes) continua bloqueada pelo gatilho.
await assert.rejects(db.exec(`insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts)
  values (array['${RAY}'],2,null,'fixed',80,'[{"quantity":2,"discount_type":"fixed","discount_value":80}]')`), /sobreposto/);
console.log("ok gatilho aceita 2–4 junto de 5–9 e 10+, e bloqueia '2 ou mais sem limite'");

let n = 0;
async function line(user, product, qty) {
  n += 1;
  const key = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const { rows } = await db.query(`select public.create_order('${user}','${key}','[{"product_id":"${product}","qty":${qty}}]'::jsonb) id`);
  const item = (await db.query(`select line_total, unit_price from public.order_items where order_id='${rows[0].id}'`)).rows[0];
  const order = (await db.query(`select total, volume_discount_amount v from public.orders where id='${rows[0].id}'`)).rows[0];
  return { line: Number(item.line_total), unit: Number(item.unit_price), total: Number(order.total), saved: Number(order.v) };
}

// Mesmos números de src/services/volumeDiscounts.reseller.test.ts
let r = await line(RES, RAY, 1);   assert.equal(r.line, 3073.30); console.log("ok 1 un. = preço de revenda 3.073,30");
r = await line(RES, RAY, 2);       assert.equal(r.line, 6066.60); console.log("ok 2 un.: 2ª com R$ 80 de desconto = 6.066,60");
r = await line(RES, RAY, 4);       assert.equal(r.line, 12053.20); console.log("ok 4 un.: 2ª a 4ª com R$ 80 = 12.053,20");
r = await line(RES, ONLY, 6);      assert.equal(r.line, 18199.80); console.log("ok só regra por unidade: acima da 4ª segue valendo (6 × 3.073,30 − 240)");
r = await line(RES, RAY, 5);       assert.equal(r.unit, 2989.10); assert.equal(r.line, 14945.50); console.log("ok 5 un. 29% sobre cliente final = 14.945,50 (2.989,10/un.)");
r = await line(RES, RAY, 10);      assert.equal(r.unit, 2904.90); assert.equal(r.line, 29049.00); console.log("ok 10 un. 31% = 29.049,00 (2.904,90/un.)");
assert.equal(r.saved, Number((3073.30 * 10 - 29049).toFixed(2))); console.log("ok economia registrada contra o preço de revenda");
r = await line(CLI, RAY, 5);       assert.equal(r.line, 21050.00); console.log("ok cliente comum paga preço de cliente final");
r = await line(RES, FIX, 3);       assert.equal(r.line, 2250.00); console.log("ok faixa em valor fixo continua sobre o preço de revenda (800 − 50)");
r = await line(RES, UNIT, 2);      assert.equal(r.line, 1600.00); console.log("ok por unidade: nenhuma unidade acima da revenda (800 + 800)");
r = await line(RES, DEEP, 2);      assert.equal(r.line, 1500.00); console.log("ok por unidade: 2ª un. com 30% sobre o final (800 + 700)");
r = await line(RES, LOW, 5);       assert.equal(r.unit, 3999.20); assert.equal(r.line, 19996.00); console.log("ok faixa de 15% abaixo da revenda (20%) não encarece: teto 3.999,20");
r = await line(RES, LOW, 2);       assert.equal(r.line, 7998.40); console.log("ok abaixo da faixa segue o preço de revenda");
console.log("TODOS OS TESTES PASSARAM");
