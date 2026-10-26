import { useMemo, useState } from "react";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatPrice, type CatalogProduct } from "@/services/catalog";
import { catalogService } from "@/services";

type Props = { product: CatalogProduct };

const importantSpecs = [
  { key: "potencia", label: "Potência", match: /pot[eê]ncia|power|consumo/i },
  { key: "lux", label: "Iluminância (lux)", match: /\blux\b|ilumin[aâ]ncia|illuminance/i },
  { key: "light", label: "Tipo de iluminação", match: /rgbw?|bi.?color|bicolor|tipo de luz|light source|fonte de luz|cor da luz/i },
  { key: "cct", label: "Temperatura de cor", match: /temperatura de cor|\bkelvin\b|\bcct\b|\b[0-9]{4}\s?k\b/i },
  { key: "beam", label: "Ângulo de abertura", match: /[aâ]ngulo|beam angle|abertura do feixe/i },
  { key: "cri", label: "Índice de reprodução de cor", match: /\bcri\b|\bra\b|reprodu[cç][aã]o de cor/i },
  { key: "power", label: "Alimentação", match: /alimenta[cç][aã]o|voltagem|tens[aã]o|bateria|power supply/i },
] as const;

function specValue(product: CatalogProduct, matcher: RegExp) {
  // Match structured fields by label only. A value such as USB-C must not be treated as the power source.
  const structured = product.specs.find((spec) => matcher.test(spec.label) && Boolean(spec.value?.trim()));
  if (structured?.value?.trim()) return structured.value.trim();

  const source = [product.description ?? "", ...product.specs.map((spec) => spec.label + ": " + spec.value)]
    .filter(Boolean).join("\n").replace(/\r/g, "");

  const isPower = /pot[eê]ncia|power|consumo/i.test(matcher.source);
  const isLux = /lux|ilumin/i.test(matcher.source);
  const isLight = /rgb|bicolor|tipo de luz|light source|fonte de luz|cor da luz/i.test(matcher.source);
  const isCct = /temperatura de cor|kelvin|cct/i.test(matcher.source);
  const isBeam = /[aâ]ngulo|beam angle|abertura do feixe/i.test(matcher.source);
  const isCri = /\bcri\b|\bra\b|reprodu[cç][aã]o de cor/i.test(matcher.source);
  const isSupply = /alimenta[cç][aã]o|voltagem|tens[aã]o|bateria|power supply/i.test(matcher.source);

  if (isPower) {
    const labeled = source.match(/pot[eê]ncia(?:\s+(?:nominal|m[aá]xima|de sa[ií]da))?\s*[:=–-]?\s*(\d+(?:[.,]\d+)?)\s*(W|watts?)\b/i);
    if (labeled) return labeled[1] + " " + labeled[2].toUpperCase();
    const productPower = source.match(/(?:monolight|LED|luz|light)[^.\n]{0,100}\b(\d+(?:[.,]\d+)?)\s*(W|watts?)\b/i);
    if (productPower) return productPower[1] + " " + productPower[2].toUpperCase();
    const consumption = source.match(/consumo(?:\s+(?:nominal|m[aá]ximo|de energia))?\s*[:=–-]?\s*(\d+(?:[.,]\d+)?)\s*(W|watts?)\b/i);
    if (consumption) return consumption[1] + " " + consumption[2].toUpperCase();
  }

  if (isLux) {
    // Only accept a number BEFORE lux/lx. "lux a 1 m" must never become "1 lux".
    const matches = [...source.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:lux|lx)\b([^.\n]{0,80})/gi)];
    const values = matches.map((m) => {
      const context = m[2] ?? "";
      const distance = context.match(/\b(?:a|at|@)\s*(\d+(?:[.,]\d+)?)\s*m\b/i);
      const condition = /com refletor|with reflector/i.test(context) ? "com refletor"
        : /sem refletor|sem modifica[cç][oõ]es|n[aã]o modificado|without reflector|unmodified/i.test(context) ? "sem refletor" : "";
      return m[1] + " lux" + (distance ? " a " + distance[1] + " m" : "") + (condition ? " (" + condition + ")" : "");
    });
    if (values.length) return [...new Set(values)].join("; ");
  }

  if (isLight) {
    const labeledModes = source.match(/(?:modos? de cor|tipo de ilumina[cç][aã]o|fonte de luz|light source|color modes?)\s*[:=–-]?\s*([^\n.]+)/i);
    if (labeledModes) return labeledModes[1].trim();
    const explicit = source.match(/\b(RGB(?:WW?|ACL|LAC)?|Bi[ -]?color|Bicolor|luz do dia|daylight|tungst[eê]nio|tungsten)\b/gi);
    if (explicit?.length) return [...new Set(explicit.map(v => v.replace(/bi[ -]?color/i, "Bi-color").replace(/rgb/i, v => v.toUpperCase())))].join(", ");
  }

  if (isCct) {
    // Only accept values explicitly associated with CCT / colour-temperature labels.
    const labeledRange = source.match(/(?:CCT(?:\+)?|temperatura de cor|color temperature|faixa de temperatura de cor)\s*[:=–-]?\s*(\d{3,5}(?:[.,]\d+)?)\s*(?:K)?\s*(?:a|até|[-–—])\s*(\d{3,5}(?:[.,]\d+)?)\s*K?/i);
    if (labeledRange) return labeledRange[1] + "–" + labeledRange[2] + " K";
    const labeledSingle = source.match(/(?:CCT(?:\+)?|temperatura de cor|color temperature)\s*[:=–-]?\s*(\d{3,5}(?:[.,]\d+)?)\s*K\b/i);
    if (labeledSingle) return labeledSingle[1] + " K";
  }

  if (isBeam) {
    const angles = [...source.matchAll(/(?:[aâ]ngulo do feixe|beam angle|[aâ]ngulo de abertura|beam)\s*[:=–-]?\s*(\d+(?:[.,]\d+)?)\s*°/gi)];
    if (angles.length) return [...new Set(angles.map(m => m[1] + "°"))].join("; ");
  }

  if (isCri) {
    const cri = source.match(/\bCRI\s*[:=≥>]?\s*(\d{2,3})\+?\b/i);
    const tlci = source.match(/\bTLCI\s*[:=≥>]?\s*(\d{2,3})\+?\b/i);
    const ra = source.match(/\bRa\s*[:=≥>]?\s*(\d{2,3})\+?\b/i);
    const values = [cri ? "CRI " + cri[1] : "", ra ? "Ra " + ra[1] : "", tlci ? "TLCI " + tlci[1] : ""].filter(Boolean);
    if (values.length) return [...new Set(values)].join("; ");
  }

  if (isSupply) {
    const labeledSource = source.match(/(?:fonte de alimenta[cç][aã]o|alimenta[cç][aã]o|power supply|fonte de energia)\s*[:=–-]?\s*([^\n.]+)/i);
    if (labeledSource) {
      const value = labeledSource[1].trim();
      if (value && !/USB-C|DMX|Bluetooth/i.test(value)) return value;
    }
    const voltage = source.match(/(?:pot[eê]ncia de entrada|tens[aã]o de entrada|voltagem|input voltage|AC input)\s*[:=–-]?\s*(100\s*[-–]\s*240|110|120|127|220|230|240)\s*V(?:CA|AC)?\b/i);
    if (voltage) return voltage[1].replace(/\s+/g, "") + " V";
    const ac = source.match(/\b(alimenta[cç][aã]o CA|AC power|bateria|battery)\b/i);
    if (ac) return ac[1];
  }

  return "Não informado";
}
function displayPrice(product: CatalogProduct) {
  return product.customerPrice == null ? "Sob consulta" : formatPrice(product.customerPrice, product.currency);
}

