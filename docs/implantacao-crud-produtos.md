# Implantação — CRUD administrativo de produtos (dev/staging)

Nada foi aplicado em produção. Nenhum SQL executado, nenhum serviço reiniciado.

## Arquivos (pasta `backend/`)
- `migrations/001_products_versioning.up.sql` / `.down.sql` — SQL revisado.
- `src/errors.ts` — `AppError`, `mapOracleError`, `oracleInfo` (só código ORA + constraint).
- `src/tx.ts` — `withTransaction` (commit no fim, rollback em erro).
- `src/adminProducts.ts` — `GET /admin/products`, `GET/PATCH /admin/products/:id`, `PUT /admin/products/:id/pricing`, `POST /admin/products/:id/publish` (com `rowVersion`).
- `src/app.ts` — `requestId` (UUID) no corpo e em `x-request-id`; erro único `{ error, code, requestId, fields? }`; logs só com códigos. Rotas admin novas só são registradas se `buildApp({ admin: { requireAdmin } })` receber o preHandler.
- `test/unit/errors.test.ts` — 9 testes sem banco.
- `test/integration/admin-products.test.ts` — os 19 testes; recusa rodar sem `NODE_ENV=test` + `STAGING_DB_CONFIRM=isolated`, ou se a connect string contiver "prod".

## Pontos que dependem do código da VPS (não está neste repositório)
1. **Autenticação**: `requireAdmin` deve ser o preHandler do login admin já existente (define `req.adminId`, 401/403). Não foi recriado.
2. **Rota publish**: a nova substitui a atual da VPS e passa a exigir `{ rowVersion }` — o frontend precisa enviar a versão (mudança coordenada).
3. **Colunas**: INSERTs de specs/imagens assumem `SPEC_ID`/ID de imagem com default/identity; fixture dos testes pode precisar de `CREATED_BY`, `SOURCE_URL_HASH`, `IMPORTED_AT` se forem NOT NULL.

## Compatibilidade backend × esquema
| Cenário | Resultado |
|---|---|
| Migration aplicada, backend atual | Compatível: código atual não lista colunas novas em INSERT; `UPDATED_AT`/`ROW_VERSION` recebem DEFAULT. Verificar se algum INSERT da VPS usa `INSERT ... SELECT *` ou lista posicional sem nomes de colunas (quebraria). |
| Backend novo, sem migration | **Incompatível**: SELECT de `ROW_VERSION` falha (ORA-00904 → 500). Por isso a ordem é migration → backend. |
| Rollback do banco com backend novo ativo | Incompatível: voltar o backend antes do DOWN. |

## Ordem de implantação (staging)
1. Confirmar que o staging é isolado (ver "Pendências de confirmação").
2. Rodar pré-checagens do `up.sql` e ajustar o tipo de `UPDATED_AT`.
3. Aplicar `001_products_versioning.up.sql`; conferir as 2 contagens finais = 0.
4. No repositório da API: copiar os arquivos acima, ligar `requireAdmin` real, `npm run typecheck && npm test`.
5. `STAGING_DB_CONFIRM=isolated DB_*=<staging> npm run test:integration`.
6. Subir o backend no staging; testar com o frontend apontado ao staging.
7. Produção: somente com sua aprovação explícita, repetindo 2→3→6.

## Rollback
1. Voltar o backend para a versão anterior (e o frontend, se já enviar `rowVersion`).
2. Aplicar `001_products_versioning.down.sql`.
3. Perde-se apenas `UPDATED_AT`/`ROW_VERSION` de produtos e `ROW_VERSION` de preços.

## Resultados
| Verificação | Resultado |
|---|---|
| Typecheck do backend (`tsc --noEmit`) | OK |
| Testes unitários (9) | 9 aprovados |
| Testes de integração (19) | **Não executados** — este ambiente não tem acesso a nenhum banco Oracle (staging ou produção) |
| Isolamento do staging | **Não confirmado** — não tenho acesso às credenciais nem ao servidor |

## Investigação do erro ao salvar (SKU 5542) — não executada
Sem acesso ao Oracle nem aos logs da VPS. Nada foi reimportado nem alterado. Para rodar você mesmo (somente leitura):
```sql
SELECT PRODUCT_ID, STATUS, CREATED_AT, IMPORTED_AT FROM MCI_PRODUCTS WHERE SKU_NORMALIZED = '5542';
SELECT COLUMN_NAME, NULLABLE, DATA_TYPE, DATA_LENGTH, CHAR_USED FROM USER_TAB_COLUMNS
 WHERE TABLE_NAME = 'MCI_PRODUCTS' ORDER BY COLUMN_ID;
```
```bash
# na VPS, ajuste o serviço e o horário da falha; só códigos, sem corpo/token
journalctl -u mci-api --since "AAAA-MM-DD HH:MM" --until "AAAA-MM-DD HH:MM" | grep -Eo '(ORA|NJS)-[0-9]+[^"]{0,80}'
# ou: pm2 logs mci-api --lines 2000 --nostream | grep -E 'ORA-|NJS-'
```
As hipóteses (specs vazias em `executeMany`, `brand` vazio = NULL, SKU duplicado sem 409, colunas NOT NULL, gravação parcial) continuam hipóteses até esse resultado.
