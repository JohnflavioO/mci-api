# Proposta técnica final — CRUD administrativo de produtos (v2, aguarda aprovação)

Nada executado: nenhum SQL, nenhuma alteração de dados ou do backend de produção.
Status permitidos: **somente `draft` e `published`** (`MCI_PRODUCTS_STATUS_CK`).
Substitui as partes de `docs/api-admin-produtos.md` que citam `archived`/`unpublish`/`version`.

## 0. Fatos confirmados (Oracle produção)
- `SKU_NORMALIZED = UPPER(TRIM(sku))` gerada; única em `MCI_PRODUCTS_SKU_UQ`.
- `MCI_PRODUCTS`: `CREATED_AT`, `IMPORTED_AT`; sem `UPDATED_AT`/versão (até a migration).
- `MCI_PRODUCT_PRICING`: possui `UPDATED_AT`.

## 1. Migration (não executar sem aprovação)

### 1.1 Up — ordem de execução
```sql
-- Passo 1: colunas anuláveis (operação só de dicionário, sem reescrever linhas)
ALTER TABLE MCI_PRODUCTS ADD (
  UPDATED_AT  TIMESTAMP WITH TIME ZONE,
  ROW_VERSION NUMBER(10)
);
-- Passo 2: preencher existentes
UPDATE MCI_PRODUCTS SET UPDATED_AT = CREATED_AT, ROW_VERSION = 1
 WHERE UPDATED_AT IS NULL OR ROW_VERSION IS NULL;
COMMIT;
-- Passo 3: defaults + NOT NULL + checagem
ALTER TABLE MCI_PRODUCTS MODIFY (
  UPDATED_AT  DEFAULT SYSTIMESTAMP NOT NULL,
  ROW_VERSION DEFAULT 1 NOT NULL
);
ALTER TABLE MCI_PRODUCTS ADD CONSTRAINT MCI_PRODUCTS_ROW_VERSION_CK CHECK (ROW_VERSION >= 1);
-- Passo 4: versão em preços (mesma estratégia)
ALTER TABLE MCI_PRODUCT_PRICING ADD (ROW_VERSION NUMBER(10));
UPDATE MCI_PRODUCT_PRICING SET ROW_VERSION = 1 WHERE ROW_VERSION IS NULL;
COMMIT;
ALTER TABLE MCI_PRODUCT_PRICING MODIFY (ROW_VERSION DEFAULT 1 NOT NULL);
```
Ajustar o tipo de `UPDATED_AT` ao tipo de `CREATED_AT` (`TIMESTAMP` vs `TIMESTAMP WITH TIME ZONE`) antes de rodar.

Ordem global:
1. Backup/export de `MCI_PRODUCTS` e `MCI_PRODUCT_PRICING` (ou restore point).
2. Rodar a migration em homologação/cópia → rodar os testes de integração (item 7).
3. Produção, fora do horário de pico: Passos 1–4.
4. Só então publicar o backend novo (ele exige as colunas). O backend atual ignora colunas extras, então a migration é **compatível com o código em produção hoje**.

### 1.2 Rollback
```sql
-- Primeiro voltar o backend para a versão anterior (ela não usa as colunas)
ALTER TABLE MCI_PRODUCTS DROP CONSTRAINT MCI_PRODUCTS_ROW_VERSION_CK;
ALTER TABLE MCI_PRODUCTS DROP (ROW_VERSION, UPDATED_AT);
ALTER TABLE MCI_PRODUCT_PRICING DROP (ROW_VERSION);
```

### 1.3 Riscos
| Risco | Mitigação |
|---|---|
| Lock de DDL durante `ALTER` | tabela pequena; janela fora de pico; `DDL_LOCK_TIMEOUT` curto |
| `UPDATE` do passo 2 em tabela grande | executar em lote se > ~100 mil linhas |
| Backend novo publicado antes da migration | ordem fixa: migration → backend |
| Rollback perde histórico de versão/datas | aceitável; dados de negócio intactos |
| Trigger existente em `MCI_PRODUCTS` | verificar `USER_TRIGGERS` antes |

Data/versão atualizadas **no backend** (não por trigger) dentro da mesma transação, para a regra ficar visível no código. "Edição relevante" = qualquer mudança em campos do produto, specs, imagens ou status.

