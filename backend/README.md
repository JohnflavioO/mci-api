# MCI API (backend independente)

Node.js + TypeScript + Fastify + Oracle Autonomous Database. Não faz parte do frontend; mova esta pasta para um repositório próprio.

## Separar no GitHub
1. Crie um repositório novo (ex.: `mci-api`).
2. Copie o conteúdo de `backend/` para a raiz dele e faça o commit.
3. Apague `backend/` deste projeto quando o novo repositório estiver ativo.

## Rodar localmente
```bash
cp .env.example .env   # preencha as credenciais
npm install
npm run dev            # http://localhost:3000/api/v1/health
```
Produção: `npm run build && npm start` (use systemd ou pm2 na VPS).

## Pendências na Oracle Cloud
- Criar o Autonomous Database (Always Free) e o usuário da aplicação.
- Baixar o wallet e definir `DB_WALLET_DIR` / `DB_WALLET_PASSWORD`.
- Criar a VPS (Ampere A1 Always Free), instalar Node 20+.
- Liberar a porta (ou usar Nginx + HTTPS) na Security List.
- Definir `CORS_ORIGINS` com o domínio do frontend.

## Frontend
O frontend usa `VITE_API_BASE_URL` (ex.: `https://api.seudominio.com`).

## Pendente: importação de produto por link (usada por /admin/importar)
- `POST /api/v1/admin/products/import/preview` `{ url }` → prévia (campos ausentes = `null`, `missingFields`, `warnings`, `duplicates` por URL/SKU).
- `POST /api/v1/admin/products/import` → salva rascunho/publicado, registrando `sourceUrl` e `importedAt`.
- Segurança: aceitar só `https://www.mci.tv`/`mci.tv`, resolver DNS e bloquear IPs privados/loopback/link-local, não seguir redirects para fora do domínio, timeout e limite de tamanho; exigir superadministrador.
