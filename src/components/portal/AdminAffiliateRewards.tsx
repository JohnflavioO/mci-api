import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Gift, PackageCheck, Pencil, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { REDEMPTION_STATUS } from "@/lib/affiliateRewards";

type Reward = { id: string; name: string; description: string | null; points_cost: number; stock_quantity: number | null; active: boolean; image_url: string | null };
type Redemption = {
  id: string; affiliate_user_id: string; points_cost: number; status: string; created_at: string; reviewed_at: string | null; delivered_at: string | null; admin_note: string | null; email: string | null;
  affiliate_reward_catalog: { name: string } | { name: string }[] | null;
  affiliate_profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};
type Data = { catalog: Reward[]; redemptions: Redemption[] };
type Draft = { id: string | null; name: string; description: string; points_cost: string; stock_quantity: string; active: boolean; image_url: string };
const blank: Draft = { id: null, name: "", description: "", points_cost: "", stock_quantity: "", active: true, image_url: "" };

async function call<T>(method: "GET" | "PUT" | "POST", body?: unknown): Promise<T> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente na Central Administrativa.");
  const response = await fetch("/api/admin/affiliate-rewards", {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result;
}
const first = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
const pts = (n: number) => `${Number(n).toLocaleString("pt-BR")} pts`;
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function AdminAffiliateRewards() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const query = useQuery({ queryKey: ["admin", "affiliates", "rewards"], queryFn: () => call<Data>("GET"), retry: false, staleTime: 15_000 });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin", "affiliates", "rewards"] }), qc.invalidateQueries({ queryKey: ["admin", "affiliates", "program"] })]);
  const save = useMutation({
    mutationFn: (d: Draft) => call("PUT", { ...d, points_cost: d.points_cost, stock_quantity: d.stock_quantity }),
    onSuccess: async () => { await refresh(); setDraft(null); toast.success("Recompensa salva."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const review = useMutation({
    mutationFn: (body: { redemption_id: string; action: "approve" | "deliver" | "reject"; note?: string }) => call("POST", body),
    onSuccess: async (_d, body) => { await refresh(); toast.success(body.action === "reject" ? "Resgate recusado. Pontos e estoque devolvidos." : body.action === "deliver" ? "Resgate marcado como entregue." : "Resgate aprovado."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = (query.data?.redemptions ?? []).filter((r) => filter === "all" || r.status === "requested" || r.status === "approved");
  const deliver = (r: Redemption) => { const note = window.prompt("Como foi entregue? (opcional, o afiliado verá esta nota — ex.: código de rastreio)") ; if (note !== null) review.mutate({ redemption_id: r.id, action: "deliver", note }); };
  const reject = (r: Redemption) => { const note = window.prompt("Motivo da recusa (o afiliado verá esta mensagem; os pontos voltam para ele):"); if (note?.trim()) review.mutate({ redemption_id: r.id, action: "reject", note: note.trim() }); };

  return <div className="space-y-4">
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><h3 className="font-semibold">Catálogo de recompensas</h3><p className="mt-1 text-sm text-muted-foreground">O que os afiliados podem trocar pelos pontos de recompensa. Estoque vazio = ilimitado.</p></div>
        <button type="button" onClick={() => setDraft({ ...blank })} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#171a1f] px-3 text-sm font-semibold text-white"><Plus className="size-4" />Nova recompensa</button>
      </div>
      {draft && <form className="grid gap-3 border-b bg-secondary/30 p-5 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
        <label className="text-sm font-medium">Nome<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`mt-1.5 ${field}`} required /></label>
        <label className="text-sm font-medium">Custo (pontos)<input value={draft.points_cost} onChange={(e) => setDraft({ ...draft, points_cost: e.target.value })} inputMode="numeric" className={`mt-1.5 ${field}`} required /></label>
        <label className="text-sm font-medium md:col-span-2">Descrição<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`mt-1.5 ${field}`} /></label>
        <label className="text-sm font-medium">Estoque<input value={draft.stock_quantity} onChange={(e) => setDraft({ ...draft, stock_quantity: e.target.value })} inputMode="numeric" placeholder="Ilimitado" className={`mt-1.5 ${field}`} /></label>
        <label className="text-sm font-medium">Imagem (link https, opcional)<input value={draft.image_url} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} className={`mt-1.5 ${field}`} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="size-4 accent-orange-600" />Disponível para resgate</label>
        <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={() => setDraft(null)} className="h-10 rounded-md border px-4 text-sm">Cancelar</button><button type="submit" disabled={save.isPending} className="h-10 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50">{save.isPending ? "Salvando…" : "Salvar recompensa"}</button></div>
      </form>}
      {query.isError ? <div className="p-6 text-sm text-destructive">{query.error.message}</div> : query.isPending ? <div className="p-6 text-sm text-muted-foreground">Carregando…</div> : query.data.catalog.length ? <ul className="divide-y">{query.data.catalog.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <span className="flex items-center gap-3"><Gift className={`size-4 ${r.active ? "text-orange-600" : "text-muted-foreground"}`} /><span><span className="font-medium">{r.name}</span>{!r.active && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">Pausada</span>}<span className="block text-xs text-muted-foreground">{pts(r.points_cost)} · {r.stock_quantity == null ? "estoque ilimitado" : `${r.stock_quantity} em estoque`}</span></span></span>
        <button type="button" onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? "", points_cost: String(r.points_cost), stock_quantity: r.stock_quantity == null ? "" : String(r.stock_quantity), active: r.active, image_url: r.image_url ?? "" })} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-secondary"><Pencil className="size-3.5" />Editar</button>
      </li>)}</ul> : <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma recompensa cadastrada. Cadastre a primeira para os afiliados começarem a resgatar.</div>}
    </section>

    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><h3 className="font-semibold">Resgates</h3><p className="mt-1 text-sm text-muted-foreground">Pontos e estoque já estão reservados no pedido. Recusar devolve os dois.</p></div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="open">Em aberto</option><option value="all">Todos</option></select>
      </div>
      {query.data && (rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Pedido em</th><th className="px-5 py-3 font-medium">Afiliado</th><th className="px-5 py-3 font-medium">Recompensa</th><th className="px-5 py-3 font-medium">Situação</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead><tbody className="divide-y">{rows.map((r) => { const [label, cls] = REDEMPTION_STATUS[r.status] ?? [r.status, "bg-secondary"]; const open = r.status === "requested" || r.status === "approved"; return <tr key={r.id} className="align-top">
        <td className="px-5 py-4 text-muted-foreground">{date(r.created_at)}</td>
        <td className="px-5 py-4"><p className="font-medium">{first(r.affiliate_profiles)?.display_name || r.email || r.affiliate_user_id.slice(0, 8)}</p>{r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}</td>
        <td className="px-5 py-4">{first(r.affiliate_reward_catalog)?.name ?? "Recompensa"}<span className="block text-xs text-muted-foreground">{pts(r.points_cost)}</span></td>
        <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{label}</span>{r.admin_note && <p className="mt-1 text-xs text-muted-foreground">{r.admin_note}</p>}</td>
        <td className="px-5 py-4 text-right">{open ? <div className="inline-flex flex-wrap justify-end gap-2">
          {r.status === "requested" && <button type="button" disabled={review.isPending} onClick={() => review.mutate({ redemption_id: r.id, action: "approve" })} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-secondary disabled:opacity-50"><CheckCircle2 className="size-3.5" />Aprovar</button>}
          <button type="button" disabled={review.isPending} onClick={() => deliver(r)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#171a1f] px-3 text-xs font-semibold text-white disabled:opacity-50"><PackageCheck className="size-3.5" />Entregue</button>
          <button type="button" disabled={review.isPending} onClick={() => reject(r)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-200 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="size-3.5" />Recusar</button>
        </div> : <span className="text-xs text-muted-foreground">{r.reviewed_at ? date(r.reviewed_at) : "—"}</span>}</td>
      </tr>; })}</tbody></table></div> : <div className="p-10 text-center text-sm text-muted-foreground">{filter === "open" ? "Nenhum resgate aguardando." : "Nenhum resgate registrado ainda."}</div>)}
    </section>
  </div>;
}
