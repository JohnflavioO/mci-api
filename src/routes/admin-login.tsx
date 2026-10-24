import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";

export const Route = createFileRoute("/admin-login")({
  head: () => ({
    meta: [
      { title: "Acesso administrativo | MCI Xpress" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => authService.login(email, password, true),
    onSuccess: async () => {
      setPassword("");
      await navigate({ to: "/admin/importar", replace: true });
    },
    onError: () => setPassword(""),
    gcTime: 0,
  });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#101216] px-4 py-10 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,102,0,0.16),transparent_45%)]" />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-white/65 transition hover:text-white">
          <ArrowLeft className="size-4" /> Voltar para a loja pública
        </Link>
        <section className="rounded-2xl border border-white/10 bg-[#191c21] p-7 shadow-2xl sm:p-9">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-[#ff6900] text-lg font-black text-black">M</span>
            <div>
              <p className="font-display text-lg font-bold">MCI <span className="text-[#ff6900]">Xpress</span></p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Central administrativa</p>
            </div>
          </div>
          <div className="mb-6 grid size-12 place-items-center rounded-xl border border-[#ff6900]/25 bg-[#ff6900]/10 text-[#ff6900]">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Acesso Super Admin</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">Área restrita à equipe administrativa MCI. Entre com suas credenciais autorizadas.</p>
          <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
            <div className="space-y-2">
              <Label htmlFor="admin-email" className="text-white/80">E-mail administrativo</Label>
              <Input id="admin-email" type="email" autoComplete="username" required disabled={mutation.isPending} value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 border-white/15 bg-black/20 text-white placeholder:text-white/35 focus-visible:ring-[#ff6900]/40" placeholder="admin@empresa.com.br" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password" className="text-white/80">Senha</Label>
              <Input id="admin-password" type="password" autoComplete="current-password" required disabled={mutation.isPending} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 border-white/15 bg-black/20 text-white focus-visible:ring-[#ff6900]/40" placeholder="Sua senha" />
            </div>
            {mutation.isError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 size-4 shrink-0" />{mutation.error.message}</div>}
            <Button type="submit" className="h-11 w-full bg-[#ff6900] font-semibold text-black hover:bg-[#ff8129]" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="size-4 animate-spin" /> Verificando acesso…</> : <><LockKeyhole className="size-4" /> Entrar na central administrativa</>}
            </Button>
          </form>
          <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-5 text-xs leading-5 text-white/45">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0" /> Acesso validado pelo sistema de autenticação e pela função de autorização administrativa.
          </div>
        </section>
        <p className="mt-5 text-center text-xs text-white/35">Ambiente administrativo separado da navegação pública.</p>
      </div>
    </main>
  );
}
