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
  // Prioridade: especificação estruturada correspondente ao nome OU ao valor.
  const structured = product.specs.find((spec) => matcher.test(spec.label) || matcher.test(spec.value));
  if (structured?.value) return structured.value;

  // Fonte complementar: descrição e ficha técnica inteira, incluindo pares rótulo/valor.
  // Só extraímos valores quando há unidade ou contexto técnico explícito.
  const source = [
    product.name,
    product.description ?? "",
    ...product.specs.flatMap((spec) => [`${spec.label}: ${spec.value}`, spec.label, spec.value]),
  ].filter(Boolean).join(" | ");
  const text = source.replace(/\s+/g, " ");

  const patterns: { test: RegExp; value: (match: RegExpMatchArray) => string }[] =
    matcher.source.includes("pot") || matcher.source.includes("power|consumo")
      ? [
          { test: /(?:pot[eê]ncia(?:\s+(?:nominal|m[aá]xima|de sa[ií]da))?|consumo(?:\s+(?:nominal|m[aá]ximo))?|power(?:\s+(?:consumption|output|rating))?)\s*[:=\-]?\s*(\d+(?:[.,]\d+)?)\s*(W|watts?)\b/i, value: m => `${m[1]} ${m[2].toUpperCase()}` },
          { test: /\b(\d+(?:[.,]\d+)?)\s*(W|watts?)\b/i, value: m => `${m[1]} ${m[2].toUpperCase()}` },
        ]
      : matcher.source.includes("lux") || matcher.source.includes("ilumin")
        ? [
            { test: /(?:ilumin[aâ]ncia|illuminance|lux(?:\s+(?:a|at|@))?)\s*[:=\-]?\s*(\d[\d.,]*)\s*(lux|lx)?(?:\s*(?:a|at|@)\s*(\d+(?:[.,]\d+)?)\s*m)?/i, value: m => `${m[1]} lux${m[3] ? ` a ${m[3]} m` : ""}` },
            { test: /\b(\d[\d.,]*)\s*(lux|lx)\b(?:\s*(?:a|at|@)\s*(\d+(?:[.,]\d+)?)\s*m)?/i, value: m => `${m[1]} lux${m[3] ? ` a ${m[3]} m` : ""}` },
          ]
        : matcher.source.includes("rgb") || matcher.source.includes("bicolor")
          ? [
              { test: /\b(RGBWW?|RGBACL|RGBLAC|bi[ -]?color|bicolor|daylight|tungsten|双色|双色温)\b/i, value: m => m[1].replace(/bi[ -]?color/i, "Bi-color").replace(/rgb/i, v => v.toUpperCase()) },
            ]
          : matcher.source.includes("temperatura") || matcher.source.includes("kelvin")
            ? [
                { test: /(?:temperatura de cor|color temperature|CCT|faixa de cor)\s*[:=\-]?\s*(\d{4})\s*[-–—a]\s*(\d{4})\s*K?/i, value: m => `${m[1]}–${m[2]} K` },
                { test: /\b(\d{4,5})\s*K\b/i, value: m => `${m[1]} K` },
              ]
            : matcher.source.includes("ngulo") || matcher.source.includes("beam")
              ? [
                  { test: /(?:beam angle|[aâ]ngulo(?:\s+de\s+abertura)?|beam)\s*[:=\-]?\s*(\d+(?:[.,]\d+)?)\s*°?/i, value: m => `${m[1]}°` },
                ]
              : matcher.source.includes("cri") || matcher.source.includes("reprodu")
                ? [
                    { test: /\b(CRI|Ra)\s*(?:[:=≥>])?\s*(\d{2,3})\+?\b/i, value: m => `${m[1].toUpperCase()} ${m[2]}` },
                    { test: /\bTLCI\s*(?:[:=≥>])?\s*(\d{2,3})\+?\b/i, value: m => `TLCI ${m[1]}` },
                  ]
                : [
                    { test: /(?:alimenta[cç][aã]o|voltagem|tens[aã]o|input voltage|AC input)\s*[:=\-]?\s*(100\s*[-–]\s*240|110|120|127|220|230|240)\s*V\b/i, value: m => m[1].replace(/\s+/g, "") + " V" },
                    { test: /\b(bateria|battery|USB-C|USB type-c)\b/i, value: m => m[1] },
                  ];

  for (const pattern of patterns) {
    const found = text.match(pattern.test);
    if (found) return pattern.value(found);
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
