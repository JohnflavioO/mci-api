<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- `backend/` is a standalone Node/Fastify API (Oracle DB) destined for its own repo; never import it from `src/` — the frontend only talks to it over HTTP via `VITE_API_BASE_URL`.
- All HTTP calls go through `src/lib/api.ts` + `src/services/*`; prices, permissions and commissions are decided by the API, never computed in the frontend.
- Demo content lives only in `src/lib/demo-data.ts` and must render with the `DemoBadge`, so it is never mistaken for real data.
- Public frontend configuration goes in the project-root `.env` with the `VITE_` prefix (read only through `src/lib/api.ts`); real secrets never go there — they stay server-side.
- Administrative import reuses `/entrar?admin=true` and `authService.login` to obtain an API-issued bearer token; keep it in memory only, require a new login after reload or preview 401, and leave authorization to the external API.
- The catalog reads `GET /products` and `GET /products/:id` through `src/services/catalog.ts`, which maps the public API contract to the screen model; it falls back to labelled demo data only on network/5xx/route-missing errors, never on a valid empty list or a product 404.
