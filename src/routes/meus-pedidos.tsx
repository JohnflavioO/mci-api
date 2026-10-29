import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardList, PackageCheck, UserRound } from "lucide-react";
import { SiteShell } from "@/components/shop/SiteShell";
import { EmptyState, ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { ORDER_STATUS_LABEL, orderService } from "@/services";

export const Route = createFileRoute("/meus-pedidos")({
  head: () => ({
    meta: [
      { title: "Minha conta | MCI Xpress" },
      { name: "description", content: "Consulte seus pedidos e mantenha seus dados de contato atualizados." },
      { property: "og:title", content: "Minha conta | MCI Xpress" },
      { property: "og:description", content: "Consulte seus pedidos e mantenha seus dados de contato atualizados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerAccount,
});

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CustomerAccount() {
  const queryClient = useQueryClient();
  const account = useQuery({
    queryKey: ["customer-account"],
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.getUser();
      if (error) throw error;
      if (!data.user) return null;
      return {
        email: data.user.email ?? "",
        name: String(data.user.user_metadata?.full_name ?? ""),
        phone: String(data.user.user_metadata?.phone ?? ""),
      };
    },
    retry: false,
  });
  const orders = useQuery({ queryKey: ["my-orders"], queryFn: orderService.list, retry: false, enabled: Boolean(account.data) });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (account.data) {
      setName(account.data.name);
      setPhone(account.data.phone);
    }
  }, [account.data]);
  const saveProfile = useMutation({
    mutationFn: async () => {
      const cleanName = name.trim();
      const cleanPhone = phone.trim();
      if (cleanName.length < 2) throw new Error("Informe seu nome completo.");
      if (cleanPhone.replace(/\\D/g, "").length < 10) throw new Error("Informe um telefone com DDD.");
      const { error } = await getSupabase().auth.updateUser({ data: { full_name: cleanName, phone: cleanPhone } });
      if (error) throw new Error("Não foi possível salvar seus dados. Tente novamente.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-account"] }),
  });

  const signedOut = account.data === null || (account.isError && account.error instanceof ApiError && account.error.status === 401);
  return (
    <SiteShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Área do cliente</p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Minha conta</h1>
            <p className="mt-2 text-sm text-muted-foreground">Seus dados e suas compras em um só lugar.</p>
          </div>
          <Button asChild variant="outline"><Link to="/catalogo">Continuar comprando <ArrowRight className="ml-2 size-4" /></Link></Button>
        </div>

        {account.isPending ? <p className="mt-8 text-sm text-muted-foreground">Carregando sua conta…</p>
          : signedOut ? (
            <div className="mt-8 rounded-xl border bg-card p-6">
              <h2 className="font-display text-xl font-semibold">Entre para acessar sua conta</h2>
              <p className="mt-2 text-sm text-muted-foreground">Faça login para consultar pedidos e atualizar seus dados.</p>
              <Button asChild className="mt-4"><Link to="/entrar">Entrar</Link></Button>
            </div>
          ) : account.isError ? <div className="mt-8"><ErrorState message="Não foi possível carregar sua conta. Atualize a página e tente novamente." /></div>
          : (
            <>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary"><UserRound className="size-5" /></div>
                  <p className="mt-4 text-sm text-muted-foreground">Perfil</p>
                  <p className="mt-1 font-semibold">{account.data?.name || "Complete seu nome"}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{account.data?.email}</p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary"><ClipboardList className="size-5" /></div>
                  <p className="mt-4 text-sm text-muted-foreground">Histórico</p>
                  <p className="mt-1 font-semibold">{orders.data ? `${orders.data.length} pedido(s)` : "Pedidos"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Consulte aqui as compras da sua conta.</p>
                </div>
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary"><PackageCheck className="size-5" /></div>
                  <p className="mt-4 text-sm text-muted-foreground">Acompanhamento</p>
                  <p className="mt-1 font-semibold">Status dos pedidos</p>
                  <p className="mt-1 text-sm text-muted-foreground">As atualizações aparecerão quando os pedidos estiverem habilitados.</p>
                </div>
              </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <section className="rounded-xl border bg-card p-6">
                  <h2 className="font-display text-xl font-semibold">Dados pessoais</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Mantenha seu nome e telefone atualizados para facilitar o atendimento.</p>
                  <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}>
                    <div><Label htmlFor="customer-name">Nome completo</Label><Input id="customer-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
                    <div><Label htmlFor="customer-email">E-mail</Label><Input id="customer-email" type="email" value={account.data?.email ?? ""} readOnly disabled className="mt-1 bg-muted" /><p className="mt-1 text-xs text-muted-foreground">Para alterar o e-mail, será necessário confirmar o novo endereço.</p></div>
                    <div><Label htmlFor="customer-phone">Telefone / WhatsApp</Label><Input id="customer-phone" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
                    {saveProfile.isError && <p role="alert" className="text-sm text-destructive">{saveProfile.error.message}</p>}
                    {saveProfile.isSuccess && <p role="status" className="text-sm text-green-700">Dados atualizados.</p>}
                    <Button type="submit" disabled={saveProfile.isPending}>{saveProfile.isPending ? "Salvando…" : "Salvar alterações"}</Button>
                  </form>
                </section>

                <section className="rounded-xl border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="font-display text-xl font-semibold">Meus pedidos</h2><p className="mt-1 text-sm text-muted-foreground">Histórico e situação das suas compras.</p></div>
                  </div>
                  <div className="mt-5">
                    {orders.isPending ? <p className="text-sm text-muted-foreground">Consultando pedidos…</p>
                      : orders.isError ? <div className="rounded-lg border border-dashed p-4"><p className="font-medium">Histórico indisponível no momento</p><p className="mt-1 text-sm text-muted-foreground">{orders.error.message}</p></div>
                      : orders.data.length === 0 ? <EmptyState title="Você ainda não fez pedidos"><Link to="/catalogo" className="underline">Explorar produtos</Link></EmptyState>
                      : <ul className="space-y-3">{orders.data.map((o) => (
                        <li key={o.id} className="rounded-lg border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
                            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
                          </div>
                          <ul className="mt-3 space-y-1 text-sm">{o.order_items.map((i, k) => <li key={k}>{i.qty}× {i.name_snapshot} — {brl(i.unit_price)}</li>)}</ul>
                          <p className="mt-3 font-semibold">Total: {brl(o.total)}</p>
                        </li>
                      ))}</ul>}
                  </div>
                </section>
              </div>
            </>
          )}
      </div>
    </SiteShell>
  );
}
