import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { resellerService, statusLabel, type ResellerApplication, type ResellerStatus, type ReviewAction } from "@/services/resellers";
import { EmptyState, ErrorState, LoadingState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/revendedores")({
  head: () => ({
    meta: [
      { title: "Revendedores | MCI Xpress" },
      { name: "description", content: "Aprovação de cadastros de revendedores na Central Administrativa MCI." },
      { property: "og:title", content: "Revendedores | MCI Xpress" },
      { property: "og:description", content: "Aprovação de cadastros de revendedores na Central Administrativa MCI." },
    ],
  }),
  component: ResellersPage,
});

const filters: (ResellerStatus | "")[] = ["pendente", "documentacao_solicitada", "aprovado", "rejeitado", ""];
const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

function ResellersPage() {
  const [status, setStatus] = useState<ResellerStatus | "">("pendente");
  const q = useQuery({ queryKey: ["admin", "resellers", status], queryFn: () => resellerService.list(status || undefined), retry: false });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f || "all"} onClick={() => setStatus(f)} className={`rounded-full border px-3 py-1 text-sm ${status === f ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {f ? statusLabel[f] : "Todos"}
          </button>
        ))}
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? (
        <div className="space-y-3">
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          <p className="text-sm text-muted-foreground">Requer login com conta que tenha o papel de administrador. <Link to="/entrar" className="underline">Entrar</Link></p>
        </div>
      ) : q.data.length === 0 ? <EmptyState title="Nenhum cadastro nesta situação." /> : (
        <div className="space-y-4">{q.data.map((a) => <ApplicationCard key={a.id} a={a} />)}</div>
      )}
    </div>
  );
}

function ApplicationCard({ a }: { a: ResellerApplication }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState(false);
  const m = useMutation({
    mutationFn: (action: ReviewAction) => resellerService.review(a.id, action, note, docs),
    onSuccess: (s) => { toast.success(`Cadastro: ${statusLabel[s]}`); void qc.invalidateQueries({ queryKey: ["admin", "resellers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = a.status === "pendente" || a.status === "documentacao_solicitada";
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{a.company_name}{a.trade_name && <span className="text-muted-foreground"> · {a.trade_name}</span>}</p>
          <p className="text-sm text-muted-foreground">CNPJ {fmtCnpj(a.cnpj)} · IE {a.state_registration} ({a.uf})</p>
          <p className="text-sm text-muted-foreground">{a.responsible_name} · {a.email} · {a.phone}</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">{statusLabel[a.status]}</span>
      </div>
      {a.review_note && <p className="mt-3 text-sm"><span className="font-medium">Observação:</span> {a.review_note}</p>}
      {open && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Confira a situação cadastral em fontes oficiais:{" "}
            <a className="inline-flex items-center gap-1 underline" href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noreferrer">Receita Federal <ExternalLink className="size-3" /></a>{" · "}
            <a className="inline-flex items-center gap-1 underline" href="http://www.sintegra.gov.br/" target="_blank" rel="noreferrer">SINTEGRA <ExternalLink className="size-3" /></a>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} />
            Confirmei que CNPJ e IE estão ativos e regulares
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Justificativa (obrigatória para rejeitar ou solicitar documentação)" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={m.isPending || !docs} onClick={() => m.mutate("aprovar")}>Aprovar</Button>
            <Button variant="outline" disabled={m.isPending} onClick={() => m.mutate("solicitar_documentos")}>Solicitar documentação</Button>
            <Button variant="destructive" disabled={m.isPending} onClick={() => m.mutate("rejeitar")}>Rejeitar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
