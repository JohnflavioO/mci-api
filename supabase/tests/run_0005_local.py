"""Creates and removes its own PostgreSQL cluster; never accepts an external DSN."""
import os
import pwd
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = Path(tempfile.mkdtemp(prefix='mci-0005-'))
# initdb cannot run as root. An isolated unprivileged system user is required.
USER = 'pgt' if os.geteuid() == 0 else pwd.getpwuid(os.getuid()).pw_name
account = pwd.getpwnam(USER)
if os.geteuid() == 0:
    os.chown(TMP, account.pw_uid, account.pw_gid)
PREFIX = []
ENV = {k: v for k, v in os.environ.items() if not k.startswith('PG')}

def demote():
    if os.geteuid() == 0:
        os.setgroups([])
        os.setgid(account.pw_gid)
        os.setuid(account.pw_uid)

def run(args, **kw):
    return subprocess.run(args, env=ENV, check=True, text=True, preexec_fn=demote, **kw)

def sql(text):
    r = subprocess.run(PSQL, env=ENV, text=True, preexec_fn=demote, input=text, capture_output=True)
    if r.returncode: raise SystemExit(r.stderr[-800:])
    return r.stdout

started = False
try:
    run(PREFIX + ['initdb', '-D', str(TMP/'data'), '-A', 'trust', '--no-locale'], stdout=subprocess.DEVNULL)
    run(PREFIX + ['pg_ctl', '-D', str(TMP/'data'), '-l', str(TMP/'server.log'), '-o', f'-k {TMP} -p 55432 -c listen_addresses= -c fsync=off', '-w', 'start'], stdout=subprocess.DEVNULL)
    started = True
    PSQL = ['psql', '-X', '-h', str(TMP), '-p', '55432', '-U', USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    sql("""create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
""")
    for name in ['0001_catalog.up.sql', '0002_save_product.up.sql', '0004_product_stock.up.sql', '0005_orders_payments.up.sql']:
        run(PSQL + ['-f', str(ROOT/'supabase/proposed/revisao'/name)], stdout=subprocess.DEVNULL)
    run(PSQL + ['-f', str(ROOT/'supabase/tests/0002_save_product.test.sql')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = subprocess.run(PSQL + ['-f', str(ROOT/'supabase/tests/0005_orders_payments.test.sql')], env=ENV, text=True, preexec_fn=demote, capture_output=True)
    if out.returncode: print(out.stderr[-1500:]); raise SystemExit(1)
    passes = out.stderr.count('PASS:'); print('SQL 0005:', passes, 'PASS')
    # Compras simultâneas: dois pedidos pagos ao mesmo tempo disputando 1 unidade de cada produto.
    svc = "set role service_role;"
    def val(q):
        r = subprocess.run(PSQL + ['-At', '-q'], env=ENV, text=True, preexec_fn=demote, input=q, capture_output=True)
        if r.returncode: raise SystemExit(r.stderr[-800:])
        return r.stdout.strip().splitlines()[-1].strip()
    def mk(k):
        return val(svc + f"select test.order_('{k}',1,1);")
    o1, o2 = mk('00000000-0000-0000-0000-00000000c001'), mk('00000000-0000-0000-0000-00000000c002')
    total = val("select total from public.orders where id='%s';" % o1)
    procs = [subprocess.Popen(PSQL, env=ENV, text=True, preexec_fn=demote, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
             for _ in range(2)]
    for p, (o, ch) in zip(procs, [(o1,'ch_c1'), (o2,'ch_c2')]):
        p.stdin.write(svc + f"begin; select public.apply_payment_status('{o}','pagarme','{ch}','paid','ev_{ch}',{total}); select pg_sleep(1); commit;\n"); p.stdin.close()
    for p in procs: p.wait(); assert p.returncode == 0, p.stderr.read()
    st = val(f"select string_agg(status::text, ',' order by status::text) from public.orders where id in ('{o1}','{o2}');")
    stock = val("select string_agg(stock_quantity::text, ',') from public.products where sku in ('P5A','P5B');")
    assert st == 'paid,refund_required' and stock == '0,0', (st, stock)
    print('concorrência: um pago, outro reembolso necessário, estoque 0 sem negativo')
    run(PSQL + ['-f', str(ROOT/'supabase/proposed/revisao/0005_orders_payments.down.sql')], stdout=subprocess.DEVNULL)
    left = val("select count(*) from pg_tables where tablename in ('orders','order_items','payment_events');")
    prods = val("select count(*) from public.products where sku in ('P5A','P5B');")
    assert left == '0' and prods == '2', (left, prods)
    run(PSQL + ['-f', str(ROOT/'supabase/proposed/revisao/0005_orders_payments.up.sql')], stdout=subprocess.DEVNULL)
    print('down/up: tabelas removidas, produtos preservados, reaplicação OK')
finally:
    if started:
        run(PREFIX + ['pg_ctl','-D',str(TMP/'data'),'-m','immediate','-w','stop'], stdout=subprocess.DEVNULL)
    shutil.rmtree(TMP)
