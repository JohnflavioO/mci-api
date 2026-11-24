/** Chave Pix para saque de afiliado: CPF, CNPJ, e-mail, celular ou chave aleatória. */

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validCpf(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[len])) return false;
  }
  return true;
}

function validCnpj(d: string) {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  for (const len of [12, 13]) {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(d[len])) return false;
  }
  return true;
}

/** Normaliza e valida. Retorna a chave no formato que o banco usa para enviar o Pix. */
export function normalizePixKey(raw: unknown): { ok: true; key: string; type: PixKeyType } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, error: "Informe a chave Pix." };
  if (value.length > 120) return { ok: false, error: "Chave Pix muito longa." };
  if (EVP.test(value)) return { ok: true, key: value.toLowerCase(), type: "random" };
  if (value.includes("@")) {
    return EMAIL.test(value) && value.length <= 77
      ? { ok: true, key: value.toLowerCase(), type: "email" }
      : { ok: false, error: "E-mail inválido para chave Pix." };
  }
  const digits = value.replace(/\D/g, "");
  if (value.startsWith("+")) {
    return /^55\d{10,11}$/.test(digits) ? { ok: true, key: `+${digits}`, type: "phone" } : { ok: false, error: "Celular inválido. Use +55, DDD e número." };
  }
  // Escrito no formato de CPF (000.000.000-00): só pode ser CPF.
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value) && !validCpf(digits)) return { ok: false, error: "CPF inválido. Confira os números." };
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(value) && !validCnpj(digits)) return { ok: false, error: "CNPJ inválido. Confira os números." };
  if (digits.length === 11 && validCpf(digits)) return { ok: true, key: digits, type: "cpf" };
  if (digits.length === 14 && validCnpj(digits)) return { ok: true, key: digits, type: "cnpj" };
  // Celular sem +55: 11 dígitos com DDD e 9 na frente (só se não for um CPF válido).
  if (digits.length === 11 && digits[2] === "9") return { ok: true, key: `+55${digits}`, type: "phone" };
  return { ok: false, error: "Chave Pix inválida. Use CPF, CNPJ, e-mail, celular (+55 DDD número) ou chave aleatória." };
}

/** Mostra só o início e o fim da chave (para listas e confirmações). */
export function maskPixKey(key: string) {
  if (key.length <= 6) return key;
  return `${key.slice(0, 3)}…${key.slice(-3)}`;
}

export const PIX_TYPE_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF", cnpj: "CNPJ", email: "E-mail", phone: "Celular", random: "Chave aleatória",
};

/** Mensagens das regras de saque levantadas pelo banco (AFF_*). */
export const PAYOUT_ERRORS: Record<string, { status: number; message: string }> = {
  AFF_NOT_FOUND: { status: 404, message: "Cadastro de afiliado não encontrado." },
  AFF_SUSPENDED: { status: 403, message: "Seu cadastro de afiliado está suspenso. Fale com a loja." },
  AFF_NO_PIX_KEY: { status: 400, message: "Cadastre sua chave Pix antes de pedir o saque." },
  AFF_OPEN_PAYOUT: { status: 409, message: "Você já tem um saque em análise. Aguarde a conclusão." },
  AFF_BELOW_MINIMUM: { status: 400, message: "Seu saldo disponível ainda não atingiu o saque mínimo." },
  AFF_REFERENCE_REQUIRED: { status: 400, message: "Informe o identificador ou a referência do Pix enviado." },
  AFF_REASON_REQUIRED: { status: 400, message: "Informe o motivo da recusa." },
  AFF_PAYOUT_NOT_FOUND: { status: 404, message: "Saque não encontrado." },
  AFF_PAYOUT_CLOSED: { status: 409, message: "Este saque já foi concluído ou recusado." },
};

export function payoutError(message: string | undefined) {
  const code = Object.keys(PAYOUT_ERRORS).find((key) => message?.includes(key));
  return code ? PAYOUT_ERRORS[code]! : null;
}
