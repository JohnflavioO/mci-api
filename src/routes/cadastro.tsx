import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService, type Role } from "@/services";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro | MCI Comercial" },
      { name: "description", content: "Crie sua conta como cliente, revendedor ou afiliado da MCI." },
      { property: "og:title", content: "Cadastro | MCI Comercial" },
      { property: "og:description", content: "Crie sua conta como cliente, revendedor ou afiliado da MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Register,
});

const fields: Record<Role, string[]> = {
  cliente: ["Nome completo", "E-mail", "Telefone", "Senha"],
  revendedor: ["Razão social", "CNPJ", "Responsável", "E-mail", "Telefone", "Senha"],
  afiliado: ["Nome completo", "CPF", "E-mail", "Telefone", "Senha"],
};

function Register() {
  const [role, setRole] = useState<Role>("cliente");
  const m = useMutation({ mutationFn: (data: Record<string, string>) => authService.register(role, data) });
  return (
    <SiteShell>
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-3xl font-bold">Criar conta</h1>
        <div className="mt-6 grid grid-cols-3 border text-sm">
          {(Object.keys(fields) as Role[]).map((r) => (
            <button key={r} onClick={() => { setRole(r); m.reset(); }} className={`py-2 capitalize ${role === r ? "bg-primary text-primary-foreground" : ""}`}>{r}</button>
          ))}
        </div>
        {role === "revendedor" && <p className="mt-4 text-sm text-muted-foreground">O cadastro de revendedor passa por aprovação antes de liberar preços exclusivos.</p>}
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
          }}
        >
          {fields[role].map((f) => (
            <div key={f}><Label>{f}</Label><Input name={f} required type={f === "Senha" ? "password" : f === "E-mail" ? "email" : "text"} className="mt-1" /></div>
          ))}
          {m.isError && <ErrorState message={m.error.message} />}
          <Button type="submit" className="w-full" disabled={m.isPending}>Criar conta</Button>
        </form>
      </div>
    </SiteShell>
  );
}
