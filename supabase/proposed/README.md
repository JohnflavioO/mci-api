# Migration 0001 — catálogo (PROPOSTA, não executada)

## Decisões de segurança
- **Preço de revenda isolado** em `product_reseller_prices`: `anon` não tem GRANT, e o RLS só libera para admin. Ele não aparece em nenhuma leitura pública.
- **Login ≠ admin**: o papel fica em `user_roles` (tabela separada) e é checado por `has_role()` (SECURITY DEFINER) dentro do RLS. Nenhuma política permite que o próprio usuário crie, altere ou apague papéis: o primeiro admin é inserido manualmente pelo painel.
- **Rascunhos invisíveis ao público**: o público só lê o que está `published`, e os preços, specs e imagens seguem o status do produto.
- **Regras no banco**: SKU único sem diferenciar maiúsculas; preços >= 0; revenda <= cliente; https nas imagens; limites de 100 specs e 20 imagens; um produto só fica publicado completo (checagem no fim da transação). Também vale para despublicar e depois tentar remover imagens/preços de um publicado.
- **Conflito de edição**: `row_version` e `updated_at` são incrementados por trigger. O frontend deve filtrar `.eq('row_version', v)` e tratar 0 linhas como conflito.

## Reversão
`0001_catalog.down.sql` desfaz tudo, mas **apaga todos os dados** dessas tabelas. Faça backup antes.

## Fora desta migration
- **Importação por link**: precisa de função no servidor (busca da página, extração e checagem de duplicidade por `source_url`/SKU). Ela não pode rodar no navegador. Será uma etapa separada.
- **Acesso de revendedores ao preço de revenda**: hoje só admin. Para liberar, basta uma política `has_role(auth.uid(),'revendedor')` em `product_reseller_prices`.
- **Publicação atômica com várias tabelas**: pode virar uma função RPC numa próxima migration.
