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
    first = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, env=ENV)
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
