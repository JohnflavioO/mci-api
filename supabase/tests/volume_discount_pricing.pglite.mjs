// Confere que create_order cobra o mesmo que o site mostra (quoteResellerVolume) para o desconto progressivo.
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
await db.exec(readFileSync(`${MIG}/20261125090000_volume_discount_on_customer_price.sql`, "utf8"));

const RES = "11111111-1111-4111-8111-111111111111", CLI = "22222222-2222-4222-8222-222222222222";
const RAY = "33333333-3333-4333-8333-333333333333", FIX = "44444444-4444-4444-8444-444444444444", UNIT = "55555555-5555-4555-8555-555555555555";
await db.exec(`
  insert into public.user_roles values ('${RES}', 'revendedor');
  insert into public.products values ('${RAY}','Ray 360c','published',100), ('${FIX}','Fixo','published',100), ('${UNIT}','Por unidade','published',100);
  insert into public.product_prices values ('${RAY}',4210), ('${FIX}',1000), ('${UNIT}',1000);
  insert into public.product_reseller_prices values ('${RAY}',3073.30), ('${FIX}',800), ('${UNIT}',800);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value) values
    (array['${RAY}'],5,9,'percentage',29), (array['${RAY}'],10,null,'percentage',31), (array['${FIX}'],3,null,'fixed',50);
  insert into public.reseller_volume_discount_rules (product_ids,min_quantity,max_quantity,discount_type,discount_value,quantity_discounts) values
    (array['${UNIT}'],2,null,'percentage',0,'[{"quantity":2,"discount_type":"percentage","discount_value":10}]');
`);

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
let r = await line(RES, RAY, 2);   assert.equal(r.line, 6146.60); console.log("ok 2 un. sem faixa = preço de revenda 6.146,60");
r = await line(RES, RAY, 5);       assert.equal(r.unit, 2989.10); assert.equal(r.line, 14945.50); console.log("ok 5 un. 29% sobre cliente final = 14.945,50 (2.989,10/un.)");
r = await line(RES, RAY, 10);      assert.equal(r.unit, 2904.90); assert.equal(r.line, 29049.00); console.log("ok 10 un. 31% = 29.049,00 (2.904,90/un.)");
assert.equal(r.saved, Number((3073.30 * 10 - 29049).toFixed(2))); console.log("ok economia registrada contra o preço de revenda");
r = await line(CLI, RAY, 5);       assert.equal(r.line, 21050.00); console.log("ok cliente comum paga preço de cliente final");
r = await line(RES, FIX, 3);       assert.equal(r.line, 2250.00); console.log("ok faixa em valor fixo continua sobre o preço de revenda (800 − 50)");
r = await line(RES, UNIT, 2);      assert.equal(r.line, 1900.00); console.log("ok por unidade em %: base cliente final, 2ª un. com 10% (1000 + 900)");
console.log("TODOS OS TESTES PASSARAM");
