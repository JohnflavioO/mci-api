import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SiteShell } from "@/components/shop/SiteShell";
import { EmptyState, ErrorState } from "@/components/shop/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/lib/cart";
import { orderService } from "@/services";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout | MCI Comercial" },
      { name: "description", content: "Informe entrega e pagamento para finalizar seu pedido MCI." },
      { property: "og:title", content: "Checkout | MCI Comercial" },
      { property: "og:description", content: "Informe entrega e pagamento para finalizar seu pedido MCI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { items } = useCart();
  const profile = useQuery({
    queryKey: ["checkout-profile"],
    queryFn: async () => {
      const { data, error } = await getSupabase().auth.getSession();
      if (error) throw error;
      const user = data.session?.user ?? null;
      if (!user) return { authenticated: false, name: "", document: "", phone: "", email: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
      const meta = user.user_metadata ?? {};
      return {
        authenticated: true,
        name: String(meta.full_name ?? ""),
        document: String(meta.cpf ?? meta.cnpj ?? ""),
        phone: String(meta.phone ?? ""),
        email: user.email ?? "",
        cep: String(meta.shipping_cep ?? ""),
        street: String(meta.shipping_street ?? ""),
        number: String(meta.shipping_number ?? ""),
        complement: String(meta.shipping_complement ?? ""),
        district: String(meta.shipping_district ?? ""),
        city: String(meta.shipping_city ?? ""),
        state: String(meta.shipping_state ?? ""),
      };
    },
    staleTime: 60_000,
    retry: false,
  });
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [delivery, setDelivery] = useState({ name: "", document: "", phone: "", email: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
  const [shippingOptions, setShippingOptions] = useState<Array<{ id: string; provider: string; service: string; price: number; delivery_days: number | null; description: string; quote_token: string }>>([]);
  const [productsSubtotal, setProductsSubtotal] = useState<number | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<{ provider: string; service: string; quote_token: string } | null>(null);
  const [pickupAuthorization, setPickupAuthorization] = useState({ name: "", cpf: "", plate: "" });
  const [shippingProviders, setShippingProviders] = useState<{ melhor_envio?: string; pickup?: string }>({});
  const shippingMutation = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      let { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("Entre ou crie sua conta para consultar o frete e concluir a compra.");
      const response = await fetch("/api/shipping", { method: "POST", headers: { Authorization: "Bearer " + data.session.access_token, "Content-Type": "application/json" }, body: JSON.stringify({ cep: delivery.cep, items: items.map((i) => ({ product_id: i.slug, qty: i.qty })) }) });
      const result = await response.json().catch(() => ({})) as { options?: typeof shippingOptions; products_subtotal?: number; providers?: { melhor_envio?: string; pickup?: string }; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível calcular o frete.");
      return result;
    },
    onSuccess: (result) => { setShippingOptions(result.options || []); setProductsSubtotal(Number.isFinite(result.products_subtotal) ? Number(result.products_subtotal) : null); setShippingProviders(result.providers || {}); setSelectedShipping(null); },
  });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const m = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      let { data, error } = await supabase.auth.getSession();
      if (error) throw new Error("Não foi possível iniciar a compra agora. Confira sua conexão ou entre na sua conta para continuar.");
      if (!data.session) throw new Error("Entre ou crie sua conta para concluir a compra.");
      const cleaned = Object.fromEntries(
        Object.entries(delivery).map(([k, v]) => [k, typeof v === "string" ? v.trim() : ""]),
      ) as typeof delivery;
      const missing = ["name", "document", "phone", "email", "cep", "street", "number", "district", "city", "state"].find(k => !cleaned[k as keyof typeof cleaned]);
      if (missing) throw new Error("Preencha todos os campos obrigatórios de entrega e identificação.");
      if (!selectedShipping) throw new Error("Calcule e selecione o frete antes de continuar para o pagamento.");
      const pickup = selectedShipping.provider === "pickup";
      const pickupData = { name: pickupAuthorization.name.trim(), cpf: pickupAuthorization.cpf.replace(/\D/g, ""), plate: pickupAuthorization.plate.trim().toUpperCase() };
      if (pickup && (!pickupData.name || pickupData.cpf.length !== 11 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$|^[A-Z]{3}-?[0-9]{4}$/.test(pickupData.plate))) throw new Error("Para retirar no Armazém Sanco, informe nome completo, CPF válido e placa do veículo.");
      if (!data.session?.user) throw new Error("Não foi possível iniciar sua sessão de compra. Entre ou crie uma conta para continuar.");
      // O pedido recebe uma cópia permanente dos dados no servidor para faturamento e expedição.
      await supabase.auth.updateUser({ data: {
        full_name: cleaned.name, cpf: cleaned.document, phone: cleaned.phone,
        shipping_cep: cleaned.cep, shipping_street: cleaned.street, shipping_number: cleaned.number,
        shipping_complement: cleaned.complement, shipping_district: cleaned.district,
        shipping_city: cleaned.city, shipping_state: cleaned.state,
      }});
      return orderService.create(items.map((i) => ({ slug: i.slug, qty: i.qty })), cleaned as typeof delivery, idempotencyKey, selectedShipping, pickup ? pickupData : null);
    },
    onSuccess: (result) => { window.location.assign(result.checkout_url); },
  });
  useEffect(() => {
    if (!profile.data) return;
    if (!profile.data.authenticated) setAuthDialogOpen(true);
    const { name, document, phone, email, cep, street, number, complement, district, city, state } = profile.data;
    setDelivery({ name, document, phone, email, cep, street, number, complement, district, city, state });
  }, [profile.data]);
  return (
    <SiteShell>
      <div className="min-h-screen bg-[#f5f6f8]">
        <Dialog open={authDialogOpen && profile.data?.authenticated === false} onOpenChange={setAuthDialogOpen}>
          <DialogContent className="max-w-md overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
            <div className="bg-gradient-to-br from-[#171a1f] via-[#252a31] to-[#353b44] px-6 py-7 text-white">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-[#ff681f] shadow-lg shadow-orange-950/30"><LockKeyhole className="size-6" /></div>
              <DialogHeader>
                <DialogTitle className="text-left text-2xl font-bold text-white">Entre para concluir sua compra</DialogTitle>
                <DialogDescription className="mt-2 text-left leading-6 text-white/75">Para consultar as opções de entrega e finalizar o pedido com segurança, entre na sua conta ou crie uma gratuitamente.</DialogDescription>
              </DialogHeader>
            </div>
            <div className="space-y-3 px-6 py-5">
              <div className="flex items-start gap-3 rounded-xl bg-orange-50 p-3 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#e95712]" />
                <span>Seu carrinho será mantido. Depois de entrar, você poderá continuar o checkout sem adicionar os produtos novamente.</span>
              </div>
              <Link to="/entrar" search={{ redirect: "/checkout" }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#ff681f] px-4 py-3 text-sm font-bold text-white shadow-md shadow-orange-200 transition hover:bg-[#e95712]">Entrar na minha conta <ArrowRight className="size-4" /></Link>
              <Link to="/cadastro" search={{ tipo: "cliente", redirect: "/checkout" }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50"><UserRound className="size-4" /> Criar conta gratuitamente</Link>
              <p className="text-center text-xs text-muted-foreground">É rápido e gratuito. Seus dados ficam protegidos.</p>
            </div>
          </DialogContent>
        </Dialog>
        <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <div className="mb-7 rounded-2xl bg-gradient-to-r from-[#171a1f] to-[#30343b] px-6 py-6 text-white shadow-lg sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a50]">Store House · Compra segura</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Finalizar sua compra</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Falta pouco! Confirme seus dados, escolha como receber e revise o valor antes de pagar.</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-white/80 sm:mt-0">
            <span className="grid size-7 place-items-center rounded-full bg-brand text-brand-foreground">1</span>
            Seus dados <span className="h-px w-6 bg-border" />
            <span className="grid size-7 place-items-center rounded-full border border-border">2</span> Pagamento
          </div>
        </div>
        {profile.isPending ? <p className="mt-8 text-sm text-muted-foreground">Carregando seus dados…</p> : items.length === 0 ? (
          <div className="mt-8"><EmptyState title="Nenhum item para finalizar" /></div>
        ) : (
          <>
          {!profile.data?.authenticated && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Quer agilizar suas próximas compras?</span>
            <span className="flex gap-3 font-semibold">
              <Link to="/entrar" className="text-brand underline underline-offset-4">Entrar</Link>
              <Link to="/cadastro" className="text-brand underline underline-offset-4">Criar conta</Link>
            </span>
          </div>}
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            {profile.isError && <p role="status" className="text-sm text-muted-foreground">Não foi possível carregar seus dados salvos. Você pode preencher os campos manualmente.</p>}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold">Identificação e contato</h2>
                <p className="text-sm text-muted-foreground">Esses dados serão usados no pedido e na emissão da nota fiscal.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["name", "Nome completo", true], ["document", "CPF ou CNPJ", true], ["email", "E-mail", true],
                ["phone", "Telefone/WhatsApp", true]
              ] as const).map(([key, label, required]) => <div key={key}>
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} type={key === "email" ? "email" : "text"} autoComplete={key === "name" ? "name" : key === "email" ? "email" : "off"} required={required} value={delivery[key]} onChange={e => { setDelivery(p => ({ ...p, [key]: e.target.value })); if (key === "cep") { setShippingOptions([]); setProductsSubtotal(null); setSelectedShipping(null); } }} className="mt-1" />
              </div>)}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold">Endereço de entrega</h2>
                <p className="text-sm text-muted-foreground">Informe onde deseja receber sua compra.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["cep", "CEP", true], ["street", "Rua / Avenida", true], ["number", "Número", true],
                ["complement", "Complemento", false], ["district", "Bairro", true], ["city", "Cidade", true], ["state", "Estado (UF)", true]
              ] as const).map(([key, label, required]) => <div key={key}>
                <Label htmlFor={key}>{label}{!required ? " (opcional)" : ""}</Label>
                <Input id={key} required={required} maxLength={key === "state" ? 2 : undefined} autoComplete={key === "cep" ? "postal-code" : key === "street" ? "street-address" : undefined} value={delivery[key]} onChange={e => { setDelivery(p => ({ ...p, [key]: e.target.value })); if (key === "cep") { setShippingOptions([]); setProductsSubtotal(null); setSelectedShipping(null); setShippingProviders({}); } }} className="mt-1" />
              </div>)}
              </div>
            </section>
            <section className="rounded-2xl border border-orange-200 bg-gradient-to-br from-white to-orange-50/50 p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Frete e entrega</h2><p className="text-sm text-muted-foreground">Calcule o valor para o CEP informado antes de pagar.</p></div>
                <Button type="button" variant="default" className="min-w-52 bg-[#ff681f] text-white shadow-md shadow-orange-200 transition hover:bg-[#e95712]" disabled={!profile.data?.authenticated || shippingMutation.isPending || delivery.cep.replace(/[^0-9]/g, "").length !== 8} onClick={() => shippingMutation.mutate()}>{!profile.data?.authenticated ? "Entre para consultar o frete" : shippingMutation.isPending ? "Consultando transportadoras…" : "Consultar opções de frete"}</Button></div>
              {shippingMutation.isError && <p role="alert" className="mt-3 text-sm text-destructive">{shippingMutation.error.message}</p>}
              <div className="mt-4 grid gap-3">
                {shippingOptions.map((option) => {
                  const selected = selectedShipping?.quote_token === option.quote_token;
                  const isPickup = option.provider === "pickup";
                  return <label key={option.id} className={"flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors " + (selected ? "border-[#ff681f] bg-orange-50 ring-2 ring-[#ff681f]/25 shadow-sm" : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40")}>
                    <input type="radio" name="shipping" className="size-4 accent-primary" checked={selected} onChange={() => setSelectedShipping({ provider: option.provider, service: option.service, quote_token: option.quote_token })} />
                    <span className={"grid size-11 shrink-0 place-items-center rounded-xl " + (selected ? "bg-[#ff681f] text-white" : "bg-orange-100 text-[#e95712]")}>{isPickup ? "⌂" : "↗"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{option.provider === "pickup" ? "Retirada no local" : option.service.toLowerCase().includes("package") ? "Jadlog — Entrega padrão" : option.service.toLowerCase().includes(".com") ? "Jadlog — Entrega para e-commerce" : option.service.replace(/^\./, "")}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{option.provider === "pickup" ? "Armazém Sanco" : "Transportadora Jadlog"}</span>
                      {option.delivery_days ? <span className="mt-1 block text-xs text-muted-foreground">Prazo estimado: {option.delivery_days} dia(s) útil(eis)</span> : null}
                    </span>
                    <span className="shrink-0 text-right font-semibold tabular-nums">{option.price === 0 ? "Grátis" : option.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </label>;
                })}
              </div>
              {productsSubtotal !== null && (() => {
                const chosen = selectedShipping ? shippingOptions.find((option) => option.quote_token === selectedShipping.quote_token) : null;
                const total = chosen ? Number((productsSubtotal + chosen.price).toFixed(2)) : null;
                const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                return <div aria-live="polite" className="mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-md">
                  <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4 sm:px-6">
                    <h3 className="font-semibold">Resumo do pedido</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">Confira os valores antes de seguir para o pagamento.</p>
                  </div>
                  <div className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">Produtos ({items.reduce((n, i) => n + i.qty, 0)} item(ns))</span><span className="font-medium tabular-nums">{money(productsSubtotal)}</span></div>
                    <div className="flex items-center justify-between gap-4 text-sm"><span className="text-muted-foreground">Entrega{chosen ? " · " + (chosen.provider === "pickup" ? "Retirada no local" : chosen.service) : ""}</span><span className="font-medium tabular-nums">{chosen ? (chosen.price === 0 ? "Grátis" : money(chosen.price)) : "Selecione uma modalidade"}</span></div>
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between gap-4"><span className="font-semibold">{chosen ? "Total estimado" : "Total parcial"}</span><span className="text-2xl font-extrabold tabular-nums text-[#e95712]">{total === null ? money(productsSubtotal) : money(total)}</span></div>
                      <p className="mt-1 text-xs text-muted-foreground">{chosen ? "Frete incluído no total estimado. O valor será confirmado ao criar o pedido." : "O valor da entrega será somado assim que você selecionar uma modalidade."}</p>
                    </div>
                  </div>
                </div>;
              })()}
              {selectedShipping?.provider === "pickup" && <div className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-950/20">
                <h3 className="font-semibold">Autorização de entrada — Armazém Sanco</h3>
                <p className="mt-1 text-sm text-muted-foreground">O acesso ao local exige identificação prévia. Informe os dados da pessoa que fará a retirada e do veículo.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label htmlFor="pickup-name">Nome completo do responsável</Label><Input id="pickup-name" autoComplete="name" value={pickupAuthorization.name} onChange={e => setPickupAuthorization(p => ({ ...p, name: e.target.value }))} className="mt-1" required /></div>
                  <div><Label htmlFor="pickup-cpf">CPF do responsável</Label><Input id="pickup-cpf" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" value={pickupAuthorization.cpf} onChange={e => setPickupAuthorization(p => ({ ...p, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))} className="mt-1" required /></div>
                  <div><Label htmlFor="pickup-plate">Placa do veículo</Label><Input id="pickup-plate" maxLength={7} placeholder="ABC1D23" value={pickupAuthorization.plate} onChange={e => setPickupAuthorization(p => ({ ...p, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) }))} className="mt-1" required /></div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Esses dados serão enviados à equipe do Armazém Sanco para autorização de acesso e conferência da retirada.</p>
              </div>}
              {shippingMutation.isSuccess && <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">Disponibilidade dos transportadores</p><p className="mt-1 text-muted-foreground">Melhor Envio: {shippingProviders.melhor_envio === "ready" ? "consultado" : "não conectado"} · Retirada: {shippingProviders.pickup === "ready" ? "disponível" : "indisponível"}</p>{shippingOptions.every((option) => option.provider === "pickup") && <p className="mt-2 text-destructive">Nenhuma transportadora retornou cotação. A retirada está disponível, mas o envio para endereço ainda não pode ser selecionado.</p>}</div>}
              {!shippingOptions.length && !shippingMutation.isPending && <p className="mt-3 text-sm text-muted-foreground">Informe o CEP e consulte as opções de entrega disponíveis.</p>}
            </section>
            <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm sm:p-6">
              <h2 className="font-display font-semibold">Pagamento protegido pela InfinitePay</h2>
              <p className="mt-1 text-sm text-muted-foreground">Você concluirá o pagamento no ambiente oficial da InfinitePay, com Pix ou cartão. Os dados do pedido ficam registrados no Store House.</p>
            </section>
            <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-5">
              <div className="text-sm">
                <p className="text-muted-foreground">{items.reduce((n, i) => n + i.qty, 0)} item(ns) no carrinho</p>
                {selectedShipping && productsSubtotal !== null && (() => {
                  const chosen = shippingOptions.find((option) => option.quote_token === selectedShipping.quote_token);
                  return chosen ? <p className="mt-1 font-semibold">Total com entrega: {(productsSubtotal + chosen.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p> : null;
                })()}
              </div>
              <Button type="submit" size="lg" disabled={!profile.data?.authenticated || m.isPending || !selectedShipping} className="min-h-12 min-w-64 bg-[#ff681f] text-white shadow-lg shadow-orange-200 hover:bg-[#e95712]">{m.isPending ? "Preparando seu pagamento…" : "Continuar para pagamento"}</Button>
            </div>
            {m.isError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-semibold text-foreground">Não foi possível continuar agora</p>
              <p className="mt-1 text-sm text-muted-foreground">{m.error.message}</p>
              {!profile.data?.authenticated && <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                <Link to="/entrar" className="text-brand underline underline-offset-4">Entrar na minha conta</Link>
                <Link to="/cadastro" className="text-brand underline underline-offset-4">Criar conta gratuitamente</Link>
              </div>}
              <p className="mt-2 text-xs text-muted-foreground">Seus dados preenchidos permanecem nesta tela. Você não precisa recomeçar o pedido.</p>
            </div>}
          </form>
          </>
        )}
      </div></div>
    </SiteShell>
  );
}
