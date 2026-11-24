/** Store House Pontos: regras de exibição, validação das configurações e mensagens de erro. O banco decide o valor final. */

export const LOYALTY_NAME = "Store House Pontos";

export type LoyaltySettings = {
  enabled: boolean;
  points_per_real: number;
  real_per_100_points: number;
  max_redeem_pct: number;
  min_redeem_points: number;
  grace_days: number;
  expiry_months: number;
};

/** Pontos que uma compra deste valor em produtos rende (para o selo "Ganhe X pontos"). */
export const pointsForAmount = (amount: number | null | undefined, pointsPerReal: number) =>
  amount == null || !Number.isFinite(amount) || amount <= 0 ? 0 : Math.floor(amount * Math.max(0, pointsPerReal));

/** Valor em reais de uma quantidade de pontos (100 pts = real_per_100_points). */
export const discountForPoints = (points: number, realPer100: number) =>
  Math.floor(Math.max(0, Math.floor(points)) * realPer100) / 100;

const bounded = (value: unknown, min: number, max: number, integer: boolean) => {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) return null;
  return n;
};

export function parseLoyaltySettings(body: unknown): { ok: true; settings: LoyaltySettings } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const pointsPerReal = bounded(b["points_per_real"], 0, 100, false);
  const realPer100 = bounded(b["real_per_100_points"], 0.01, 100, false);
  const maxPct = bounded(b["max_redeem_pct"], 1, 50, false);
  const minPoints = bounded(b["min_redeem_points"], 1, 1_000_000, true);
  const grace = bounded(b["grace_days"], 0, 90, true);
  const expiry = bounded(b["expiry_months"], 1, 60, true);
  if (pointsPerReal == null) return { ok: false, error: "Pontos por R$ 1,00 deve ficar entre 0 e 100." };
  if (realPer100 == null) return { ok: false, error: "O valor de 100 pontos deve ficar entre R$ 0,01 e R$ 100,00." };
  if (maxPct == null) return { ok: false, error: "O limite de uso por pedido deve ficar entre 1% e 50% dos produtos." };
  if (minPoints == null) return { ok: false, error: "O mínimo de pontos por resgate deve ser um número inteiro a partir de 1." };
  if (grace == null) return { ok: false, error: "O prazo de liberação deve ficar entre 0 e 90 dias." };
  if (expiry == null) return { ok: false, error: "A validade deve ficar entre 1 e 60 meses." };
  if (typeof b["enabled"] !== "boolean") return { ok: false, error: "Informe se o programa está ativo." };
  return { ok: true, settings: { enabled: b["enabled"], points_per_real: pointsPerReal, real_per_100_points: realPer100, max_redeem_pct: maxPct, min_redeem_points: minPoints, grace_days: grace, expiry_months: expiry } };
}

export const LOYALTY_ERRORS: Record<string, { status: number; message: string }> = {
  LOY_BELOW_MINIMUM: { status: 400, message: "Não foi possível usar os pontos: confira o mínimo por resgate e o seu saldo disponível." },
  LOY_NOT_ELIGIBLE: { status: 403, message: "O Store House Pontos é exclusivo para clientes finais." },
  LOY_DISABLED: { status: 409, message: "O Store House Pontos está pausado no momento." },
  LOY_ORDER_CLOSED: { status: 409, message: "Este pedido não está mais aguardando pagamento." },
  LOY_ORDER_NOT_FOUND: { status: 404, message: "Pedido não encontrado." },
};

export function loyaltyError(message: string | undefined) {
  const code = Object.keys(LOYALTY_ERRORS).find((key) => message?.includes(key));
  return code ? LOYALTY_ERRORS[code]! : null;
}

export const LEDGER_LABEL: Record<string, string> = {
  earn: "Compra", redeem: "Desconto usado", redeem_refund: "Pontos devolvidos", reversal: "Estorno", expire: "Vencidos", adjust: "Ajuste da loja",
};
