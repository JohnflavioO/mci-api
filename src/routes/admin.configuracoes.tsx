import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Settings2 } from "lucide-react";
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
  useEffect(() => { if (query.data !== undefined) setEnabled(query.data); }, [query.data]);
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-secondary"><Settings2 className="size-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Administração</p><h2 className="mt-1 text-xl font-bold">Confirmação de estoque</h2><p className="mt-1 text-sm text-muted-foreground">Defina a regra global de disponibilidade do catálogo.</p></div>
        </div>
        {query.isPending ? <div className="mt-6"><LoadingState /></div> : query.isError ? <div className="mt-6 space-y-3"><ErrorState message={query.error.message} onRetry={() => void query.refetch()} /><p className="text-sm text-muted-foreground">Confirme se a migration de configuração foi aplicada ao Supabase antes de salvar.</p></div> : (
          <div className="mt-6 space-y-5">
            <label className="flex items-start gap-3 rounded-lg border p-4">
              <input type="checkbox" className="mt-1 size-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span><span className="font-semibold">Exigir confirmação manual da MCI</span><span className="mt-1 block text-sm text-muted-foreground">Ativado: o produto só fica disponível quando houver quantidade maior que zero e a MCI marcar explicitamente o estoque como confirmado.</span></span>
            </label>
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm">
              {enabled ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
              <p>{enabled ? "Modo atual: confirmação manual obrigatória. Produtos importados ou sem confirmação continuam indisponíveis." : "Modo atual: confirmação manual dispensada. Mesmo assim, só ficam disponíveis produtos com quantidade de estoque informada e maior que zero."}</p>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || enabled === query.data}>{save.isPending ? "Salvando…" : "Salvar configuração"}</Button>
          </div>
        )}
      </section>
    </div>
  );
}
