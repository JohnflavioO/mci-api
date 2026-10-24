import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({ meta: [{ title: "Criar nova senha | MCI Xpress" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      if (password !== confirm) throw new Error("As senhas não coincidem.");
      return authService.updatePassword(password);
    },
    onSuccess: async () => { await navigate({ to: "/entrar", replace: true }); },
    gcTime: 0,
  });
  return <SiteShell><main className="mx-auto max-w-lg px-4 py-12 sm:py-16"><section className="rounded-2xl border border-border bg-card p-7 shadow-sm sm:p-9">
    <div className="mb-6 grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><KeyRound className="size-6" /></div>
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Segurança da conta</p>
    <h1 className="mt-3 font-display text-3xl font-bold">Criar nova senha</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Use uma senha nova com pelo menos 8 caracteres. Depois, entre novamente com seu e-mail e a nova senha.</p>
    <form className="mt-7 space-y-5" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
      <div><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div><Label htmlFor="confirm-password">Confirmar nova senha</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      {mutation.isError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{mutation.error.message}</div>}
      {mutation.isSuccess && <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="size-4" /> Senha atualizada.</p>}
      <Button type="submit" className="h-11 w-full" disabled={mutation.isPending}>{mutation.isPending ? <><Loader2 className="size-4 animate-spin" /> Atualizando…</> : "Salvar nova senha"}</Button>
    </form>
    <p className="mt-5 text-sm text-muted-foreground">Link expirado? <Link to="/recuperar-senha" className="font-medium text-brand hover:underline">Solicite outro</Link>.</p>
  </section></main></SiteShell>;
}
