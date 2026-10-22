"""Creates and removes its own PostgreSQL cluster; never accepts an external DSN."""
import os
import pwd
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = Path(tempfile.mkdtemp(prefix='mci-0002-'))
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
    return run(PSQL, input=text, capture_output=True).stdout

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
    for name in ['0001_catalog.up.sql', '0002_save_product.up.sql']:
        run(PSQL + ['-f', str(ROOT/'supabase/proposed/revisao'/name)], stdout=subprocess.DEVNULL)
    run(PSQL + ['-f', str(ROOT/'supabase/tests/0002_save_product.test.sql')], stdout=subprocess.DEVNULL)
    # Two real PostgreSQL connections: lock held by one admin RPC while stale RPC waits.
    auth = "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);"
    pid, version = sql("select id,row_version from public.products where sku='BASE';").splitlines()[2].strip().split('|')
    pid, version = pid.strip(), version.strip()
    lock_sql = auth + f"begin; select public.save_product('{pid}',{version},test.payload()); select pg_sleep(2); commit;"
    first = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV, preexec_fn=demote)
    first.stdin.write(lock_sql)
    first.stdin.close()
    # Wait until the first transaction holds its parent lock, not a blind sleep.
    import time
    for _ in range(100):
        if '1' == sql("select count(*) from pg_stat_activity where wait_event='PgSleep';").splitlines()[2].strip():
            break
        time.sleep(.03)
    else:
        raise RuntimeError('Concurrent writer did not acquire lock')
    sql(auth + f"select test.reject(test.payload(),'40001','concorrência: segunda RPC desatualizada','{pid}',{version});")
    if first.wait() != 0:
        raise RuntimeError(first.stderr.read())
    print('PASS: concorrência com duas conexões reais')
    version = sql(f"select row_version from public.products where id='{pid}';").splitlines()[2].strip()
    first = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV, preexec_fn=demote)
    first.stdin.write(auth + f"begin; update public.product_specs set value='Concorrente' where product_id='{pid}'; select pg_sleep(2); commit;")
    first.stdin.close()
    for _ in range(100):
        if '1' == sql("select count(*) from pg_stat_activity where wait_event='PgSleep';").splitlines()[2].strip():
            break
        time.sleep(.03)
    else:
        raise RuntimeError('Direct child writer did not acquire lock')
    sql(auth + f"select test.reject(test.payload(),'40001','concorrência: filho direto invalida RPC','{pid}',{version});")
    if first.wait() != 0:
        raise RuntimeError(first.stderr.read())
    print('PASS: escrita filha concorrente invalida snapshot RPC')
    def wait_sleep(label):
        for _ in range(200):
            if '1' == sql("select count(*) from pg_stat_activity where wait_event='PgSleep';").splitlines()[2].strip():
                return
            time.sleep(.03)
        raise RuntimeError(label + ': concurrent session did not start')

    def current_version():
        return sql(f"select row_version from public.products where id='{pid}';").splitlines()[2].strip()

    # Deadlock scenarios: session A already holds an EXISTING child row lock and only
    # afterwards updates/deletes it (its trigger then needs the parent). Session B runs
    # save_product meanwhile. Before the fix B held the parent and waited on the child
    # -> 40P01. Now B must wait, A must commit, and B must fail cleanly with 40001.
    scenarios = [
        ('UPDATE spec', f"select 1 from public.product_specs where product_id='{pid}' for update", f"update public.product_specs set value='Concorrente 2' where product_id='{pid}'"),
        ('DELETE spec', f"select 1 from public.product_specs where product_id='{pid}' for update", f"delete from public.product_specs where product_id='{pid}'"),
        ('UPDATE image', f"select 1 from public.product_images where product_id='{pid}' for update", f"update public.product_images set url='https://example.test/c.jpg' where product_id='{pid}'"),
        ('DELETE image', f"select 1 from public.product_images where product_id='{pid}' and position=1 for update", f"delete from public.product_images where product_id='{pid}' and position=1"),
        ('UPDATE customer price', f"select 1 from public.product_prices where product_id='{pid}' for update", f"update public.product_prices set customer_price=120 where product_id='{pid}'"),
        ('UPDATE reseller price', f"select 1 from public.product_reseller_prices where product_id='{pid}' for update", f"update public.product_reseller_prices set reseller_price=60 where product_id='{pid}'"),
    ]
    two_images = "test.payload() || jsonb_build_object('images', jsonb_build_array(jsonb_build_object('url','https://example.test/0.jpg','position',0), jsonb_build_object('url','https://example.test/1.jpg','position',1)))"
    for label, lock, write in scenarios:
        sql(auth + f"select public.save_product('{pid}',{current_version()},{two_images});")
        version = current_version()
        a = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV, preexec_fn=demote)
        a.stdin.write(auth + f"begin; {lock}; select pg_sleep(1.5); {write}; commit;")
        a.stdin.close()
        wait_sleep(label)
        b = subprocess.run(PSQL, input=auth + f"select public.save_product('{pid}',{version},test.payload());", capture_output=True, text=True, env=ENV, preexec_fn=demote)
        a_err = a.stderr.read(); a_code = a.wait()
        if 'deadlock' in (a_err + b.stderr).lower():
            raise RuntimeError(f'FAIL: deadlock em {label}: {a_err} {b.stderr}')
        if a_code != 0:
            raise RuntimeError(f'FAIL: escrita direta falhou em {label}: {a_err}')
        if b.returncode == 0 or 'Conflito de vers' not in b.stderr:
            raise RuntimeError(f'FAIL: RPC deveria falhar com 40001 em {label}: {b.stderr}')
        if int(current_version()) <= int(version):
            raise RuntimeError(f'FAIL: versão não avançou em {label}')
        print(f'PASS: sem deadlock, 40001 limpo: {label} direto vs save_product')

    # Reverse order: RPC holds the aggregate, direct child write waits and then applies.
    version = current_version()
    a = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV, preexec_fn=demote)
    a.stdin.write(auth + f"begin; select public.save_product('{pid}',{version},test.payload()); select pg_sleep(1.5); commit;")
    a.stdin.close()
    wait_sleep('RPC first')
    sql(auth + f"update public.product_prices set customer_price=130 where product_id='{pid}';")
    if a.wait() != 0:
        raise RuntimeError(a.stderr.read())
    assert sql(f"select customer_price from public.product_prices where product_id='{pid}';").splitlines()[2].strip() == '130.00'
    print('PASS: RPC primeiro, escrita direta espera e aplica sem deadlock')

    # RPC that fails after waiting leaves nothing; a second RPC with the SAME version then wins.
    version = current_version()
    before = sql(f"select p.name,p.row_version,pr.customer_price,(select count(*) from public.product_images where product_id=p.id) from public.products p join public.product_prices pr on pr.product_id=p.id where p.id='{pid}';")
    a = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV, preexec_fn=demote)
    a.stdin.write(auth + f"begin; select public.save_product('{pid}',{version},jsonb_set(test.payload(),'{{name}}','\"Revertido\"')); select pg_sleep(1.5); rollback;")
    a.stdin.close()
    wait_sleep('rollback first')
    assert sql(f"select name from public.products where id='{pid}';").splitlines()[2].strip() != 'Revertido'
    sql(auth + f"select public.save_product('{pid}',{version},jsonb_set(test.payload(),'{{name}}','\"Vencedor\"'));")
    a.wait()
    assert sql(f"select name from public.products where id='{pid}';").splitlines()[2].strip() == 'Vencedor'
    assert before != sql(f"select p.name,p.row_version,pr.customer_price,(select count(*) from public.product_images where product_id=p.id) from public.products p join public.product_prices pr on pr.product_id=p.id where p.id='{pid}';")
    print('PASS: transação revertida não consome versão; mesma versão é aceita depois')

    # Non-destructive down/up: product rows and versions must not change.
    before = sql('select id,row_version from public.products order by id;')
    for name in ['0002_save_product.down.sql','0002_save_product.up.sql']:
        run(PSQL + ['-f', str(ROOT/'supabase/proposed/revisao'/name)], stdout=subprocess.DEVNULL)
    assert sql('select id,row_version from public.products order by id;') == before
    print('PASS: down/up preserva produtos e versões')
    print('All tests ran on a disposable LOCAL PostgreSQL cluster. No Supabase calls.')
finally:
    if started:
        run(PREFIX + ['pg_ctl','-D',str(TMP/'data'),'-m','immediate','-w','stop'], stdout=subprocess.DEVNULL)
    shutil.rmtree(TMP)
