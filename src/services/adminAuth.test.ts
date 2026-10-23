import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("administrative login and import preview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("does not send a preview without a server-issued session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { productImportService } = await import("./productImport");
    await expect(productImportService.preview("https://www.mci.tv/p")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears an expired preview session on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Autenticação necessária" }), { status: 401 })));
    const { setAuthToken, hasAuthToken } = await import("@/lib/api");
    const { productImportService } = await import("./productImport");
    setAuthToken("expired-test-session");
    await expect(productImportService.preview("https://www.mci.tv/p")).rejects.toMatchObject({ status: 401 });
    expect(hasAuthToken()).toBe(false);
  });

  it("preserves backend denial on 403 without bypassing permissions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const { setAuthToken } = await import("@/lib/api");
    const { productImportService } = await import("./productImport");
    setAuthToken("non-admin-test-session");
    await expect(productImportService.preview("https://www.mci.tv/p")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});

describe("Supabase login (cliente e administrador)", () => {
  const auth = { signInWithPassword: vi.fn(), signOut: vi.fn() };
  const rpc = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    auth.signInWithPassword.mockReset(); auth.signOut.mockReset(); rpc.mockReset();
    vi.doMock("@/lib/supabase", () => ({ getSupabase: () => ({ auth, rpc }) }));
  });
  afterEach(() => vi.doUnmock("@/lib/supabase"));

  it("admin entra só quando has_role('admin') confirma", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    const { loginAdmin } = await import("./adminAuth");
    await loginAdmin(" Admin@Example.test ", "pw");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "admin@example.test", password: "pw" });
    expect(rpc).toHaveBeenCalledWith("has_role", { _role: "admin" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("conta sem papel admin é desconectada com 403", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: false, error: null });
    const { loginAdmin } = await import("./adminAuth");
    await expect(loginAdmin("u@example.test", "pw")).rejects.toMatchObject({ status: 403 });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("senha errada retorna 401 sem expor a mensagem do servidor", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "sensitive-detail" } });
    const { loginAdmin } = await import("./adminAuth");
    await expect(loginAdmin("u@example.test", "x")).rejects.toMatchObject({ status: 401, message: "E-mail ou senha inválidos." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("login de cliente usa o Supabase e não checa papel admin", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    const { authService } = await import("./index");
    await authService.login("c@example.test", "pw");
    expect(auth.signInWithPassword).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
