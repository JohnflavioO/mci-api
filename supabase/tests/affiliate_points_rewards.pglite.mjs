// Teste da fase 3 de afiliados (pontos e recompensas) num Postgres em memória (PGlite). Não toca em banco real.
// Como rodar (de uma pasta temporária, para não adicionar dependência ao projeto):
//   mkdir pgtest && cd pgtest && npm init -y && npm i @electric-sql/pglite@0.2.17
//   cp <repo>/supabase/tests/affiliate_points_rewards.pglite.mjs . && node affiliate_points_rewards.pglite.mjs <repo>/supabase/migrations
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const MIG = process.argv[2];
const read = (f) => readFileSync(`${MIG}/${f}`, "utf8");
const db = new PGlite();

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
]) await db.exec(read(f));

const AFF = "11111111-1111-4111-8111-111111111111", BUY = "22222222-2222-4222-8222-222222222222", ADM = "99999999-9999-4999-8999-999999999999";
const P = "33333333-3333-4333-8333-333333333333", LINK = "55555555-5555-4555-8555-555555555555";
await db.exec(`
  insert into auth.users values ('${AFF}','aff@x.test','{"cpf":"111"}'), ('${BUY}','buy@x.test','{"cpf":"222"}'), ('${ADM}','adm@x.test','{}');
  insert into public.affiliate_profiles(user_id, referral_code, payout_pix_key) values ('${AFF}','aff','aff@x.test');
  insert into public.products(id,name) values ('${P}','A');
  insert into public.affiliate_links(id, affiliate_id, product_id, slug) values ('${LINK}','${AFF}','${P}','abcdefgh');
  insert into public.link_clicks(link_id, visitor_id) values ('${LINK}','visitor-0123456789abcdef');
  update public.affiliate_settings set default_commission_pct = 10, performance_points_per_real = 1, reward_points_per_real = 0.5, reward_points_enabled = true;
`);
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const pts = async () => { const r = await one(`select * from public.affiliate_points_balance('${AFF}')`); return { perf: r.performance, reward: r.reward }; };
const expectError = async (sql, msg) => { await assert.rejects(db.exec(sql), (e) => e.message.includes(msg)); };
let n = 0;
async function paidOrder(value) {
  n += 1;
  const key = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const { id } = await one(`select public.create_order_with_affiliate('${BUY}','${key}','[{"product_id":"${P}","unit_price":${value},"qty":1}]'::jsonb,'${LINK}','visitor-0123456789abcdef') id`);
  await db.exec(`update public.orders set status='paid' where id='${id}'`);
  return id;
}
const release = async (id) => {
  await db.exec(`update public.affiliate_commissions set created_at = now() - interval '8 days' where order_id='${id}'`);
  await db.exec(`select public.release_affiliate_commissions()`);
};

// Venda que já existia antes da fase 3: o preenchimento retroativo credita os pontos.
const old = await paidOrder(400);
await release(old);
await db.exec(read("20261126100000_affiliate_points_rewards.sql"));
assert.deepEqual(await pts(), { perf: 400, reward: 200 });
await db.exec(read("20261126100000_affiliate_points_rewards.sql")); // reaplicar não duplica
assert.deepEqual(await pts(), { perf: 400, reward: 200 });
console.log("ok migration credita vendas antigas e pode ser reaplicada sem duplicar");

// 1. Pagamento: desempenho entra na hora; recompensa só na liberação.
const o1 = await paidOrder(1000);
assert.deepEqual(await pts(), { perf: 1400, reward: 200 });
await release(o1);
assert.deepEqual(await pts(), { perf: 1400, reward: 700 });
await db.exec(`select public.release_affiliate_commissions()`); // liberar de novo não duplica
assert.deepEqual(await pts(), { perf: 1400, reward: 700 });
console.log("ok desempenho no pagamento, recompensa na liberação, sem duplicar");

