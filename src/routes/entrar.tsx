import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { getSupabase } from "@/lib/supabase";

/** Destino pós-login conforme o papel registrado no banco. */
async function portalFor(): Promise<"/revendedor" | "/afiliado" | "/"> {
  const sb = getSupabase();
  const [r, a] = await Promise.all([sb.rpc("has_role", { _role: "revendedor" }), sb.rpc("has_role", { _role: "afiliado" })]);
  if (r.data === true) return "/revendedor";
  if (a.data === true) return "/afiliado";
  return "/";
}

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>): { admin?: boolean } =>
    search["admin"] === true || search["admin"] === "true" ? { admin: true } : {},
  head: () => ({
    meta: [
      { title: "Entrar | MCI Xpress" },
      { name: "description", content: "Acesse sua conta de cliente, revendedor ou afiliado MCI Xpress." },
      { property: "og:title", content: "Entrar | MCI Xpress" },
      { property: "og:description", content: "Acesse sua conta de cliente, revendedor ou afiliado MCI Xpress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

const field = "mt-2 h-11 focus-visible:border-brand focus-visible:ring-brand/30";

function Login() {
  const { admin } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => authService.login(email, password, admin === true),
    onSuccess: async () => {
      setPassword("");
      if (admin) await navigate({ to: "/admin/importar" });
      else await navigate({ to: await portalFor().catch(() => "/" as const) });
    },
    onError: () => setPassword(""),
    gcTime: 0,
  });
  if (admin) return <Navigate to="/admin-login" replace />;

  return (
    <SiteShell>
      <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="rounded-xl border border-border bg-card p-7 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">{admin ? "Área administrativa" : "Clientes, revendedores e afiliados"}</p>
          <h1 className="mt-3 font-display text-3xl font-bold">{admin ? "Entrar como administrador" : "Entrar na sua conta"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{admin ? "Acesso exclusivo para a equipe MCI Xpress." : "Use o e-mail e a senha cadastrados para acessar seu portal."}</p>
          <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="username" required disabled={m.isPending} className={field} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" autoComplete="current-password" required disabled={m.isPending} className={field} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {m.isError && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{m.error.message}</div>}
            <Button type="submit" size="lg" className="h-12 w-full bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground" disabled={m.isPending}>
              {m.isPending ? <><Loader2 className="size-4 animate-spin" /> Entrando…</> : "Entrar"}
            </Button>
          </form>
          {!admin && <p className="mt-6 border-t border-border pt-5 text-sm text-muted-foreground">Ainda não tem conta? <Link to="/cadastro" className="font-semibold text-foreground underline-offset-4 hover:text-brand hover:underline">Cadastre-se</Link></p>}
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" /> Conexão via HTTPS.</p>
      </div>
    </SiteShell>
  );
}
