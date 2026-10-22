import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SiteShell } from "@/components/shop/SiteShell";
import { ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService, type Role } from "@/services";
import { UFS } from "@/lib/br-docs";

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
  revendedor: ["Razão social", "Nome fantasia", "CNPJ", "UF", "Inscrição Estadual", "Responsável", "E-mail", "Telefone", "Senha"],
  afiliado: ["Nome completo", "CPF", "E-mail", "Telefone", "Senha"],
};
const optional = new Set(["Nome fantasia"]);
const hints: Record<string, string> = { "Inscrição Estadual": "Somente números, ou ISENTO", CNPJ: "00.000.000/0000-00", Telefone: "(00) 00000-0000" };

function Register() {
  const [role, setRole] = useState<Role>("cliente");
  const m = useMutation({ mutationFn: (data: Record<string, string>) => authService.register(role, data) });
  if (m.isSuccess) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-16">
          <h1 className="text-3xl font-bold">Cadastro enviado</h1>
          <p className="mt-4 text-muted-foreground">
            {role === "revendedor"
              ? "Seu cadastro de revendedor está Pendente. Confirme seu e-mail; o Portal do Revendedor será liberado após a aprovação do administrador."
              : "Confirme seu e-mail para acessar sua conta."}
          </p>
        </div>
      </SiteShell>
    );
  }
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
          key={role}
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
          }}
        >
          {fields[role].map((f) => (
            <div key={f}>
              <Label htmlFor={f}>{f}{optional.has(f) && <span className="text-muted-foreground"> (opcional)</span>}</Label>
              {f === "UF" ? (
                <select id={f} name={f} required defaultValue="" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="" disabled>Selecione</option>
                  {UFS.map((u) => <option key={u}>{u}</option>)}
                </select>
              ) : (
                <Input id={f} name={f} required={!optional.has(f)} placeholder={hints[f]} type={f === "Senha" ? "password" : f === "E-mail" ? "email" : "text"} className="mt-1" />
              )}
            </div>
          ))}
          {m.isError && <ErrorState message={m.error.message} />}
          <Button type="submit" className="w-full" disabled={m.isPending}>Criar conta</Button>
        </form>
      </div>
    </SiteShell>
  );
}
