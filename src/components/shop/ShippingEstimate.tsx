import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, MapPin, Store, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ShippingOption = { id: string; provider: string; service: string; price: number; delivery_days: number | null; description: string };

const CEP_KEY = "mci-shipping-cep";
const onlyDigits = (value: string) => value.replace(/[^0-9]/g, "");
const formatCep = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Nome legível da modalidade; o provedor devolve nomes curtos como ".Package" ou "SEDEX". */
export function shippingOptionLabel(option: Pick<ShippingOption, "provider" | "service">) {
  if (option.provider === "pickup") return "Retirada no local";
  const service = option.service.replace(/^[.]/, "").trim();
  return option.provider && !service.toLowerCase().includes(option.provider.toLowerCase())
    ? `${option.provider} ${service}`.trim()
    : service || option.provider;
}

export const deliveryLabel = (days: number | null) =>
  days == null ? null : days === 1 ? "Chega em até 1 dia útil" : `Chega em até ${days} dias úteis`;

/**
 * Cotação de frete na página do produto, antes do carrinho e sem exigir login.
 * Usa o mesmo serviço do checkout; o valor final é confirmado ao criar o pedido.
 */
export function ShippingEstimate({ productId, qty }: { productId: string; qty: number }) {
  const [cep, setCep] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CEP_KEY);
      if (saved) setCep(formatCep(saved));
    } catch { /* armazenamento indisponível: o cliente digita o CEP */ }
  }, []);

  const quote = useMutation({
    mutationFn: async (destination: string) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Envia a sessão quando existir (o servidor valida); sem login a cotação também funciona.
      try {
        const { getSupabase, isSupabaseConfigured } = await import("@/lib/supabase");
        if (isSupabaseConfigured()) {
          const { data } = await getSupabase().auth.getSession();
          if (data.session) headers["Authorization"] = `Bearer ${data.session.access_token}`;
        }
      } catch { /* segue sem sessão */ }
      const response = await fetch("/api/shipping", {
        method: "POST",
        headers,
        body: JSON.stringify({ cep: destination, items: [{ product_id: productId, qty }] }),
      });
      const body = await response.json().catch(() => ({})) as { options?: ShippingOption[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível calcular o frete agora. Tente novamente em instantes.");
      return [...(body.options ?? [])].sort((a, b) => a.price - b.price);
    },
  });

  // Mudou a quantidade ou o produto: a cotação anterior deixa de valer.
  useEffect(() => { quote.reset(); }, [productId, qty]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    try { localStorage.setItem(CEP_KEY, digits); } catch { /* ignora */ }
    quote.mutate(digits);
  };

  const options = quote.data ?? [];
  const delivery = options.filter((option) => option.provider !== "pickup");
  const pickup = options.find((option) => option.provider === "pickup");
  const fastest = delivery.reduce<ShippingOption | null>((best, option) =>
    option.delivery_days != null && (best?.delivery_days == null || option.delivery_days < best.delivery_days) ? option : best, null);

  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-card p-4" aria-label="Calcular frete e prazo">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-brand" aria-hidden />
        <h2 className="text-sm font-bold">Frete e prazo de entrega</h2>
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="shipping-cep" className="sr-only">CEP de entrega</label>
        <Input
          id="shipping-cep"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="Seu CEP"
          value={cep}
          onChange={(event) => setCep(formatCep(event.target.value))}
          className="h-10 max-w-[10rem] rounded-xl"
        />
        <Button type="submit" variant="outline" className="h-10 rounded-xl" disabled={onlyDigits(cep).length !== 8 || quote.isPending}>
          {quote.isPending ? <><Loader2 className="mr-1.5 size-4 animate-spin" />Calculando</> : "Calcular"}
        </Button>
      </form>
      <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline">Não sei meu CEP</a>

      <div aria-live="polite">
        {quote.isError && <p role="alert" className="mt-3 text-sm text-destructive">{quote.error.message}</p>}
        {quote.isSuccess && options.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nenhuma modalidade de entrega disponível para este CEP. Fale com nosso atendimento.</p>}
        {options.length > 0 && (
          <ul className="mt-3 divide-y rounded-xl border border-border/70">
            {delivery.map((option) => (
              <li key={option.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{shippingOptionLabel(option)}{option === fastest && delivery.length > 1 && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">Mais rápido</span>}</span>
                  {deliveryLabel(option.delivery_days) && <span className="block text-xs text-muted-foreground">{deliveryLabel(option.delivery_days)}</span>}
                </span>
                <strong className="shrink-0 tabular-nums">{money(option.price)}</strong>
              </li>
            ))}
            {pickup && (
              <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Store className="size-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0"><span className="block font-medium">Retirada no local</span>{pickup.description && <span className="block truncate text-xs text-muted-foreground">{pickup.description}</span>}</span></span>
                <strong className="shrink-0 text-emerald-700">Grátis</strong>
              </li>
            )}
          </ul>
        )}
        {options.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />Enviado do Brasil, sem taxa de importação na entrega. Valor para {qty} {qty === 1 ? "unidade" : "unidades"}; confirmado no checkout.</p>
        )}
      </div>
    </section>
  );
}
