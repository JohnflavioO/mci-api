# Revisão técnica — migration 0001 (v1 → v2)

Os testes rodaram num PostgreSQL local descartável, com os papéis `anon`, `authenticated` e `service_role` e um `auth.uid()` simulados. **Nada foi executado no Supabase.**

## Problemas da v1
| Gravidade | Problema | Correção na v2 |
|---|---|---|
| Crítica | A checagem de publicação dava erro de sintaxe ao montar a lista de campos faltantes (`missing \|\| 'sku'`: "malformed array literal"). O banco bloqueava, mas com um erro sem sentido. | `array_append`: o banco agora devolve "Produto publicado incompleto: sku, category, …" |
| Alta | O visitante anônimo via `created_by`, `updated_by` e `source_url` (IDs dos admins e a origem da importação). O RLS não esconde colunas. | Esses campos foram movidos para `product_admin_meta`, que só o admin acessa |
| Alta | Os limites de 100 specs/20 imagens, a regra revenda ≤ cliente e a publicação podiam ser furados por transações simultâneas, porque cada uma conta sem ver a outra. | Os triggers dos filhos travam a linha do produto (`FOR UPDATE`) e serializam as gravações |
| Média | Um admin podia gravar `created_by` com o ID de outra pessoa. | A autoria é preenchida pelo banco; o valor enviado é ignorado |
| Média | `has_role(uuid, role)` deixava qualquer usuário logado descobrir quem é admin. | Virou `has_role(role)`, que consulta só o próprio `auth.uid()` |
| Baixa | Mover uma spec/imagem para outro produto (`UPDATE product_id`) driblava as checagens. | Bloqueado por trigger |
| Baixa | O `down` usava CASCADE e podia apagar em silêncio objetos criados depois. | Sem CASCADE: o script para com erro |

## Pendências (não corrigidas: precisam de decisão)
- **Versão vs. specs/imagens:** editar só as specs ou imagens não muda a `row_version` do produto. A proteção completa contra conflito exige uma função `save_product(id, row_version, dados)` que grave tudo numa só transação. Ela fica para a migration 0002.
- **Compatibilidade com o frontend:** os serviços atuais esperam o formato da API Oracle (`customerPrice`, `resellerPrice`, `images[{url,position}]`, `rowVersion`). Com o Supabase, `catalog.ts` e `adminProducts.ts` vão precisar de um adaptador novo (tabelas separadas → mesmo modelo de tela). Essa mudança é explícita, não automática, e os testes atuais continuam valendo para o modelo de tela.
- **Primeiro admin:** o comando no fim do `up` busca o ID real em `auth.users` pelo e-mail. Rode no SQL Editor depois de criar e confirmar o usuário.

## Testes executados (v2)
Todos passaram:
- `up`, `down` e `up` de novo, sem erro.
- Publicar incompleto falha e lista os campos faltantes. Produto completo publicado numa transação passa.
- Apagar a última imagem de um publicado falha. Revenda > cliente falha. SKU repetido (`s1`/`S1`) falha.
- `row_version`: um update com a versão certa passa (2→3); repetir com a versão antiga afeta 0 linhas.
- Usuário comum:
  - não consegue se dar admin (permissão negada);
  - não altera produtos (0 linhas);
  - não lê o preço de revenda;
  - `has_role` não revela papéis de terceiros.
- Visitante anônimo:
  - vê só o produto publicado, com preço, specs e imagens;
  - não tem acesso ao preço de revenda nem aos metadados.
- A falsificação de autoria é ignorada.
- **Não testado:** concorrência real com duas sessões simultâneas. O travamento foi revisado no código, mas não foi exercitado.
