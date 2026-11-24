// Teste das migrations de afiliados (fases 1 e 2) num Postgres em memória (PGlite). Não toca em banco real.
// Como rodar (de uma pasta temporária, para não adicionar dependência ao projeto):
//   mkdir pgtest && cd pgtest && npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <repo>/supabase/tests/affiliate_payouts.pglite.mjs . && node affiliate_payouts.pglite.mjs <repo>/supabase/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MIG = process.argv[2];
const read = (f) => readFileSync(`${MIG}/${f}`, "utf8");
const db = new PGlite();

// Stub mínimo do que existe no Supabase antes dos afiliados.
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  create type public.app_role as enum ('admin','revendedor','cliente');
  create table public.user_roles (user_id uuid, role public.app_role, unique(user_id, role));
  create function public.has_role(_role public.app_role) returns boolean language sql as $$ select false $$;
  create table public.products (id uuid primary key, name text, status text default 'published');
  create type public.order_status as enum ('pending_payment','paid','rejected','cancelled','refund_required','refunded');
  create table public.orders (id uuid primary key default gen_random_uuid(), user_id uuid, idempotency_key uuid,
    total numeric(12,2) not null default 0, status public.order_status not null default 'pending_payment',
    created_at timestamptz not null default now());
  create table public.order_items (order_id uuid, product_id uuid, unit_price numeric(12,2), qty int, line_total numeric(12,2));
  -- create_order de teste: itens = [{product_id, unit_price, qty}]
  create function public.create_order(p_user_id uuid, p_idempotency_key uuid, p_items jsonb) returns uuid
  language plpgsql as $$ declare v uuid; begin
    insert into public.orders(user_id, idempotency_key) values (p_user_id, p_idempotency_key) returning id into v;
    insert into public.order_items select v, (i->>'product_id')::uuid, (i->>'unit_price')::numeric, (i->>'qty')::int, null from jsonb_array_elements(p_items) i;
    update public.orders set total = (select sum(unit_price*qty) from public.order_items where order_id = v) where id = v;
    return v; end $$;
`);
for (const f of [
  "20261103150000_affiliate_foundation.sql",
  "20261104100000_affiliate_dual_points.sql",
  "20261104150000_affiliate_attribution_tracking.sql",
  "20261104160000_affiliate_attribution_indexes_and_discount_flags.sql",
  "20261124120000_affiliate_weighted_commission.sql",
  "20261124160000_affiliate_payouts.sql",
]) {
  // PGlite não aceita ALTER TYPE ... ADD VALUE dentro do mesmo script com uso posterior; roda separado.
  await db.exec(read(f));
  console.log("ok", f);
}
// Aplicar de novo a migration da fase 2 precisa ser seguro (idempotente).
await db.exec(read("20261124160000_affiliate_payouts.sql"));
console.log("ok reaplicação da fase 2");

const AFF = "11111111-1111-4111-8111-111111111111", BUY = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333", P2 = "44444444-4444-4444-8444-444444444444";
await db.exec(`
  insert into auth.users values ('${AFF}','aff@x.test','{"registration_type":"afiliado","cpf":"111"}'), ('${BUY}','buy@x.test','{"cpf":"222"}');
  insert into public.affiliate_profiles(user_id, referral_code) values ('${AFF}','aff') on conflict do nothing;
  insert into public.products(id,name) values ('${P1}','A'), ('${P2}','B');
  update public.products set affiliate_pct = 20 where id = '${P1}';  -- P2 usa o padrão (10%)
  insert into public.affiliate_links(id, affiliate_id, product_id, slug) values ('55555555-5555-4555-8555-555555555555','${AFF}','${P1}','abcdefgh');
  insert into public.link_clicks(link_id, visitor_id) values ('55555555-5555-4555-8555-555555555555','visitor-0123456789abcdef');
