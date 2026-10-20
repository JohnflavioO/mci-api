# Proposta técnica — edição de produtos (aguarda aprovação)

Nenhuma migration executada, nenhum código de produção alterado. Complementa `docs/api-admin-produtos.md`.
Os itens abaixo **substituem** as partes daquele documento que falam em `archived`, `unpublish` e `version`.

## Fatos confirmados no Oracle (produção)
- `MCI_PRODUCTS_STATUS_CK`: só `draft` e `published` (habilitada e validada).
- `SKU_NORMALIZED` = coluna gerada `UPPER(TRIM(sku))`; `MCI_PRODUCTS_SKU_UQ` única (habilitada e validada).
- `MCI_PRODUCTS`: tem `CREATED_AT` e `IMPORTED_AT`; **não tem** `UPDATED_AT` nem versão.
- `MCI_PRODUCT_PRICING`: tem `UPDATED_AT` (só dos preços).

## 1. Status (sem mudar o esquema)
- Apenas `draft → published` (`POST /admin/products/:id/publish`, já existe) e `published → draft` (`POST /admin/products/:id/unpublish`, novo; só faz `UPDATE … SET STATUS='draft'`).
- `archived` fora do escopo até migration aprovada da constraint.
- Transição inválida (ex.: publicar algo já publicado) → 409.

## 2. Edição — `PATCH /admin/products/:id` (Bearer, papel admin)
Transação única (`autoCommit: false`, commit ao final, rollback em qualquer erro):
1. `SELECT … FROM MCI_PRODUCTS WHERE PRODUCT_ID = :id FOR UPDATE NOWAIT` → 404 se não existir; ORA-00054 (registro bloqueado) → 409 "Produto em edição por outra sessão".
2. Verificação de conflito (ver item 4).
3. `UPDATE MCI_PRODUCTS` só com os campos enviados (binds; `brand` string, nunca null).
4. `specs`/`images` enviados → `DELETE` + `INSERT` em lote (`executeMany`) da lista inteira.
5. Se o produto estiver `published`, revalidar requisitos de publicação após a edição → 422 se quebrar.

## 3. Preços — separados da edição do cadastro
- `PUT /admin/products/:id/pricing` `{ currency: "BRL", customerPrice, resellerPrice, expectedUpdatedAt }`.
- `MERGE INTO MCI_PRODUCT_PRICING … SET …, UPDATED_AT = SYSTIMESTAMP`.
- Já usa o `UPDATED_AT` existente para conflito: `WHERE PRODUCT_ID = :id AND UPDATED_AT = :expectedUpdatedAt`; 0 linhas → 409 "Preços alterados por outra pessoa".
- `resellerPrice` só retorna em rotas `/admin/*`; rotas públicas continuam sem ele.
- Regras: ≥0, 2 casas, `resellerPrice ≤ customerPrice`; ambos >0 se o produto estiver publicado.

## 4. Detecção de conflitos
| Caso | Como | HTTP |
|---|---|---|
| SKU duplicado | capturar `ORA-00001` cuja constraint é `MCI_PRODUCTS_SKU_UQ` | 409 `{ error: "Já existe um produto com este SKU." }` |
| Edição simultânea do cadastro | **hoje**: `FOR UPDATE NOWAIT` (só protege durante a transação; não detecta "sobrescrita perdida"). **Após migration**: `version` | 409 |
| Edição simultânea de preços | `UPDATED_AT` de `MCI_PRODUCT_PRICING` (já existe) | 409 |
| Status inválido | `ORA-02290` em `MCI_PRODUCTS_STATUS_CK` (defesa extra; validar antes com zod) | 422 |

Mensagem do Oracle nunca vai para a resposta.

## 5. Registro de erros internos
- `setErrorHandler` atual já responde 500 `{ error: "Erro interno" }`. Acrescentar:
  - `requestId` (gerado pelo Fastify) no corpo do 500 e no log, para cruzar o relato do usuário com o log.
  - Log estruturado: `{ requestId, route, adminId, oraCode (ex.: "ORA-01400"), constraint }` — **sem** payload, senha, token, preços nem SQL com valores.
  - Tradutor `mapOracleError(err)` → 409/422/500 conforme a tabela do item 4.
- Isso resolve a pendência do 500 em `POST /admin/products/import`: o próximo erro trará `requestId` + código ORA.

## 6. Mudanças de esquema necessárias (proposta — NÃO executar)
```sql
-- 1. Data de alteração do cadastro
ALTER TABLE MCI_PRODUCTS ADD (UPDATED_AT TIMESTAMP WITH TIME ZONE);
UPDATE MCI_PRODUCTS SET UPDATED_AT = CREATED_AT WHERE UPDATED_AT IS NULL;
ALTER TABLE MCI_PRODUCTS MODIFY (UPDATED_AT DEFAULT SYSTIMESTAMP NOT NULL);

-- 2. Versionamento otimista
ALTER TABLE MCI_PRODUCTS ADD (ROW_VERSION NUMBER(10) DEFAULT 1 NOT NULL);

-- 3. (opcional) quem alterou
ALTER TABLE MCI_PRODUCTS ADD (UPDATED_BY VARCHAR2(36));
```
- Ajustar o tipo de `UPDATED_AT` ao usado em `CREATED_AT`.
- Atualização passa a ser: `UPDATE MCI_PRODUCTS SET …, ROW_VERSION = ROW_VERSION + 1, UPDATED_AT = SYSTIMESTAMP WHERE PRODUCT_ID = :id AND ROW_VERSION = :version`; 0 linhas → 409 "Produto alterado por outra pessoa. Recarregue."
- Alterações em specs/imagens também incrementam `ROW_VERSION` do produto (mesma transação).
- Feito no backend (não por trigger), para manter a regra visível no código.
- Rollback: `ALTER TABLE MCI_PRODUCTS DROP (ROW_VERSION, UPDATED_AT, UPDATED_BY)`.

## 7. Frontend (após aprovação e backend pronto)
- `adminProducts.ts`: `update`, `updatePricing`, `unpublish`; enviar `version` / `expectedUpdatedAt`; 409 mostra a mensagem da API e oferece recarregar.
- Tela de edição reutilizando o formulário de `admin.importar.tsx`.
- Testes por regra: 409 SKU, 409 versão, 409 preços, 422 publicação.

## Ordem sugerida
1. Aprovar e executar a migration (item 6) fora do horário de pico.
2. Backend: tratador de erros + `mapOracleError` (item 5) — pode ir antes da migration.
3. `PATCH` cadastro, `PUT` preços, `unpublish`, `GET /admin/products`.
4. Frontend.
