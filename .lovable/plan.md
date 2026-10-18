# Plataforma Comercial MCI — base do frontend

## O que será construído
- Loja pública: início, catálogo (busca, filtros, categorias), detalhe do produto, carrinho e checkout (estrutura, sem pagamento simulado).
- Login e cadastro (cliente, revendedor, afiliado) — formulários prontos, envio retorna "API ainda não disponível".
- Portais com menu próprio: revendedor, afiliado e central administrativa (produtos, usuários, pedidos, preços, comissões, configurações).
- Estados de carregando, erro, vazio e sucesso; dados de demonstração marcados com selo "Demonstração".
- Identidade visual própria (escuro grafite + destaque âmbar, tipografia Space Grotesk / DM Sans).

## Arquivos
- `src/styles.css` — tokens de cor/tipografia.
- `src/routes/__root.tsx` — fontes, metadados MCI, Toaster.
- `src/lib/api.ts` — passa a usar `VITE_API_BASE_URL`.
- `src/services/` — `health`, `catalog`, `auth`, `orders`, `reseller`, `affiliate`, `admin` (chamadas à API; rotas inexistentes ficam marcadas como pendentes).
- `src/lib/demo-data.ts` — produtos de demonstração isolados.
- `src/lib/cart.tsx` — carrinho local (sem cálculo de preço definitivo).
- `src/components/shop/*` — cabeçalho, rodapé, card de produto, filtros, selo demo, estados.
- `src/components/portal/PortalLayout.tsx` — layout lateral reutilizável por perfil.
- Rotas: `index`, `catalogo`, `produto.$slug`, `carrinho`, `checkout`, `entrar`, `cadastro`, `revendedor/*`, `afiliado/*`, `admin/*`.

## Fora do escopo
Backend, tabelas, autenticação real, pagamentos, regras financeiras definitivas.
