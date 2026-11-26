import { useQuery } from "@tanstack/react-query";
import { CreditCard, LockKeyhole, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/shop/states";

type PaymentStatus = { activeProvider: "infinitepay" | "rede" | null; redeAvailable: boolean };

export function AdminPaymentSettings() {
  const status = useQuery({
    queryKey: ["admin", "payment-settings"],
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<PaymentStatus> => {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão administrativa expirada.");
      const response = await fetch("/api/admin/payment-settings", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível consultar a configuração de pagamentos.");
      return response.json();
    },
  });
  const active = !status.isError && status.data?.activeProvider === "infinitepay";
  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CreditCard className="size-6" /></span>
        <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Integrações financeiras</p><h2 className="mt-1 text-2xl font-bold">Operadora de pagamentos</h2><p className="mt-2 text-sm text-muted-foreground">Acompanhe a configuração de checkout e a preparação da migração para a Rede.</p></div>
      </div>
      <Button variant="outline" onClick={() => void status.refetch()} disabled={status.isFetching}><RefreshCw className="mr-2 size-4" /> Atualizar status</Button>
    </section>
    {status.isPending ? <LoadingState /> : status.isError ? <ErrorState message={status.error.message} onRetry={() => void status.refetch()} /> : <>
      {!status.data.activeProvider && <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/30 bg-card p-4 text-sm"><AlertTriangle className="size-5 shrink-0 text-amber-600" /><p>Nenhuma operadora habilitada na configuração atual do checkout. Verifique o servidor.</p></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">InfinitePay</h3><span className={active ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400" : "rounded-full bg-muted px-3 py-1 text-xs font-semibold"}>{active ? "Habilitada" : "Desabilitada"}</span></div>
          <p className="mt-2 text-sm text-muted-foreground">Integração existente para pagamentos da loja.</p>
          <dl className="mt-5 space-y-3 border-t pt-4 text-sm"><div className="flex justify-between gap-3"><dt>Novos pagamentos</dt><dd className="font-medium">{active ? "Habilitados" : "Bloqueados"}</dd></div><div className="flex justify-between gap-3"><dt>Consulta à operadora</dt><dd className="text-muted-foreground">Não realizada</dd></div></dl>
          <p className="mt-4 text-xs text-muted-foreground">O status reflete a configuração do servidor, não um teste de disponibilidade da API.</p>
        </section>
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-orange-600 dark:text-orange-400">Rede — Itaú</h3><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">Em preparação</span></div>
          <p className="mt-2 text-sm text-muted-foreground">Aguardando documentação e homologação da integração.</p>
          <dl className="mt-5 space-y-3 border-t pt-4 text-sm"><div className="flex justify-between gap-3"><dt>Novos pagamentos</dt><dd className="font-medium">Bloqueados</dd></div><div className="flex justify-between gap-3"><dt>Integração</dt><dd className="text-muted-foreground">Não implementada</dd></div></dl>
          <Button className="mt-5 w-full" disabled><LockKeyhole className="mr-2 size-4" /> Ativar Rede</Button>
        </section>
      </div>
    </>}
    <section className="flex items-start gap-3 rounded-xl border bg-card p-5"><ShieldCheck className="size-5 shrink-0 text-primary" /><div><h3 className="font-semibold">Migração exclusiva</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Quando a Rede for homologada e ativada, a InfinitePay deixará de receber novas vendas. O histórico e a conciliação de pagamentos anteriores serão preservados. Não haverá fallback automático. Esta tela é somente informativa nesta etapa.</p></div></section>
  </div>;
}
