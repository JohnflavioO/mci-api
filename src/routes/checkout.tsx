import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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
      const { data, error } = await getSupabase().auth.getUser();
      if (error) throw error;
      const user = data.user;
      if (!user) return { name: "", document: "", phone: "", email: "", cep: "", street: "", number: "", complement: "", district: "", city: "", state: "" };
      const meta = user.user_metadata ?? {};
      return {
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
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabase().auth.getUser();
      if (error || !data.user) throw new Error("Entre na sua conta antes de finalizar a compra.");
      const cleaned = Object.fromEntries(Object.entries(delivery).map(([k,v]) => [k, v.trim()]));
      const missing = ["name","document","phone","email","cep","street","number","district","city","state"].find(k => !cleaned[k as keyof typeof cleaned]);
      if (missing) throw new Error("Preencha todos os campos obrigatórios de entrega e identificação.");
      const { error: saveError } = await getSupabase().auth.updateUser({ data: {
        full_name: cleaned.name, cpf: cleaned.document, phone: cleaned.phone,
        shipping_cep: cleaned.cep, shipping_street: cleaned.street, shipping_number: cleaned.number,
        shipping_complement: cleaned.complement, shipping_district: cleaned.district,
        shipping_city: cleaned.city, shipping_state: cleaned.state,
      }});
      if (saveError) throw new Error("Não foi possível salvar os dados do cadastro. Tente novamente.");
      // The order API is not active yet; this call must fail safely until server-side order creation is implemented.
      return orderService.create(items.map((i) => ({ slug: i.slug, qty: i.qty })));
    },
  });
  useEffect(() => {
    if (profile.data) setDelivery(profile.data);
  }, [profile.data]);
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Checkout</h1>
        {profile.isPending ? <p className="mt-8 text-sm text-muted-foreground">Carregando seus dados…</p> : items.length === 0 ? (
          <div className="mt-8"><EmptyState title="Nenhum item para finalizar" /></div>
        ) : (
          <form className="mt-8 space-y-8" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 font-display text-lg font-semibold">Identificação e contato</legend>
              {([
                ["name","Nome completo",true],["document","CPF ou CNPJ",true],["email","E-mail",true],
                ["phone","Telefone/WhatsApp",true]
              ] as const).map(([key,label,required]) => <div key={key}>
                <Label htmlFor={key}>{label}</Label>
                <Input id={key} type={key === "email" ? "email" : "text"} autoComplete={key === "name" ? "name" : key === "email" ? "email" : "off"} required={required} value={delivery[key]} onChange={e=>setDelivery(p=>({...p,[key]:e.target.value}))} className="mt-1" />
              </div>)}
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 font-display text-lg font-semibold">Endereço de entrega</legend>
              {([
                ["cep","CEP",true],["street","Rua / Avenida",true],["number","Número",true],
                ["complement","Complemento",false],["district","Bairro",true],["city","Cidade",true],["state","Estado (UF)",true]
              ] as const).map(([key,label,required]) => <div key={key}>
                <Label htmlFor={key}>{label}{!required ? " (opcional)" : ""}</Label>
                <Input id={key} required={required} maxLength={key==="state"?2:undefined} autoComplete={key==="cep"?"postal-code":key==="street"?"street-address":undefined} value={delivery[key]} onChange={e=>setDelivery(p=>({...p,[key]:e.target.value}))} className="mt-1" />
              </div>)}
            </fieldset>
            <div>
              <p className="font-display text-lg font-semibold">Pagamento</p>
              <p className="mt-1 text-sm text-muted-foreground">As formas de pagamento serão disponibilizadas quando a integração estiver pronta.</p>
            </div>
            <p className="text-sm">{items.reduce((n, i) => n + i.qty, 0)} item(ns) · total calculado pela plataforma</p>
            {m.isError && <ErrorState message={m.error.message} />}
            <Button type="submit" size="lg" disabled={m.isPending || !profile.data}>{m.isPending ? "Validando…" : "Salvar dados e continuar"}</Button>
          </form>
        )}
      </div>
    </SiteShell>
  );
}
