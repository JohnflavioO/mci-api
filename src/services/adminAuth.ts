import { apiFetch, ApiError, setAuthToken } from "@/lib/api";

/** Accept only a nonempty token actually issued by the external API. */
function readToken(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const body = response as Record<string, unknown>;
  for (const key of ["token", "accessToken", "access_token"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim() && !/\s/.test(value)) return value;
  }
  return null;
}

export async function loginAdmin(email: string, password: string): Promise<void> {
  setAuthToken(null);
  let response: unknown;
  try {
    response = await apiFetch<unknown>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch (error) {
    // Never render a login response that could echo credentials or a token.
    const status = error instanceof ApiError ? error.status : null;
    const message = status === 401 ? "E-mail ou senha inválidos."
      : status === 403 ? "Acesso administrativo não autorizado."
      : "Não foi possível entrar. Tente novamente.";
    throw new ApiError(message, status);
  }
  const token = readToken(response);
  if (!token) throw new ApiError("O servidor não retornou um token de acesso válido.", 502);
  setAuthToken(token);
}