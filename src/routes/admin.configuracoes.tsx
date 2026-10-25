import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  PackageCheck,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/shop/states";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | MCI Xpress" }] }),
  component: StockSettingsPage,
});

function StockSettingsPage() {
  const qc = useQueryClient();
  const catalog = createSupabaseCatalog();
  const query = useQuery({
    queryKey: ["admin", "stock-confirmation-mode"],
    queryFn: catalog.getStockConfirmationMode,
    retry: false,
  });
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (query.data !== undefined) setEnabled(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => catalog.setStockConfirmationMode(enabled),
    onSuccess: async () => {
      toast.success("Configuração de estoque salva.");
      await qc.invalidateQueries({ queryKey: ["admin", "stock-confirmation-mode"] });
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      await qc.invalidateQueries({ queryKey: ["admin", "supabase-products"] });
      await qc.invalidateQueries({ queryKey: ["admin-dashboard", "products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isConfigured = query.data !== undefined && !query.isError;
  const hasChanges = isConfigured && enabled !== query.data;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <header className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-background shadow-sm">
              <Settings2 className="size-6 text-primary" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Central administrativa <ChevronRight className="size-3" /> Preferências da plataforma
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Gerencie regras operacionais que afetam o catálogo e a disponibilidade dos produtos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground sm:self-center">
            <ShieldCheck className="size-4" />
            Área administrativa
          </div>
        </div>
      </header>

      <section aria-labelledby="catalog-settings-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Catálogo</p>
            <h3 id="catalog-settings-heading" className="mt-1 text-xl font-bold">Estoque e disponibilidade</h3>
          </div>
          <p className="text-sm text-muted-foreground">Regras aplicadas à exibição dos produtos na loja.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-start gap-3 border-b p-5 sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <PackageCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold">Confirmação de estoque</h4>
                  {isConfigured && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${query.data ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                      <span className={`size-1.5 rounded-full ${query.data ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {query.data ? "Confirmação obrigatória" : "Confirmação dispensada"}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Defina se a equipe da MCI precisa validar o estoque antes de um produto aparecer como disponível.
                </p>
              </div>
            </div>

            {query.isPending ? (
              <div className="p-6"><LoadingState /></div>
            ) : query.isError ? (
              <div className="space-y-3 p-5 sm:p-6">
                <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p>Confirme se a migration de configuração foi aplicada ao Supabase antes de tentar salvar.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <label className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/[0.035]" : "hover:bg-muted/40"}`}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Exigir confirmação manual da MCI</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      Quando ativada, a disponibilidade exige estoque informado maior que zero e confirmação explícita da equipe.
                    </span>
                  </span>
                </label>

                <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${enabled ? "border-amber-500/20 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                  {enabled
                    ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                    : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
                  <div>
                    <p className="font-semibold">{enabled ? "Validação manual ativa" : "Validação manual desativada"}</p>
                    <p className="mt-1 text-muted-foreground">
                      {enabled
                        ? "Produtos importados ou sem confirmação explícita continuam indisponíveis. Isso evita exibir itens cujo estoque ainda não foi validado."
                        : "A confirmação manual não será exigida, mas o produto ainda precisa ter quantidade de estoque informada e maior que zero."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {hasChanges ? "Há alterações ainda não salvas." : "As alterações só entram em vigor após salvar."}
                  </p>
                  <Button onClick={() => save.mutate()} disabled={save.isPending || !hasChanges} className="sm:min-w-44">
                    {save.isPending ? "Salvando configuração…" : "Salvar configuração"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-primary" />
                <h4 className="font-semibold">Como funciona</h4>
              </div>
              <ol className="mt-4 space-y-4">
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">01</span>
                  <div>
                    <p className="text-sm font-medium">Estoque informado</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">O produto precisa ter uma quantidade válida maior que zero.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">02</span>
                  <div>
                    <p className="text-sm font-medium">Validação da equipe</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">Quando a regra está ativa, a MCI também precisa confirmar o estoque.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">03</span>
                  <div>
                    <p className="text-sm font-medium">Exibição na loja</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">A regra controla quando o produto pode ser considerado disponível.</p>
                  </div>
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h4 className="font-semibold">Alteração controlada</h4>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Revise o impacto no catálogo antes de mudar esta regra. A configuração é global e pode afetar vários produtos.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
