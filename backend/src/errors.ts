/** Erros HTTP padronizados: { error, code, requestId, fields? }. Mensagens Oracle nunca vão ao cliente. */
export type ErrorCode =
  | "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND"
  | "SKU_DUPLICATE" | "VERSION_CONFLICT" | "PRICING_VERSION_CONFLICT" | "LOCKED"
  | "RULE_VIOLATION" | "INTERNAL";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Dados seguros para log: só códigos e nome de constraint, nunca binds, SQL ou mensagem completa. */
export function oracleInfo(err: unknown): { oraCode?: string; constraint?: string } {
  const e = err as { code?: unknown; errorNum?: unknown; message?: unknown };
  const msg = typeof e?.message === "string" ? e.message : "";
  const code = typeof e?.code === "string" ? e.code : /^(ORA|NJS)-\d+/.exec(msg)?.[0];
  const constraint = /\(([A-Z0-9_$#]+\.)?([A-Z0-9_$#]+)\)/.exec(msg)?.[2];
  return { ...(code && { oraCode: code }), ...(constraint && { constraint }) };
}

export function mapOracleError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  const { oraCode, constraint } = oracleInfo(err);
  switch (oraCode) {
    case "ORA-00001":
      return constraint === "MCI_PRODUCTS_SKU_UQ"
        ? new AppError(409, "SKU_DUPLICATE", "Já existe um produto com este SKU.")
        : new AppError(409, "RULE_VIOLATION", "Registro duplicado.");
    case "ORA-00054":
      return new AppError(409, "LOCKED", "Produto em edição por outra sessão. Tente novamente.");
    case "ORA-02290":
    case "ORA-01400":
    case "ORA-12899":
    case "ORA-02291":
      return new AppError(422, "RULE_VIOLATION", "Os dados não atendem às regras do cadastro.");
    default:
      return null;
  }
}
