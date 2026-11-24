/** Validação das alterações que o admin faz em afiliados e produtos (usada por /api/admin/affiliates). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AffiliatePatch =
  | { kind: "affiliate"; userId: string; values: { status?: "active" | "suspended"; commission_override_pct?: number | null } }
  | { kind: "product"; productId: string; values: { affiliate_pct: number | null } };

/** Percentual opcional: null/"" limpa (volta ao padrão); senão número entre 0 e 100 com até 2 casas. */
export function parsePct(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function parseAffiliatePatch(body: unknown): { ok: true; patch: AffiliatePatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Dados inválidos." };
  const b = body as Record<string, unknown>;

  if (b["kind"] === "affiliate") {
    const userId = typeof b["user_id"] === "string" ? b["user_id"] : "";
    if (!UUID.test(userId)) return { ok: false, error: "Afiliado inválido." };
    const values: { status?: "active" | "suspended"; commission_override_pct?: number | null } = {};
    if ("status" in b) {
      if (b["status"] !== "active" && b["status"] !== "suspended") return { ok: false, error: "Situação inválida." };
      values.status = b["status"];
    }
    if ("commission_override_pct" in b) {
      const pct = parsePct(b["commission_override_pct"]);
      if (!pct.ok) return { ok: false, error: "A comissão do afiliado deve ficar entre 0 e 100%." };
      values.commission_override_pct = pct.value;
    }
    if (!Object.keys(values).length) return { ok: false, error: "Nada para alterar." };
    return { ok: true, patch: { kind: "affiliate", userId, values } };
  }

  if (b["kind"] === "product") {
    const productId = typeof b["product_id"] === "string" ? b["product_id"] : "";
    if (!UUID.test(productId)) return { ok: false, error: "Produto inválido." };
    const pct = parsePct(b["affiliate_pct"]);
    if (!pct.ok) return { ok: false, error: "A comissão do produto deve ficar entre 0 e 100%." };
    return { ok: true, patch: { kind: "product", productId, values: { affiliate_pct: pct.value } } };
  }

  return { ok: false, error: "Tipo de alteração inválido." };
}
