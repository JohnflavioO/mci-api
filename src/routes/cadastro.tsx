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
import { CheckCircle2, Info, Loader2 } from "lucide-react";

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

const roleInfo: Record<Role, { label: string; desc: string }> = {
  cliente: { label: "Cliente", desc: "Compras para uso próprio" },
  revendedor: { label: "Revendedor", desc: "Empresas com CNPJ" },
  afiliado: { label: "Afiliado", desc: "Indique e ganhe comissão" },
};
const fieldCls = "mt-2 h-11 focus-visible:border-brand focus-visible:ring-brand/30";

function Register() {
  const [role, setRole] = useState<Role>("cliente");
  const m = useMutation({ mutationFn: (data: Record<string, string>) => authService.register(role, data) });
  if (m.isSuccess) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-lg px-4 py-16">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <CheckCircle2 className="size-8 text-success" />
            <h1 className="mt-4 font-display text-3xl font-bold">Cadastro enviado</h1>
            <p className="mt-3 text-muted-foreground">
              {role === "revendedor"
                ? "Seu cadastro de revendedor está Pendente. Confirme seu e-mail; o Portal do Revendedor será liberado após a aprovação do administrador."
                : "Confirme seu e-mail para acessar sua conta."}
            </p>
          </div>
        </div>
      </SiteShell>
    );
  }
  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <div className="rounded-xl border border-border bg-card p-7 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Nova conta</p>
          <h1 className="mt-3 font-display text-3xl font-bold">Criar conta</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha o tipo de conta que melhor descreve você.</p>
          <div role="radiogroup" aria-label="Tipo de conta" className="mt-6 grid gap-3 sm:grid-cols-3">
            {(Object.keys(fields) as Role[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => { setRole(r); m.reset(); }}
                className={`rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${role === r ? "border-brand bg-brand/5 ring-1 ring-brand" : "border-border hover:border-foreground/30"}`}>
                <span className="block font-semibold">{roleInfo[r].label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{roleInfo[r].desc}</span>
              </button>
            ))}
          </div>
          {role === "revendedor" && (
            <div className="mt-5 flex gap-3 border-l-2 border-brand bg-secondary p-4 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-brand" />
              <p>O cadastro de revendedor passa por aprovação antes de liberar preços exclusivos.</p>
            </div>
          )}
          <form
            key={role}
            className="mt-7 grid gap-5 border-t border-border pt-7 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
            }}
          >
            {fields[role].map((f) => (
              <div key={f} className={f === "Razão social" || f === "Nome completo" || f === "Senha" ? "sm:col-span-2" : ""}>
                <Label htmlFor={f}>{f}{optional.has(f) && <span className="font-normal text-muted-foreground"> (opcional)</span>}</Label>
                {f === "UF" ? (
                  <select id={f} name={f} required defaultValue="" className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/30">
                    <option value="" disabled>Selecione</option>
                    {UFS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                ) : (
                  <Input id={f} name={f} required={!optional.has(f)} placeholder={hints[f]} type={f === "Senha" ? "password" : f === "E-mail" ? "email" : "text"} className={fieldCls} />
                )}
              </div>
            ))}
            {m.isError && <div className="sm:col-span-2"><ErrorState message={m.error.message} /></div>}
            <Button type="submit" size="lg" className="h-12 bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground sm:col-span-2" disabled={m.isPending}>
              {m.isPending ? <><Loader2 className="size-4 animate-spin" /> Enviando…</> : "Criar conta"}
            </Button>
          </form>
        </div>
      </div>
    </SiteShell>
  );
}