## 2. Concorrência otimista — produto
`PATCH /admin/products/:id` (Bearer + papel admin), corpo exige `rowVersion` carregado.

```sql
UPDATE MCI_PRODUCTS
   SET <campos enviados>, UPDATED_AT = SYSTIMESTAMP, ROW_VERSION = ROW_VERSION + 1
 WHERE PRODUCT_ID = :id AND ROW_VERSION = :rowVersion
```
- `rowsAffected = 1` → segue.
- `0` → `SELECT 1 … WHERE PRODUCT_ID = :id`: não existe → **404**; existe → **409** `{ error: "Produto alterado por outra pessoa. Recarregue.", code: "VERSION_CONFLICT", currentVersion }` — nada é sobrescrito (rollback).
- `publish` também passa a exigir `rowVersion` e incrementa a versão.

## 3. Preços — endpoint separado
`PUT /admin/products/:id/pricing` (Bearer + admin):
```json
{ "currency": "BRL", "customerPrice": 4210.00, "resellerPrice": 2500.00, "rowVersion": 3 }
```
Transação:
1. `UPDATE MCI_PRODUCT_PRICING SET …, UPDATED_AT = SYSTIMESTAMP, ROW_VERSION = ROW_VERSION + 1 WHERE PRODUCT_ID = :id AND ROW_VERSION = :rowVersion`.
2. 0 linhas → existe preço? 409 `PRICING_VERSION_CONFLICT`; produto existe sem preço e `rowVersion` ausente → `INSERT` (versão 1); produto inexistente → 404.
3. Se o produto está `published`, ambos > 0 obrigatório → 422.
- Validação: ≥ 0, 2 casas, `resellerPrice ≤ customerPrice`, moeda `BRL`.
- Resposta 200 `{ pricing: { currency, customerPrice, resellerPrice, updatedAt, rowVersion } }`.
- `resellerPrice` **só** em `/admin/*`. Rotas públicas mantêm o SELECT atual sem `RESELLER_PRICE`.

## 4. Atomicidade (produto + specs + imagens)
- Uma conexão, `autoCommit: false` em todos os `execute`/`executeMany`; `commit()` só no final; `rollback()` no `catch`; `close()` no `finally` (helper `withTransaction`).
- Specs/imagens enviados substituem a lista: `DELETE … WHERE PRODUCT_ID = :id` + `executeMany` **somente se a lista tiver itens** (lista vazia em `executeMany` gera erro).
- Revalidação de publicação após aplicar mudanças, ainda dentro da transação.

## 5. Erros, request ID e logs
Formato único: `{ error: string, code: string, requestId: string, fields?: Record<string,string> }`.

| Situação | HTTP | code |
|---|---|---|
| zod inválido | 400 | `VALIDATION` (+ `fields`) |
| sem/token inválido | 401 | `UNAUTHENTICATED` |
| sem papel admin | 403 | `FORBIDDEN` |
| produto inexistente | 404 | `NOT_FOUND` |
| ORA-00001 em `MCI_PRODUCTS_SKU_UQ` | 409 | `SKU_DUPLICATE` |
| versão divergente | 409 | `VERSION_CONFLICT` / `PRICING_VERSION_CONFLICT` |
| ORA-00054 (lock) | 409 | `LOCKED` |
| regra de publicação / ORA-02290 / ORA-01400 / ORA-12899 | 422 | `RULE_VIOLATION` |
| demais | 500 | `INTERNAL` |

- `requestId`: `genReqId` do Fastify (UUID), devolvido no corpo e no header `x-request-id`.
- Log interno: `{ requestId, route, method, adminId, status, oraCode, constraint, durationMs }`.
- **Nunca** logar: body, senha, token, header Authorization/cookie (já redigidos), preços, SQL com valores, `err.message` do Oracle na resposta.
- Mensagem do Oracle só no log, truncada, sem binds.

## 6. Causa provável do erro 500 ao salvar produto importado
O handler `POST /admin/products/import` **não está neste repositório** (só existe na VPS), então a causa não pode ser confirmada pelo código. Logs disponíveis: a resposta 500 só contém `"Erro interno"`. Payload enviado no teste: SKU `5542`, categoria `Iluminação`, preços 4210/2500, `brand: ""`, `specs: []`, 1 imagem.

