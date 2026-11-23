import { BadgeCheck, CreditCard, ReceiptText, RotateCcw, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Por que comprar aqui e não importar: o que o cliente evita ao comprar de uma loja no Brasil.
 * Cada frase precisa ser verdadeira para todos os produtos. Antes de acrescentar garantia do
 * fabricante, parcelamento sem juros ou "revenda autorizada", confirme com a operação e o jurídico.
 */
export const PURCHASE_ASSURANCES: { icon: LucideIcon; title: string; detail: string }[] = [
  { icon: BadgeCheck, title: "Preço final em reais", detail: "Sem imposto de importação ou taxa cobrada na entrega." },
  { icon: Truck, title: "Enviado do Brasil", detail: "Sem semanas de espera: calcule o prazo pelo seu CEP." },
  { icon: ReceiptText, title: "Nota fiscal na compra", detail: "Emitida no seu CPF ou CNPJ." },
  { icon: CreditCard, title: "Pix ou cartão", detail: "Pagamento protegido pela InfinitePay." },
  { icon: RotateCcw, title: "7 dias para desistir", detail: "Direito de arrependimento em compras online, pelo Código de Defesa do Consumidor." },
];

export function PurchaseAssurances() {
  return (
    <section className="mt-5 rounded-2xl bg-muted/40 p-4" aria-label="Vantagens de comprar na loja">
      <ul className="grid gap-3 sm:grid-cols-2">
        {PURCHASE_ASSURANCES.map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex items-start gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-brand shadow-sm"><Icon className="size-4" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-5">{title}</span>
              <span className="block text-xs leading-5 text-muted-foreground">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
