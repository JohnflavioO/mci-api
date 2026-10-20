# MCI Xpress — Especificação da API administrativa de produtos (Etapa 3)

Somente especificação. Nada foi alterado no backend, Oracle, autenticação ou URLs.
Base: `https://loja.mcieventos.online/api/v1`. Todas as rotas `/admin/*` exigem `Authorization: Bearer <token>` emitido por `POST /admin/auth/login`.

## 1. O que já existe

| Método | Caminho | Auth | Uso no frontend |
|---|---|---|---|
| GET | `/health` | — | `healthService` (status da API no portal) |
| POST | `/admin/auth/login` | — | `adminAuth.loginAdmin` (token só em memória) |
| GET | `/products` | — | `catalog.ts`, `adminProducts.listPublishedProducts` |
| GET | `/products/:id` | — | `produto.$slug.tsx` |
| POST | `/admin/products/import/preview` | Bearer | `productImport.preview` |
| POST | `/admin/products/import` | Bearer | `productImport.save` (hoje responde 500 — log pendente) |
| POST | `/admin/products/:id/publish` | Bearer | `adminProducts.publishProduct` |

Confirmados como inexistentes (404): `GET /admin/products`, `POST /admin/products`, `PUT/PATCH /admin/products/:id`.

## 2. Modelo administrativo (resposta)

Estende o `PublicProduct` atual com campos restritos ao admin:

```ts
type AdminProduct = {
  id: string; name: string; brand: string; sku: string | null;
  category: string | null; description: string | null;
  status: "draft" | "published" | "archived"; // confirmar em MCI_PRODUCTS_STATUS_CK
  sourceUrl: string | null;
  specs: { label: string; value: string }[];
  images: { url: string; position: number }[];
  pricing: { currency: "BRL"; customerPrice: number | null; resellerPrice: number | null };
  createdAt: string; updatedAt: string | null;
  version: number; // controle de concorrência otimista
};
```
Nunca retornar `SOURCE_URL_HASH`, `SKU_NORMALIZED` nem `CREATED_BY` bruto.

## 3. Endpoints a implementar no backend

### 3.1 GET /admin/products — listagem administrativa
- Query: `status` (draft|published|archived, opcional), `q` (nome/SKU, máx. 100), `category`, `page` (≥1, padrão 1), `pageSize` (1–100, padrão 20), `sort` (`createdAt:desc` padrão | `name:asc`).
- 200: `{ products: AdminProduct[], page, pageSize, total }`
- Erros: 400 parâmetro inválido · 401 sem/expirado token · 403 sem papel admin · 500.

### 3.2 GET /admin/products/:id
- 200: `{ product: AdminProduct }` (qualquer status) · 401 · 403 · 404.

### 3.3 POST /admin/products — criação manual
- Payload (mesmo formato de `ImportSavePayload`, sem `sourceUrl` obrigatório):
```json
{ "status": "draft", "name": "…", "brand": "", "sku": "…", "description": null,
  "category": "…", "specs": [{"label":"…","value":"…"}],
  "images": [{"url":"https://…","position":0}],
  "pricing": {"currency":"BRL","customerPrice":null,"resellerPrice":null} }
```
- 201: `{ product: AdminProduct }` · 400/422 validação (`{ error, fields: {campo: motivo} }`) · 401 · 403 · 409 SKU duplicado (`{ error, conflictProductId }`) · 500.

### 3.4 PATCH /admin/products/:id — edição parcial
- Payload: subconjunto dos campos de 3.3 (exceto `status`) + `version` obrigatório.
- `specs`/`images`, quando enviados, substituem a lista inteira (transação única).
- 200: `{ product }` · 400/422 · 401 · 403 · 404 · 409 SKU duplicado ou `version` desatualizada.

### 3.5 Transições de status
- Existente: `POST /admin/products/:id/publish`.
- Novos: `POST /admin/products/:id/unpublish` (published→draft) e `POST /admin/products/:id/archive`.
- 200 `{ product }` · 401 · 403 · 404 · 409 transição inválida · 422 requisitos de publicação ausentes.

Exclusão física: não proposta; usar `archive`.

## 4. Validações (no backend, transacionais)

- **SKU**: opcional em rascunho, obrigatório para publicar; trim, 1–64 chars; unicidade via `SKU_NORMALIZED` (maiúsculas, sem espaços) com índice único → 409.
- **Nome**: obrigatório, 1–200. **Marca**: string (pode ser `""`, nunca `null`, compatível com a API atual). **Categoria**: obrigatória para publicar.
- **Preços**: `NUMBER(12,2)`, ≥0, até 2 casas; para publicar ambos >0; `resellerPrice ≤ customerPrice`; moeda fixa `BRL`. Nunca calculados no frontend.
- **Imagens**: só `https://`, máx. 2048 chars, máx. 20, `position` única 0..n-1; publicar exige ≥1.
- **Especificações**: máx. 100; `label` 1–100 e `value` 1–500 após trim; labels sem duplicata (case-insensitive).
- **Status**: draft→published (publish, com regras acima), published→draft (unpublish), qualquer→archived; archived→draft só via ação explícita futura. Outras → 409.
- **Concorrência**: `version` incrementado em cada escrita; divergência → 409.
- **Auditoria**: `CREATED_BY`/`UPDATED_BY` a partir do token, nunca do payload.

## 5. Alterações necessárias no frontend (após o backend existir)

- `src/services/adminProducts.ts`: adicionar `list`, `get`, `create`, `update`, `unpublish`, `archive` em `ADMIN_PRODUCT_ENDPOINTS`; tipo `AdminProduct`; reaproveitar `publishErrorMessage` e limpeza de token em 401; mapear `fields` de 400/422 para erros por campo.
- `src/services/productImport.ts`: extrair `toSavePayload` para um validador/serializador compartilhado com criação/edição.
- `src/routes/admin.produtos.tsx`: trocar `listPublishedProducts` por `GET /admin/products` com filtro de status e paginação; substituir o campo "ID do rascunho" por botão Publicar por linha; ativar o painel "Cadastro e edição manual".
- Nova rota `admin.produtos.$id.tsx` (edição) reutilizando o formulário de prévia de `admin.importar.tsx`.
- Testes: um por regra (SKU duplicado 409, preços para publicar, transições, 401 limpa sessão).

## 6. Pendências antes de implementar
1. Valores reais de `MCI_PRODUCTS_STATUS_CK`.
2. Log sanitizado do 500 em `POST /admin/products/import`.
3. Existência de `UPDATED_AT`, `VERSION`, `SKU_NORMALIZED` (índice único) no schema.
