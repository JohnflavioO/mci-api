import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("prévia de importação (rota do próprio site)", () => {
  const getSession = vi.fn();
  beforeEach(() => {
    vi.resetModules(); getSession.mockReset();
    vi.doMock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { getSession } }) }));
  });
  afterEach(() => { vi.doUnmock("@/lib/supabase"); vi.unstubAllGlobals(); });
  const run = async (status: number) => {
    getSession.mockResolvedValue({ data: { session: { access_token: "t" } } });
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "x", name: "Produto" }), { status }));
    vi.stubGlobal("fetch", f);
    const { productImportService } = await import("./productImport");
    return { f, p: productImportService.preview("https://www.mci.tv/p") };
  };
  it("sem sessão não chama o servidor", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const { productImportService } = await import("./productImport");
    await expect(productImportService.preview("https://www.mci.tv/p")).rejects.toMatchObject({ status: 401 });
    expect(f).not.toHaveBeenCalled();
  });
  it("envia o token da sessão e mantém 401/403 do servidor", async () => {
    const a = await run(200); await expect(a.p).resolves.toMatchObject({ name: "Produto" });
    const call = a.f.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("/api/admin/import-preview");
    expect((call[1].headers as Record<string, string>)["Authorization"]).toBe("Bearer t");
    await expect((await run(401)).p).rejects.toMatchObject({ status: 401 });
    await expect((await run(403)).p).rejects.toMatchObject({ status: 403 });
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