`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];

let n = 0;
async function order(items) {
  n += 1;
  const key = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const r = await one(`select public.create_order_with_affiliate('${BUY}','${key}','${JSON.stringify(items)}'::jsonb,
    '55555555-5555-4555-8555-555555555555','visitor-0123456789abcdef') id`);
  return r.id;
}
const pay = (id) => db.exec(`update public.orders set status='paid' where id='${id}'`);
const age = (id, days) => db.exec(`update public.affiliate_commissions set created_at = now() - interval '${days} days' where order_id='${id}'`);
const bal = () => one(`select * from public.affiliate_balance('${AFF}')`);
const expectError = async (sql, msg) => { await assert.rejects(db.exec(sql), (e) => e.message.includes(msg)); };

// 1. Fase 1: média ponderada. 100 em P1 (20%) + 300 em P2 (10%) = (20+30)/400 = 12,5%.
const o1 = await order([{ product_id: P1, unit_price: 100, qty: 1 }, { product_id: P2, unit_price: 100, qty: 3 }]);
assert.equal(Number((await one(`select commission_pct_applied p from public.orders where id='${o1}'`)).p), 12.5);
await pay(o1);
let c1 = await one(`select * from public.affiliate_commissions where order_id='${o1}'`);
assert.equal(Number(c1.commission_amount), 50);
assert.equal(c1.status, "pending");
console.log("ok comissão ponderada R$ 50 pendente");

// 2. Liberação: antes do prazo continua pendente; depois de 7 dias vira disponível.
assert.equal((await one(`select public.release_affiliate_commissions() n`)).n, 0);
await age(o1, 8);
assert.equal((await one(`select public.release_affiliate_commissions() n`)).n, 1);
assert.equal(Number((await bal()).withdrawable), 50);
console.log("ok liberação após o prazo");

// 3. Saque: sem Pix falha; abaixo do mínimo falha; com Pix e saldo >= 50 cria saque.
await expectError(`select public.request_affiliate_payout('${AFF}')`, "AFF_NO_PIX_KEY");
await db.exec(`update public.affiliate_profiles set payout_pix_key='aff@x.test' where user_id='${AFF}'`);
await db.exec(`update public.affiliate_settings set min_withdrawal = 60`);
await expectError(`select public.request_affiliate_payout('${AFF}')`, "AFF_BELOW_MINIMUM");
await db.exec(`update public.affiliate_settings set min_withdrawal = 50`);
const p1 = await one(`select * from public.request_affiliate_payout('${AFF}')`);
assert.equal(Number(p1.amount), 50);
await expectError(`select public.request_affiliate_payout('${AFF}')`, "AFF_OPEN_PAYOUT");
let b = await bal();
assert.equal(Number(b.withdrawable), 0); assert.equal(Number(b.in_payout), 50);
console.log("ok pedido de saque R$ 50 e bloqueio de saque duplicado");

// 4. Recusa devolve o saldo; novo pedido e pagamento marcam a comissão como paga.
await expectError(`select public.reject_affiliate_payout('${p1.id}','${AFF}','  ')`, "AFF_REASON_REQUIRED");
await db.exec(`select public.reject_affiliate_payout('${p1.id}','${AFF}','Chave Pix errada')`);
assert.equal(Number((await bal()).withdrawable), 50);
const p2 = await one(`select * from public.request_affiliate_payout('${AFF}')`);
await db.exec(`select public.mark_affiliate_payout_paid('${p2.id}','${AFF}','E2E-123')`);
await expectError(`select public.mark_affiliate_payout_paid('${p2.id}','${AFF}','x')`, "AFF_PAYOUT_CLOSED");
c1 = await one(`select * from public.affiliate_commissions where order_id='${o1}'`);
assert.equal(c1.status, "paid"); assert.equal(c1.payment_reference, "E2E-123");
b = await bal(); assert.equal(Number(b.paid), 50); assert.equal(Number(b.withdrawable), 0);
console.log("ok recusa devolve saldo; pagamento registra referência");

// 5. Estorno antes do saque: comissão vira 'reversed' e não entra no saldo.
const o2 = await order([{ product_id: P2, unit_price: 200, qty: 1 }]);  // 10% = 20
await pay(o2); await age(o2, 8);
await db.exec(`update public.orders set status='refunded' where id='${o2}'`);
assert.equal((await one(`select status from public.affiliate_commissions where order_id='${o2}'`)).status, "reversed");
await db.exec(`select public.release_affiliate_commissions()`);
assert.equal(Number((await bal()).withdrawable), 0);
console.log("ok estorno antes do saque anula a comissão");

// 6. Estorno depois de pago: vira ajuste negativo, descontado do próximo saque.
await db.exec(`update public.orders set status='refunded' where id='${o1}'`);
b = await bal(); assert.equal(Number(b.adjustments), -50); assert.equal(Number(b.withdrawable), -50);
const o3 = await order([{ product_id: P1, unit_price: 600, qty: 1 }]);  // 20% = 120
await pay(o3); await age(o3, 8);
await db.exec(`select public.release_affiliate_commissions()`);
const p3 = await one(`select * from public.request_affiliate_payout('${AFF}')`);
assert.equal(Number(p3.amount), 70);  // 120 - 50
console.log("ok estorno após pagamento desconta no próximo saque (120 - 50 = 70)");

// 7. Estorno durante saque aberto e depois recusa: ajuste some e comissão vira 'reversed'.
await db.exec(`update public.orders set status='refunded' where id='${o3}'`);
assert.equal(Number((await bal()).adjustments), -120);
await db.exec(`select public.reject_affiliate_payout('${p3.id}','${AFF}','teste')`);
assert.equal((await one(`select status from public.affiliate_commissions where order_id='${o3}'`)).status, "reversed");
b = await bal(); assert.equal(Number(b.adjustments), -50); assert.equal(Number(b.withdrawable), -50);
console.log("ok estorno durante saque recusado não desconta duas vezes");

// 8. Afiliado suspenso não pede saque.
await db.exec(`update public.affiliate_profiles set status='suspended' where user_id='${AFF}'`);
await expectError(`select public.request_affiliate_payout('${AFF}')`, "AFF_SUSPENDED");
console.log("ok suspenso não saca");

// 9. Permissões: anon/authenticated não executam as funções financeiras.
for (const fn of ["release_affiliate_commissions()", "affiliate_balance(uuid)", "request_affiliate_payout(uuid)",
  "mark_affiliate_payout_paid(uuid,uuid,text)", "reject_affiliate_payout(uuid,uuid,text)"]) {
  for (const role of ["anon", "authenticated"]) {
    const r = await one(`select has_function_privilege('${role}', 'public.${fn}', 'execute') ok`);
    assert.equal(r.ok, false, `${role} executa ${fn}`);
  }
}
console.log("ok funções restritas ao service_role");
console.log("TODOS OS TESTES PASSARAM");
