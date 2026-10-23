import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Exige sessão Supabase + papel admin confirmado pelo banco (has_role com o token do próprio usuário).
export const Route = createFileRoute("/api/admin/import-preview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!url || !key) return Response.json({ error: "Servidor não configurado" }, { status: 503 });
        if (!token) return Response.json({ error: "Autenticação necessária" }, { status: 401 });
        const sb = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: u, error: ue } = await sb.auth.getUser(token);
        if (ue || !u.user) return Response.json({ error: "Autenticação necessária" }, { status: 401 });
        const { data: isAdmin, error: re } = await sb.rpc("has_role", { _role: "admin" });
        if (re || isAdmin !== true) return Response.json({ error: "Acesso restrito" }, { status: 403 });

        const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
        const target = typeof body?.url === "string" ? body.url.trim().slice(0, 2000) : "";
        const { allowedUrl, fetchMciPage, extractPreview } = await import("@/server/importPreview");
        if (!allowedUrl(target)) return Response.json({ error: "Use um link https da www.mci.tv." }, { status: 400 });
        try {
          const page = await fetchMciPage(target);
          return Response.json(extractPreview(page.html, page.url));
        } catch {
          return Response.json({ error: "Não foi possível ler a página do produto." }, { status: 502 });
        }
      },
    },
  },
});
