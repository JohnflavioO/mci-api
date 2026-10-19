const baseUrl = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

export const isApiConfigured = () => baseUrl !== "";

/**
 * Token da sessão atual, mantido só em memória. Nenhum login real existe ainda:
 * o futuro fluxo de autenticação deve chamar setAuthToken() após o servidor emitir o token.
 */
let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token && token.trim() ? token : null;
};
export const hasAuthToken = () => authToken !== null;

/** Lança ApiError (nunca erro genérico) para a interface tratar sem quebrar. */
export async function apiFetch<T>(path: string, init?: RequestInit, timeoutMs = 10000): Promise<T> {
  if (!baseUrl) throw new ApiError("Servidor não configurado", null);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor", null);
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(body?.error ?? `Erro ${res.status}`, res.status);
  return body as T;
}
