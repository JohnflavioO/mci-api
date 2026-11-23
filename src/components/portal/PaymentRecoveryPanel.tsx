import { useEffect, useState } from "react";
import { Copy, MessageCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RECOVERY_MAX_AGE_DAYS, RECOVERY_MIN_AGE_MINUTES, recoverableOrders, recoveryMessage, whatsappRecoveryLink, type RecoverableOrder } from "@/lib/orders";

const REMINDERS_KEY = "mci-admin-recovery-reminders";
const money = (value: number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function timeAgo(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
}

/** Lembretes abertos ficam salvos só neste navegador, para a equipe não repetir o contato. */
function loadReminders(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) ?? "{}") as Record<string, string>; } catch { return {}; }
}

/**
 * Pedidos que chegaram ao pagamento e não pagaram: o atendente abre uma conversa no WhatsApp
 * com a mensagem pronta (revisável antes de enviar). Nada é enviado automaticamente.
 */
export function PaymentRecoveryPanel({ orders }: { orders: RecoverableOrder[] }) {
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setReminders(loadReminders()); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);

  const list = recoverableOrders(orders, new Date(now));
  const pendingValue = list.reduce((sum, order) => sum + Number(order.total), 0);

  const markReminder = (id: string) => {
    const next = { ...reminders, [id]: new Date().toISOString() };
    setReminders(next);
    try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(next)); } catch { /* ignora */ }
  };
  const copyMessage = async (order: RecoverableOrder) => {
    try {
      await navigator.clipboard.writeText(recoveryMessage(order));
      toast.success("Mensagem copiada.");
      markReminder(order.id);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="Recuperação de pagamentos">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><RotateCcw className="size-4 text-sidebar-primary" aria-hidden />Recuperar pagamentos</h3>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Clientes que chegaram ao pagamento e não concluíram, entre {RECOVERY_MIN_AGE_MINUTES} minutos e {RECOVERY_MAX_AGE_DAYS} dias atrás. Abra o WhatsApp com a mensagem pronta e revise antes de enviar.</p>
        </div>
        {list.length > 0 && <p className="text-sm"><strong>{list.length}</strong> {list.length === 1 ? "pedido" : "pedidos"} · <strong>{money(pendingValue)}</strong> a recuperar</p>}
      </div>
      {list.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Nenhum pagamento pendente para recuperar agora.</p>
      ) : (
        <ul className="divide-y">
          {list.map((order) => {
            const link = whatsappRecoveryLink(order);
            const remindedAt = reminders[order.id];
            const items = (order.order_items ?? []).map((item) => `${item.qty}× ${item.name_snapshot}`).join(", ");
            return (
              <li key={order.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{order.customer_name || "Cliente sem nome"} <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</span></p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{items || "Itens não informados"} · {money(order.total)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(order.created_at, now)}{remindedAt ? ` · lembrete aberto ${timeAgo(remindedAt, now)}` : ""}{!link ? " · sem telefone válido" : ""}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyMessage(order)}><Copy className="mr-1.5 size-3.5" />Copiar mensagem</Button>
                  {link ? (
                    <Button asChild size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
                      <a href={link} target="_blank" rel="noreferrer" onClick={() => markReminder(order.id)}><MessageCircle className="mr-1.5 size-3.5" />{remindedAt ? "Abrir de novo" : "Lembrar no WhatsApp"}</a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
