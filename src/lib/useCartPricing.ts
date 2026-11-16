import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { catalogSource } from "@/lib/api";
import type { CartItem } from "@/lib/cart";
import { getSupabase } from "@/lib/supabase";
import { catalogService } from "@/services";
import { calculateVolumeDiscount, type VolumeDiscountRule } from "@/services/volumeDiscounts";

type VolumeQuote = ReturnType<typeof calculateVolumeDiscount>;

export type CartLinePricing = {
  kind: "reseller" | "customer";
  currency: string | null;
  unitPrice: number;
  lineTotal: number;
  /** Detalhe do desconto progressivo; só existe para revendedores. */
  quote: VolumeQuote | null;
};

/**
 * Valores exibidos no carrinho e no checkout. São sempre estimativas lidas do catálogo:
 * o valor cobrado é recalculado pelo servidor ao criar o pedido.
 */
export function useCartPricing(items: CartItem[]) {
  const catalogQuery = useQuery({ queryKey: ["cart-product-thumbnails"], queryFn: () => catalogService.list(), staleTime: 60_000, retry: false });
  const matches = (product: { slug: string; name: string }, item: CartItem) => product.slug === item.slug || product.name === item.name;
  const catalogProduct = (item: CartItem) => catalogQuery.data?.products.find(product => matches(product, item));
  const imageFor = (item: CartItem) => item.image ?? catalogProduct(item)?.images?.[0];

  const resellerEnabled = catalogSource() === "supabase" && items.length > 0;
  const resellerQuery = useQuery({
    queryKey: ["cart-reseller-pricing", items.map(item => `${item.slug}:${item.qty}`).join("|")],
    enabled: resellerEnabled,
    // Mudar a quantidade refaz a consulta; manter o resultado anterior evita o preço piscar.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return { isReseller: false as const, products: [], rules: [] as VolumeDiscountRule[] };
      const { data: isReseller, error: roleError } = await supabase.rpc("has_role", { _role: "revendedor" });
      if (roleError || isReseller !== true) return { isReseller: false as const, products: [], rules: [] as VolumeDiscountRule[] };
      const { createSupabaseCatalog } = await import("@/services/supabaseCatalog");
      const fullRules = await supabase.from("reseller_volume_discount_rules")
        .select("id,min_quantity,max_quantity,discount_type,discount_value,is_active,product_ids,badge_label,display_note,is_featured,sort_order,quantity_discounts")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("min_quantity", { ascending: true });
      // Compatibilidade durante a implantação da migration de merchandising:
      // se os campos visuais ainda não existirem, mantém preço e desconto funcionando.
      const ruleResponse = fullRules.error && /badge_label|display_note|is_featured|sort_order|column .* does not exist|schema cache/i.test(fullRules.error.message)
        ? await supabase.from("reseller_volume_discount_rules")
            .select("id,min_quantity,max_quantity,discount_type,discount_value,is_active,product_ids")
            .eq("is_active", true)
            .order("min_quantity", { ascending: true })
        : fullRules;
      if (ruleResponse.error) throw ruleResponse.error;
      // Busca o catálogo sem o relacionamento aninhado de preços: em alguns esquemas/RLS esse join
      // retorna o produto, mas omite o preço de revenda. O preço é consultado pela tabela autorizada.
      const catalog = createSupabaseCatalog();
      const publishedProducts = await catalog.listPublished();
      const products = await Promise.all(
        publishedProducts
          .filter(product => items.some(item => matches(product, item)))
          .map(async product => ({ ...product, resellerPrice: await catalog.resellerPrice(product.slug) })),
      );
      return { isReseller: true as const, products, rules: (ruleResponse.data ?? []) as VolumeDiscountRule[] };
    },
  });

  const reseller = resellerQuery.data?.isReseller === true ? resellerQuery.data : null;
  const isReseller = reseller !== null;
  // Enquanto o perfil não é conhecido, não mostramos o preço de cliente a quem pode ser revendedor.
  const roleKnown = !resellerEnabled || resellerQuery.isSuccess || resellerQuery.isError;

  const lineFor = (item: CartItem): CartLinePricing | null => {
    if (reseller) {
      const product = reseller.products.find(product => matches(product, item));
      if (!product || product.resellerPrice == null) return null;
      const rules = reseller.rules.filter(rule => (rule.product_ids ?? []).includes(product.slug));
      const quote = calculateVolumeDiscount(product.resellerPrice, item.qty, rules, product.slug);
      return { kind: "reseller", currency: product.currency, unitPrice: quote.discountedUnitPrice, lineTotal: quote.totalAfterDiscount, quote };
    }
    if (!roleKnown || resellerQuery.isError) return null;
    const product = catalogProduct(item);
    if (!product || product.customerPrice == null) return null;
    return { kind: "customer", currency: product.currency, unitPrice: product.customerPrice, lineTotal: Math.round(product.customerPrice * item.qty * 100) / 100, quote: null };
  };

  const lines = items.map(lineFor);
  const complete = items.length > 0 && lines.every(line => line !== null);
  const subtotal = complete ? Math.round(lines.reduce((sum, line) => sum + (line?.lineTotal ?? 0), 0) * 100) / 100 : null;

  return {
    imageFor,
    lineFor,
    isReseller,
    subtotal,
    currency: lines.find(line => line !== null)?.currency ?? "BRL",
    /** Há itens sem preço disponível para o perfil atual. */
    hasUnpriced: items.length > 0 && !complete,
    isPending: !roleKnown || (!isReseller && catalogQuery.isPending),
    isError: resellerQuery.isError || (!isReseller && catalogQuery.isError),
  };
}
