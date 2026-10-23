# Provisionar o administrador (manual, uma vez)

Não depende de Oracle. O papel `admin` nunca é concedido pelo site: só por SQL executado por você,
no **SQL Editor do painel Supabase** (que roda como dono do banco). Nenhuma chave privada vai para o frontend.

1. Crie a conta normalmente em `/cadastro` (Cliente) e confirme o e-mail.
2. No SQL Editor, troque o e-mail e execute:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
where lower(email) = lower('SEU-EMAIL@exemplo.com')
on conflict (user_id, role) do nothing
returning user_id;   -- deve retornar exatamente 1 linha
```

3. Conferir: `select u.email from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin';`
4. Remover (se necessário): `delete from public.user_roles where role = 'admin' and user_id = (select id from auth.users where lower(email) = lower('SEU-EMAIL@exemplo.com'));`

Entre em `/entrar?admin=true`; o site confirma o papel com `has_role('admin')` no banco.
