import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { getSupabase } from "@/lib/supabase";

type LoginSearch = { admin?: boolean; next?: string };

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    ...(search["admin"] === true || search["admin"] === "true" ? { admin: true } : {}),
    ...(typeof search["next"] === "string" &&
    search["next"].startsWith("/") &&
    !search["next"].startsWith("//") &&
    !search["next"].startsWith("/entrar")
      ? { next: search["next"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Entrar | MCI Comercial" },
      { name: "description", content: "Acesse sua conta de cliente, revendedor ou afiliado MCI." },
      { property: "og:title", content: "Entrar | MCI Comercial" },
      { property: "og:description", content: "Acesse sua conta de cliente, revendedor ou afiliado MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const { admin, next } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => authService.login(email, password, admin === true),
    onSuccess: async () => {
      setPassword("");
      if (admin) {
        await navigate({ to: "/admin/importar" });
        return;
      }

      if (next) {
        await navigate({ to: next });
        return;
      }

      try {
        const supabase = getSupabase();
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: roles, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userData.user.id);

          if (!error && roles?.some((item) => item.role === "revendedor")) {
            await navigate({ to: "/revendedor" });
            return;
          }
          if (!error && roles?.some((item) => item.role === "afiliado")) {
            await navigate({ to: "/afiliado" });
            return;
          }
        }
      } catch {
        // If role lookup fails, keep the user in the public catalog.
      }

      await navigate({ to: "/catalogo" });
    },
    onError: () => setPassword(""),
    gcTime: 0,
  });
  return (
    <SiteShell>
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-3xl font-bold">{admin ? "Entrar como administrador" : "Entrar"}</h1>
        <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" autoComplete="username" required disabled={m.isPending} className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" autoComplete="current-password" required disabled={m.isPending} className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {m.isError && <ErrorState message={m.error.message} />}
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Entrando…" : "Entrar"}</Button>
        </form>
        {!admin && <p className="mt-6 text-sm text-muted-foreground">Não tem conta? <Link to="/cadastro" className="text-foreground underline">Cadastre-se</Link></p>}
      </div>
    </SiteShell>
  );
}