// 2. Estorno antes da liberação: tira só o desempenho (recompensa nunca entrou).
const o2 = await paidOrder(300);
assert.equal((await pts()).perf, 1700);
await db.exec(`update public.orders set status='refunded' where id='${o2}'`);
assert.deepEqual(await pts(), { perf: 1400, reward: 700 });
console.log("ok estorno antes da liberação retira o desempenho");

// 3. Estorno depois da liberação: tira os dois.
await db.exec(`update public.orders set status='refunded' where id='${o1}'`);
assert.deepEqual(await pts(), { perf: 400, reward: 200 });
console.log("ok estorno depois da liberação retira desempenho e recompensa");

// 4. Recompensas: estoque, saldo, reserva e recusa.
const o3 = await paidOrder(2000); await release(o3);
assert.equal((await pts()).reward, 1200);
const { id: R } = await one(`insert into public.affiliate_reward_catalog (name, points_cost, stock_quantity) values ('Camiseta', 500, 1) returning id`);
const { id: BIG } = await one(`insert into public.affiliate_reward_catalog (name, points_cost) values ('Luminária', 5000) returning id`);
await expectError(`select public.request_affiliate_reward('${AFF}','${BIG}')`, "AFF_NOT_ENOUGH_POINTS");
const red = await one(`select * from public.request_affiliate_reward('${AFF}','${R}')`);
assert.equal(red.status, "requested");
assert.equal((await pts()).reward, 700);
assert.equal((await one(`select stock_quantity s from public.affiliate_reward_catalog where id='${R}'`)).s, 0);
await expectError(`select public.request_affiliate_reward('${AFF}','${R}')`, "AFF_REWARD_OUT_OF_STOCK");
console.log("ok resgate reserva pontos e estoque; bloqueia sem saldo e sem estoque");

await expectError(`select public.review_affiliate_reward('${red.id}','${ADM}','reject','  ')`, "AFF_REASON_REQUIRED");
await db.exec(`select public.review_affiliate_reward('${red.id}','${ADM}','reject','Tamanho indisponível')`);
assert.equal((await pts()).reward, 1200);
assert.equal((await one(`select stock_quantity s from public.affiliate_reward_catalog where id='${R}'`)).s, 1);
await expectError(`select public.review_affiliate_reward('${red.id}','${ADM}','approve')`, "AFF_REDEMPTION_CLOSED");
console.log("ok recusa devolve pontos e estoque e encerra o resgate");

const red2 = await one(`select * from public.request_affiliate_reward('${AFF}','${R}')`);
await db.exec(`select public.review_affiliate_reward('${red2.id}','${ADM}','approve')`);
const done = await one(`select * from public.review_affiliate_reward('${red2.id}','${ADM}','deliver','Enviado pelos Correios')`);
assert.equal(done.status, "delivered"); assert.ok(done.delivered_at);
assert.equal((await pts()).reward, 700);
console.log("ok aprovação e entrega mantêm os pontos debitados");

// 5. Suspenso não resgata; recompensa inativa não resgata.
await db.exec(`update public.affiliate_reward_catalog set active=false where id='${R}'`);
await expectError(`select public.request_affiliate_reward('${AFF}','${R}')`, "AFF_REWARD_UNAVAILABLE");
await db.exec(`update public.affiliate_profiles set status='suspended' where user_id='${AFF}'`);
await expectError(`select public.request_affiliate_reward('${AFF}','${BIG}')`, "AFF_SUSPENDED");
console.log("ok inativa e suspenso bloqueiam o resgate");

// 6. Permissões: anon/authenticated não executam as funções novas.
for (const fn of ["affiliate_points_balance(uuid)", "credit_affiliate_points_for_commission(uuid,text)", "reverse_affiliate_points_for_order(uuid)",
  "request_affiliate_reward(uuid,uuid)", "review_affiliate_reward(uuid,uuid,text,text)"]) {
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await one(`select has_function_privilege('${role}', 'public.${fn}', 'execute') ok`)).ok, false, `${role} executa ${fn}`);
  }
}
console.log("ok funções restritas ao service_role");
console.log("TODOS OS TESTES PASSARAM");