export function ProductComparison({ product }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const productsQuery = useQuery({
    queryKey: ["catalog", "product-comparison"],
    queryFn: catalogService.list,
    enabled: open,
    staleTime: 60_000,
  });

  const candidates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (productsQuery.data?.products ?? []).filter((item) =>
      item.slug !== product.slug &&
      (!term || item.name.toLocaleLowerCase("pt-BR").includes(term) || (item.sku ?? "").toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [productsQuery.data?.products, product.slug, search]);

  const other = productsQuery.data?.products.find((item) => item.slug === selectedId && item.slug !== product.slug) ?? null;

  return (
    <>
      <Button type="button" variant="outline" className="mt-3 h-11 w-full sm:w-auto" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="mr-2 size-4" /> Comparar produto
      </Button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="comparison-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-background p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">MCI Xpress</p>
                <h2 id="comparison-title" className="mt-1 text-xl font-bold sm:text-2xl">Comparar produtos</h2>
                <p className="mt-1 text-sm text-muted-foreground">Compare apenas as principais características técnicas.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar comparação" className="grid size-10 shrink-0 place-items-center rounded-lg border hover:bg-muted"><X className="size-5" /></button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Produto selecionado</p>
                <p className="mt-1 font-semibold">{product.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{product.brand || product.category}</p>
              </div>
              <div className="rounded-xl border p-3">
                <label htmlFor="comparison-search" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Escolha outro produto</label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="comparison-search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} placeholder="Buscar por nome ou SKU" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand" />
                </div>
                {productsQuery.isPending ? <p className="mt-2 text-sm text-muted-foreground">Carregando catálogo…</p> : productsQuery.isError ? <p className="mt-2 text-sm text-destructive">Não foi possível carregar os produtos. Feche e tente novamente.</p> : (
                  <select aria-label="Produto para comparar" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm">
                    <option value="">Selecione um produto</option>
                    {candidates.map((item) => <option key={item.slug} value={item.slug}>{item.name}{item.sku ? ` · ${item.sku}` : ""}</option>)}
                  </select>
                )}
              </div>
            </div>

            {other ? (
              <div className="mt-5 overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead><tr className="bg-muted/60"><th className="w-[30%] p-3 text-left font-semibold">Característica</th><th className="p-3 text-left font-semibold">{product.name}</th><th className="p-3 text-left font-semibold">{other.name}</th></tr></thead>
                  <tbody>
                    {[
                      { label: "Preço", left: displayPrice(product), right: displayPrice(other) },
                      { label: "Marca", left: product.brand || "Não informado", right: other.brand || "Não informado" },
                      { label: "Categoria", left: product.category || "Não informado", right: other.category || "Não informado" },
                      ...importantSpecs.map((spec) => ({ label: spec.label, left: specValue(product, spec.match), right: specValue(other, spec.match) })),
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-border align-top">
                        <th scope="row" className="bg-muted/20 p-3 text-left font-medium text-muted-foreground">{row.label}</th>
                        <td className="p-3 font-medium">{row.left}</td>
                        <td className="p-3 font-medium">{row.right}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed p-8 text-center">
                <ArrowLeftRight className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 font-semibold">Selecione um segundo produto</p>
                <p className="mt-1 text-sm text-muted-foreground">O produto desta página já está selecionado automaticamente.</p>
              </div>
            )}
            <div className="mt-5 flex justify-end"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Fechar</Button></div>
          </section>
        </div>
      )}
    </>
  );
}
