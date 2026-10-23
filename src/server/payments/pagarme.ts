import type { ChargeSnapshot, NormalizedStatus, PaymentProvider } from "./types";

/** Pagar.me API v5 (core). Endpoints usados: GET /charges/{id}, DELETE /charges/{id}. Confirmar versão na conta. */
export const PAGARME_BASE = "https://api.pagar.me/core/v5";

/** Status de cobrança v5 -> status normalizado. Desconhecidos/intermediários => null (ignorado). */
export function normalizeChargeStatus(s: unknown): NormalizedStatus | null {
  switch (s) {
    case "pending":
    case "processing":
      return "pending";
    case "paid":
      return "paid";
    case "failed":
    case "not_authorized":
      return "failed";
    case "canceled":
      return "canceled";
    case "refunded":
      return "refunded";
    case "chargedback":
      return "chargedback";
    default:
      return null; // overpaid/underpaid/etc.: exigem análise manual, nunca aprovação automática
  }
}

/** Comparação em tempo constante (sem depender de node:crypto). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Webhook do Pagar.me autenticado por usuário/senha (Basic) definidos no painel. */
export function verifyBasicAuth(header: string | null, user: string, password: string): boolean {
  if (!header?.startsWith("Basic ") || !user || !password) return false;
  let decoded: string;
  try { decoded = atob(header.slice(6).trim()); } catch { return false; }
  return safeEqual(decoded, `${user}:${password}`);
}

export function createPagarme(secretKey: string, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const auth = `Basic ${btoa(`${secretKey}:`)}`;
  async function call(path: string, init: RequestInit = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetchImpl(`${PAGARME_BASE}${path}`, {
        ...init, signal: ctrl.signal,
        headers: { Authorization: auth, "Content-Type": "application/json", ...init.headers },
      });
      const body = await res.json().catch(() => null);
      // Nunca propaga o corpo (pode conter dados do cliente); só o status.
      if (!res.ok) throw new Error(`pagarme_http_${res.status}`);
      return body as Record<string, unknown>;
    } finally { clearTimeout(t); }
  }
  return {
    name: "pagarme",
    async getCharge(chargeId): Promise<ChargeSnapshot> {
      const c = await call(`/charges/${encodeURIComponent(chargeId)}`);
      const order = (c["order"] ?? null) as { code?: unknown } | null;
      return {
        chargeId: String(c["id"] ?? chargeId),
        orderId: typeof order?.code === "string" ? order.code : null,
        status: normalizeChargeStatus(c["status"]),
        amount: Number(c["amount"] ?? 0) / 100,
      };
    },
    async requestRefund(chargeId, idempotencyKey) {
      await call(`/charges/${encodeURIComponent(chargeId)}`, { method: "DELETE", headers: { "Idempotency-Key": idempotencyKey } });
    },
  };
}
