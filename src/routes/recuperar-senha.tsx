import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({ meta: [{ title: "Recuperar senha | MCI Xpress" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RecoverPassword,
});

function RecoverPassword() {
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: () => authService.requestPasswordReset(email), gcTime: 0 });
  return <SiteShell><main className="mx-auto max-w-lg px-4 py-12 sm:py-16">
    <Link to="/entrar" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Voltar para entrar</Link>
    <section className="rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-9">
      <div className="mb-6 grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><Mail className="size-6" /></div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Acesso à sua conta</p>
      <h1 className="mt-3 font-display text-3xl font-bold">Recuperar senha</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Informe o e-mail usado no cadastro. Se a conta puder receber recuperação, enviaremos um link para criar uma nova senha.</p>
      {mutation.isSuccess ? <div role="status" className="mt-6 rounded-lg border border-emerald-600/25 bg-emerald-600/5 p-4 text-sm"><CheckCircle2 className="mb-2 size-5 text-emerald-600" /><p className="font-semibold">Solicitação enviada</p><p className="mt-1 text-muted-foreground">Confira sua caixa de entrada e o spam. O link de recuperação tem validade limitada.</p></div> : <form className="mt-7 space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
        <div><Label htmlFor="recovery-email">E-mail cadastrado</Label><Input id="recovery-email" type="email" autoComplete="email" required disabled={mutation.isPending} className="mt-2 h-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" /></div>
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>{mutation.isPending ? <><Loader2 className="size-4 animate-spin" /> Enviando…</> : "Enviar link de recuperação"}</Button>
      </form>}
      <div className="mt-6 flex items-start gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /> Por segurança, não informamos se um e-mail existe no sistema.</div>
    </section>
  </main></SiteShell>;
}
