import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Clock, Loader2, Lock, RotateCw, UserPlus } from "lucide-react";
import { resellerService, statusLabel } from "@/services/resellers";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

const benefits = ["Preços exclusivos para revenda", "Pedidos e histórico em um só lugar", "Atendimento comercial dedicado"];

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-0 overflow-hidden px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-16">
      <section className="rounded-t-xl bg-graphite p-8 text-graphite-foreground sm:p-10 lg:rounded-l-xl lg:rounded-tr-none lg:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Portal do Revendedor</p>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">Condições profissionais para quem revende audiovisual.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-graphite-muted">Acesse preços de revenda, acompanhe pedidos e conte com a equipe MCI Xpress para crescer com equipamentos profissionais.</p>
        <ul className="mt-8 space-y-3 border-t border-graphite-foreground/10 pt-6 text-sm">
          {benefits.map((b) => <li key={b} className="flex items-center gap-3"><span className="size-1.5 rounded-full bg-brand" />{b}</li>)}
        </ul>
      </section>
      <section className="rounded-b-xl border border-t-0 border-border bg-card p-8 sm:p-10 lg:rounded-r-xl lg:rounded-bl-none lg:border-l-0 lg:border-t lg:p-12">
        {children}
        <p className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground"><Lock className="size-3.5" /> Acesso restrito. Preços de revenda só aparecem para cadastros aprovados.</p>
      </section>
    </div>
  );
}

/** Libera o portal só para quem tem o papel "revendedor" no banco; o banco (RLS) continua sendo a barreira real. */
export function ResellerGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["reseller", "access"], queryFn: resellerService.myAccess, retry: false });
  if (q.isPending) {
    return <Frame><div role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin text-brand" /> Verificando seu acesso…</div></Frame>;
  }
  if (q.isError) {
    return (
      <Frame>
        <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" /><div><h2 className="font-display text-xl font-bold">Não foi possível verificar seu acesso</h2><p className="mt-2 text-sm text-muted-foreground">{q.error.message}</p></div></div>
        <Button variant="outline" className="mt-6 gap-2" onClick={() => void q.refetch()}><RotateCw className="size-4" /> Tentar novamente</Button>
      </Frame>
    );
  }
  if (q.data.isReseller) return <>{children}</>;
  const app = q.data.application;
  return (
    <Frame>
      {!q.data.signedIn ? (
        <>
          <h2 className="font-display text-2xl font-bold">Já tem uma conta?</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Entre para consultar sua inscrição, acompanhar a análise e acessar os preços exclusivos quando seu cadastro for aprovado.</p>
          <Button asChild size="lg" className="mt-6 h-12 w-full justify-between bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground"><Link to="/entrar">Entrar na minha conta <ArrowRight className="size-4" /></Link></Button>
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm font-semibold">Ainda não tem conta?</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Solicite seu cadastro de revendedor. A liberação de preços depende da aprovação da equipe MCI.</p>
            <Button asChild size="lg" variant="outline" className="mt-3 h-11 w-full justify-between"><Link to="/cadastro?tipo=revendedor">Quero ser revendedor <UserPlus className="size-4" /></Link></Button>
          </div>
        </>
      ) : !app ? (
        <>
          <h2 className="font-display text-2xl font-bold">Sua conta está conectada</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Esta conta ainda não possui uma inscrição de revendedor associada. Para evitar criar uma segunda conta com o mesmo e-mail, entre no cadastro existente ou saia para acessar outra conta.</p>
          <Button type="button" size="lg" className="mt-6 h-12 w-full justify-between bg-graphite text-graphite-foreground hover:bg-brand hover:text-brand-foreground" onClick={async () => { await getSupabase().auth.signOut(); await navigate({ to: "/entrar" }); }}>Sair e entrar em outra conta <ArrowRight className="size-4" /></Button>
          <div className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm leading-6 text-muted-foreground">
            Se esta é a conta correta, a inscrição comercial precisa ser concluída. Não é necessário repetir o cadastro de autenticação.
          </div>
        </>
      ) : (
        <>
          <h2 className="font-display text-2xl font-bold">Situação do cadastro</h2>
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-secondary p-4">
            <Clock className="size-5 text-brand" />
            <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Status</p><p className="font-semibold">{statusLabel[app.status]}</p></div>
          </div>
          {app.review_note && <div className="mt-4 border-l-2 border-brand pl-4 text-sm"><p className="font-semibold">Observação</p><p className="mt-1 text-muted-foreground">{app.review_note}</p></div>}
          <p className="mt-5 text-sm leading-6 text-muted-foreground">O portal é liberado após a aprovação do administrador. Você será avisado quando a análise for concluída.</p>
        </>
      )}
    </Frame>
  );
}
