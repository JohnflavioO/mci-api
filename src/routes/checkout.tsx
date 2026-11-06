import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [delivery, setDelivery] = useState({ name: "", document: "", phone: "", email: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const m = useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      let { data, error } = await supabase.auth.getSession();
      if (error) throw new Error("Não foi possível iniciar a compra agora. Confira sua conexão ou entre na sua conta para continuar.");
      if (!data.session) {
        const anonymous = await supabase.auth.signInAnonymously();
        if (anonymous.error || !anonymous.data.session) {
          throw new Error("A compra rápida está temporariamente indisponível. Você pode entrar na sua conta ou criar uma gratuitamente para continuar.");
        }
        data = { session: anonymous.data.session };
      }
      const cleaned = Object.fromEntries(Object.entries(delivery).map(([k, v]) => [k, v.trim()]));
      const missing = ["name", "document", "phone", "email", "cep", "street", "number", "district", "city", "state"].find(k => !cleaned[k as keyof typeof cleaned]);
      if (missing) throw new Error("Preencha todos os campos obrigatórios de entrega e identificação.");
      if (!data.session?.user) throw new Error("Não foi possível iniciar sua sessão de compra. Entre ou crie uma conta para continuar.");
      // O pedido recebe uma cópia permanente dos dados no servidor para faturamento e expedição.
      await supabase.auth.updateUser({ data: {
        full_name: cleaned.name, cpf: cleaned.document, phone: cleaned.phone,
        shipping_cep: cleaned.cep, shipping_street: cleaned.street, shipping_number: cleaned.number,
        shipping_complement: cleaned.complement, shipping_district: cleaned.district,
        shipping_city: cleaned.city, shipping_state: cleaned.state,
      }});
      return orderService.create(items.map((i) => ({ slug: i.slug, qty: i.qty })), cleaned as typeof delivery, idempotencyKey);
    },
    onSuccess: (result) => { window.location.assign(result.checkout_url); },
  });
  useEffect(() => {
    if (profile.data) setDelivery(profile.data);
  }, [profile.data]);
  return (
    <SiteShell>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Store House · Compra segura</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Finalizar compra</h1>
            <p className="mt-1 text-sm text-muted-foreground">Só precisamos dos dados para identificar o comprador, emitir a nota fiscal e entregar seu pedido.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="grid size-7 place-items-center rounded-full bg-brand text-brand-foreground">1</span>
            Seus dados <span className="h-px w-6 bg-border" />
            <span className="grid size-7 place-items-center rounded-full border border-border">2</span> Pagamento
          </div>
        </div>
        {profile.isPending ? <p className="mt-8 text-sm text-muted-foreground">Carregando seus dados…</p> : items.length === 0 ? (
          <div className="mt-8"><EmptyState title="Nenhum item para finalizar" /></div>
        ) : (
          <>
          {!profile.data?.authenticated && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Quer agilizar suas próximas compras?</span>
            <span className="flex gap-3 font-semibold">
              <Link to="/entrar" className="text-brand underline underline-offset-4">Entrar</Link>
              <Link to="/cadastro" className="text-brand underline underline-offset-4">Criar conta</Link>
            </span>
          </div>}
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            {profile.isError && <p role="status" className="text-sm text-muted-foreground">Não foi possível carregar seus dados salvos. Você pode preencher os campos manualmente.</p>}
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
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
                <Input id={key} type={key === "email" ? "email" : "text"} autoComplete={key === "name" ? "name" : key === "email" ? "email" : "off"} required={required} value={delivery[key]} onChange={e => setDelivery(p => ({ ...p, [key]: e.target.value }))} className="mt-1" />
              </div>)}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
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
                <Input id={key} required={required} maxLength={key === "state" ? 2 : undefined} autoComplete={key === "cep" ? "postal-code" : key === "street" ? "street-address" : undefined} value={delivery[key]} onChange={e => setDelivery(p => ({ ...p, [key]: e.target.value }))} className="mt-1" />
              </div>)}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-secondary/40 p-5 sm:p-6">
              <h2 className="font-display font-semibold">Pagamento protegido pela InfinitePay</h2>
              <p className="mt-1 text-sm text-muted-foreground">Você concluirá o pagamento no ambiente oficial da InfinitePay, com Pix ou cartão. Os dados do pedido ficam registrados no Store House.</p>
            </section>
            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{items.reduce((n, i) => n + i.qty, 0)} item(ns) no carrinho · valores calculados pela plataforma</p>
              <Button type="submit" size="lg" disabled={m.isPending} className="min-w-64">{m.isPending ? "Preparando seu pagamento…" : "Continuar para pagamento"}</Button>
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
      </div>
    </SiteShell>
  );
}