Hipóteses em ordem de probabilidade, cada uma verificável:
1. **`specs: []` com `executeMany`** — node-oracledb rejeita array vazio em `executeMany` (`NJS-005`). Bate com o teste (sem especificações) e falha igual em draft e published. Verificar: mesmo payload com 1 especificação.
2. **`brand: ""` vira NULL no Oracle** — no Oracle string vazia é NULL; se `BRAND` é `NOT NULL` → `ORA-01400`. O frontend precisou enviar `""` porque o zod recusa `null`. Verificar: `SELECT NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME='MCI_PRODUCTS' AND COLUMN_NAME='BRAND'`.
3. **SKU já existente** (`ORA-00001` em `MCI_PRODUCTS_SKU_UQ`) sem tratamento → 500 em vez de 409. Verificar: `SELECT PRODUCT_ID, STATUS FROM MCI_PRODUCTS WHERE SKU_NORMALIZED = '5542'`.
4. **Campos não aceitos pelas constraints**: `SOURCE_URL_HASH`/`IMPORTED_AT`/`CREATED_BY` NOT NULL não preenchidos, ou `CATEGORY` com acento além do tamanho em bytes (`ORA-12899`, VARCHAR2 em BYTE).
5. **Insert parcial sem transação** — se um teste anterior gravou só a linha de `MCI_PRODUCTS`, novas tentativas caem em (3).

Ação sem alterar produção: rodar na VPS `journalctl`/`pm2 logs` filtrando o horário do teste e procurar `ORA-`/`NJS-`. O novo logging ajuda a diagnosticar, mas **não corrige** nenhuma dessas causas; cada uma exige correção própria (pular `executeMany` vazio, tratar `brand` vazio, mapear 409, preencher colunas obrigatórias, transação).

## 7. Testes de integração planejados (contra Oracle de homologação, nunca produção)
Setup: schema migrado em banco de teste; produtos criados por fixture; rollback/limpeza por teste.

**Permissões**
1. Sem token → 401 em PATCH, PUT pricing, publish, GET /admin/products.
2. Token de não-admin → 403, nada alterado.
3. Token expirado → 401.

**SKU duplicado**
4. Criar com SKU `abc` existindo ` ABC ` → 409 `SKU_DUPLICATE`, sem linha nova.
5. PATCH mudando SKU para um existente → 409, produto inalterado e `ROW_VERSION` igual.

**Conflito de versão**
6. PATCH com versão atual → 200, `ROW_VERSION` +1, `UPDATED_AT` maior.
7. Dois PATCH com a mesma versão → primeiro 200, segundo 409; dados do primeiro preservados.
8. PUT pricing com versão antiga → 409, preços inalterados.
9. publish com versão antiga → 409, status inalterado.

**Produto inexistente**
10. PATCH/PUT pricing/publish/GET em ID inexistente → 404 (não 409 nem 500).

**Rollback / atomicidade**
11. PATCH com specs válidas + imagem inválida (forçar erro no INSERT de imagens) → 500/422; produto, specs e imagens idênticos aos de antes; versão igual.
12. PATCH com `specs: []` → remove specs sem erro.
13. Erro injetado após UPDATE do produto → nenhuma alteração persistida.

**Isolamento de preços de revenda**
14. `GET /products` e `GET /products/:id` nunca contêm `resellerPrice` (nem em produto com preço gravado).
15. `GET /admin/products/:id` com admin contém `resellerPrice`.
16. Logs gerados nos testes 6–8 não contêm valores de preço, token ou senha.

**Status**
17. Status diferente de `draft`/`published` → 400 (zod), sem chegar ao banco.
18. Publicar sem preços > 0 → 422.

**Formato de erro**
19. Todo erro tem `error`, `code`, `requestId`; 500 nunca expõe texto `ORA-`.

Frontend (vitest, após backend): 409 mostra mensagem + "Recarregar"; envio de `rowVersion`; 401 limpa sessão.

## 8. Alterações previstas (após aprovação)
- Backend: `withTransaction`, `mapOracleError`, `genReqId`, rotas `GET /admin/products`, `GET/PATCH /admin/products/:id`, `PUT /admin/products/:id/pricing`, `rowVersion` em `publish`, correções do item 6.
- Frontend: `adminProducts.ts` (`update`, `updatePricing`, `rowVersion`), tela de edição reaproveitando `admin.importar.tsx`.
