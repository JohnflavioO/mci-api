/** Relatório de comissões de afiliados: situação legível de cada comissão e exportação CSV. */

export type CommissionStage = "pending" | "available" | "in_payout" | "paid" | "reversed" | "reversed_after_payout" | "cancelled";

export const STAGE_LABEL: Record<CommissionStage, [string, string]> = {
  pending: ["Em liberação", "bg-amber-50 text-amber-800"],
  available: ["Disponível", "bg-sky-50 text-sky-800"],
  in_payout: ["Em saque", "bg-violet-50 text-violet-800"],
  paid: ["Paga", "bg-emerald-50 text-emerald-700"],
  reversed: ["Estornada", "bg-rose-50 text-rose-700"],
  reversed_after_payout: ["Estornada após saque", "bg-rose-50 text-rose-700"],
  cancelled: ["Cancelada", "bg-secondary text-muted-foreground"],
};

export type CommissionRow = {
  status: string;
  payout_id: string | null;
  reversed_at: string | null;
  payout_status?: string | null;
};

/**
 * Situação da comissão no ciclo da fase 2:
 * em liberação -> disponível -> em saque -> paga; estorno antes do saque anula,
 * estorno depois de entrar num saque vira desconto no próximo saque.
 */
export function commissionStage(row: CommissionRow): CommissionStage {
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "reversed") return "reversed";
  if (row.reversed_at) return "reversed_after_payout";
  if (row.status === "paid") return "paid";
  if (row.status === "available" && row.payout_id && row.payout_status === "requested") return "in_payout";
  if (row.status === "available") return "available";
  return "pending";
}

const csvCell = (value: unknown) => {
  const text = value == null ? "" : String(value);
  // Evita que planilhas executem fórmulas vindas dos dados (=, +, -, @).
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV com ponto e vírgula e vírgula decimal, como o Excel em português espera. */
export function toCsv(header: string[], rows: unknown[][]) {
  const num = (v: unknown) => (typeof v === "number" ? v.toFixed(2).replace(".", ",") : v);
  return "﻿" + [header, ...rows].map((r) => r.map((v) => csvCell(num(v))).join(";")).join("\r\n");
}
