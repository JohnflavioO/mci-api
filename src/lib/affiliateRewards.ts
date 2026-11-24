/** Validação do catálogo de recompensas e tradução dos erros dos resgates (AFF_*). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export type RewardInput = {
  id: string | null;
  name: string;
  description: string | null;
  points_cost: number;
  stock_quantity: number | null;
  active: boolean;
  image_url: string | null;
};

export function parseRewardInput(body: unknown): { ok: true; reward: RewardInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Dados inválidos." };
  const b = body as Record<string, unknown>;
  const id = b["id"] == null || b["id"] === "" ? null : b["id"];
  if (id !== null && !isUuid(id)) return { ok: false, error: "Recompensa inválida." };
  const name = typeof b["name"] === "string" ? b["name"].trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Informe um nome entre 2 e 120 caracteres." };
  const description = typeof b["description"] === "string" && b["description"].trim() ? b["description"].trim().slice(0, 500) : null;
  const cost = Number(b["points_cost"]);
  if (!Number.isInteger(cost) || cost < 1 || cost > 10_000_000) return { ok: false, error: "O custo deve ser um número inteiro de pontos, maior que zero." };
  const rawStock = b["stock_quantity"];
  let stock: number | null = null;
  if (rawStock !== null && rawStock !== undefined && rawStock !== "") {
    stock = Number(rawStock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000) return { ok: false, error: "O estoque deve ser um número inteiro maior ou igual a zero (vazio = ilimitado)." };
  }
  const image = typeof b["image_url"] === "string" && b["image_url"].trim() ? b["image_url"].trim() : null;
  if (image !== null && (!/^https:\/\/\S+$/i.test(image) || image.length > 2048)) return { ok: false, error: "A imagem precisa ser um link https." };
  return { ok: true, reward: { id: id as string | null, name, description, points_cost: cost, stock_quantity: stock, active: b["active"] !== false, image_url: image } };
}

export const REWARD_ERRORS: Record<string, { status: number; message: string }> = {
  AFF_NOT_FOUND: { status: 404, message: "Cadastro de afiliado não encontrado." },
  AFF_SUSPENDED: { status: 403, message: "Seu cadastro de afiliado está suspenso. Fale com a loja." },
  AFF_REWARD_UNAVAILABLE: { status: 404, message: "Esta recompensa não está mais disponível." },
  AFF_REWARD_OUT_OF_STOCK: { status: 409, message: "Esta recompensa está esgotada no momento." },
  AFF_NOT_ENOUGH_POINTS: { status: 400, message: "Você ainda não tem pontos de recompensa suficientes." },
  AFF_REDEMPTION_NOT_FOUND: { status: 404, message: "Resgate não encontrado." },
  AFF_REDEMPTION_CLOSED: { status: 409, message: "Este resgate já foi concluído ou recusado." },
  AFF_REASON_REQUIRED: { status: 400, message: "Informe o motivo da recusa." },
  AFF_INVALID_ACTION: { status: 400, message: "Ação inválida." },
};

export function rewardError(message: string | undefined) {
  const code = Object.keys(REWARD_ERRORS).find((key) => message?.includes(key));
  return code ? REWARD_ERRORS[code]! : null;
}

export const REDEMPTION_STATUS: Record<string, [string, string]> = {
  requested: ["Em análise", "bg-amber-50 text-amber-800"],
  approved: ["Aprovado", "bg-sky-50 text-sky-800"],
  delivered: ["Entregue", "bg-emerald-50 text-emerald-700"],
  rejected: ["Recusado", "bg-rose-50 text-rose-700"],
  cancelled: ["Cancelado", "bg-secondary text-muted-foreground"],
};
