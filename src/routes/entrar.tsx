import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/entrar")({
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({ mutationFn: () => authService.login(email, password) });
  return (
    <SiteShell>
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-3xl font-bold">Entrar</h1>
        <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" required className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {m.isError && <ErrorState message={m.error.message} />}
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Entrando…" : "Entrar"}</Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">Não tem conta? <Link to="/cadastro" className="text-foreground underline">Cadastre-se</Link></p>
      </div>
    </SiteShell>
  );
}
