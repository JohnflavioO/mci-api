// Teste do Store House Pontos num Postgres em memória (PGlite). Não toca em banco real.
// Como rodar (de uma pasta temporária, para não adicionar dependência ao projeto):
//   mkdir pgtest && cd pgtest && npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <repo>/supabase/tests/store_house_pontos.pglite.mjs . && node store_house_pontos.pglite.mjs <repo>/supabase/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MIG = process.argv[2];
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create table public.user_roles (user_id uuid, role text);
  create type public.order_status as enum ('pending_payment','paid','rejected','cancelled','refund_required','refunded');
  create table public.orders (id uuid primary key default gen_random_uuid(), user_id uuid, total numeric(12,2) not null,
    shipping_amount numeric(12,2) not null default 0, status public.order_status not null default 'pending_payment',
    commission_base_amount numeric(12,2), updated_at timestamptz);
  create table public.order_items (order_id uuid, product_id uuid default gen_random_uuid(), unit_price numeric(12,2), qty int, line_total numeric(12,2));
`);
await db.exec(readFileSync(`${MIG}/20261127100000_store_house_pontos.sql`, "utf8"));
await db.exec(readFileSync(`${MIG}/20261127100000_store_house_pontos.sql`, "utf8")); // reaplicar é seguro

const CLI = "11111111-1111-4111-8111-111111111111", RES = "22222222-2222-4222-8222-222222222222";
await db.exec(`insert into auth.users values ('${CLI}','c@x.test'), ('${RES}','r@x.test'); insert into public.user_roles values ('${RES}','revendedor');`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const bal = async (u = CLI) => { const r = await one(`select * from public.loyalty_balance('${u}')`); return { available: r.available, pending: r.pending }; };
const expectError = async (sql, msg) => { await assert.rejects(db.exec(sql), (e) => e.message.includes(msg)); };
async function order(lines, user = CLI, extra = "") {
  const total = lines.reduce((s, l) => s + l, 0);
  const { id } = await one(`insert into public.orders (user_id, total${extra ? ", commission_base_amount" : ""}) values ('${user}', ${total}${extra ? ", " + extra : ""}) returning id`);
  for (const l of lines) await db.exec(`insert into public.order_items (order_id, unit_price, qty, line_total) values ('${id}', ${l}, 1, ${l})`);
  return id;
}
const setStatus = (id, s) => db.exec(`update public.orders set status='${s}' where id='${id}'`);
const releaseAll = () => db.exec(`update public.loyalty_points_ledger set available_at = now() - interval '1 minute' where kind='earn'`);
const apply = (id, pts, user = CLI) => one(`select * from public.apply_loyalty_redemption('${id}','${user}',${pts})`);

// 1. Compra paga: 4.210 pontos em liberação; depois de 7 dias ficam disponíveis.
const o1 = await order([4210]);
await setStatus(o1, "paid");
assert.deepEqual(await bal(), { available: 0, pending: 4210 });
await releaseAll();
assert.deepEqual(await bal(), { available: 4210, pending: 0 });
console.log("ok compra paga gera 1 pt por R$ (4.210 pts), liberados após o prazo");

// 2. Resgate: 1.000 pts = R$ 10,00 distribuídos nos itens; total e base de comissão caem junto.
const o2 = await order([1000, 500], CLI, "1500");
const r = await apply(o2, 1000);
assert.deepEqual([r.points_used, Number(r.discount)], [1000, 10]);
const ord = await one(`select total, loyalty_points_used, loyalty_discount_amount, commission_base_amount from public.orders where id='${o2}'`);
assert.equal(Number(ord.total), 1490); assert.equal(Number(ord.commission_base_amount), 1490);
const items = await q(`select line_total from public.order_items where order_id='${o2}' order by line_total desc`);
assert.deepEqual(items.map((i) => Number(i.line_total)), [993.33, 496.67]);
assert.equal((await bal()).available, 3210);
assert.deepEqual(await apply(o2, 2000).then((x) => [x.points_used, Number(x.discount)]), [1000, 10]); // idempotente
console.log("ok resgate de 1.000 pts = R$ 10,00, distribuído nos itens (993,33 + 496,67) e idempotente");

// 3. Pedido cancelado: os pontos voltam.
await setStatus(o2, "cancelled");
assert.equal((await bal()).available, 4210);
assert.equal((await one(`select points from public.loyalty_points_ledger where kind='redeem_refund' and order_id='${o2}'`)).points, 1000);
console.log("ok pedido cancelado devolve os pontos usados");

// 4. Limite de 20% dos produtos e mínimo de 100 pts.
const o3 = await order([100]);
assert.equal((await apply(o3, 5000)).points_used, 2000); // 20% de R$ 100 = R$ 20 = 2.000 pts
await setStatus(o3, "rejected");
const o4 = await order([100]);
await expectError(`select * from public.apply_loyalty_redemption('${o4}','${CLI}',50)`, "LOY_BELOW_MINIMUM");
const mx = await one(`select * from public.loyalty_max_redeem('${CLI}', 300)`);
assert.deepEqual([mx.max_points, Number(mx.max_discount), mx.eligible], [4210, 42.1, true]); // limite 20% = R$ 60 > saldo
console.log("ok limite de 20% por pedido, mínimo de 100 pts e cotação para o checkout");

// 5. Pagamento do pedido com desconto: ganha pontos sobre o que pagou em produtos (sem frete).
const o5 = await order([500]);
await apply(o5, 500); // R$ 5,00
await db.exec(`update public.orders set shipping_amount = 50, total = total + 50 where id='${o5}'`);
await setStatus(o5, "paid");
assert.equal((await one(`select points from public.loyalty_points_ledger where kind='earn' and order_id='${o5}'`)).points, 495);
console.log("ok pedido pago com desconto rende pontos só sobre os produtos pagos (495 pts)");

// 6. Estorno de pedido pago: tira o que resta do lote e devolve os pontos usados.
const before = await bal();
await setStatus(o5, "refunded");
const after = await bal();
assert.equal(after.pending, before.pending - 495);
assert.equal(after.available, before.available + 500);
console.log("ok estorno retira os pontos ganhos e devolve os usados");

// 7. Revendedor não ganha nem usa pontos.
const o6 = await order([1000], RES);
await setStatus(o6, "paid");
assert.deepEqual(await bal(RES), { available: 0, pending: 0 });
const o7 = await order([1000], RES);
await expectError(`select * from public.apply_loyalty_redemption('${o7}','${RES}',100)`, "LOY_NOT_ELIGIBLE");
assert.equal((await one(`select eligible from public.loyalty_max_redeem('${RES}', 1000)`)).eligible, false);
console.log("ok revendedor não participa");

// 8. Vencimento: lote vencido sai do saldo com lançamento de "vencido".
await db.exec(`update public.loyalty_points_ledger set expires_at = now() - interval '1 day' where kind='earn' and order_id='${o1}'`);
const expBefore = (await bal()).available;
assert.equal(expBefore, 0);
assert.ok((await one(`select count(*)::int n from public.loyalty_points_ledger where kind='expire'`)).n >= 1);
console.log("ok pontos vencidos saem do saldo com lançamento");

// 9. Números do programa e permissões.
const st = await one(`select * from public.loyalty_program_stats()`);
assert.ok(Number(st.issued) >= 4705);
for (const fn of ["loyalty_balance(uuid)", "loyalty_max_redeem(uuid,numeric)", "apply_loyalty_redemption(uuid,uuid,integer)", "loyalty_expire_points(uuid)", "loyalty_program_stats()"]) {
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await one(`select has_function_privilege('${role}', 'public.${fn}', 'execute') ok`)).ok, false, `${role} executa ${fn}`);
  }
}
console.log("ok números do programa e funções restritas ao service_role");
console.log("TODOS OS TESTES PASSARAM");
