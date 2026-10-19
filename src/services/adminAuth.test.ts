import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("administrative login and import preview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("calls the real login path and passes its returned token to preview, never to a save request", async () => {
    // Fixtures exist only in this unit test; the application never manufactures tokens.
    const serverToken = "unit-test-server-response";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: serverToken }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: "Produto", previewOnly: true, savedToDatabase: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { authService } = await import("./index");
    const { productImportService } = await import("./productImport");
    const { hasAuthToken } = await import("@/lib/api");
    await authService.login(" admin@example.test ", "test-password", true);
    expect(hasAuthToken()).toBe(true);
    const result = await productImportService.preview("https://www.mci.tv/produto/x");
    expect(result.name).toBe("Produto");
    expect(result.savedToDatabase).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [loginUrl, loginInit] = fetchMock.mock.calls[0] ?? [];
    expect(loginUrl).toBe("https://api.example.test/api/v1/admin/auth/login");
    expect(JSON.parse(loginInit.body)).toEqual({ email: "admin@example.test", password: "test-password" });
    expect(loginInit.headers.Authorization).toBeUndefined();
    const [previewUrl, previewInit] = fetchMock.mock.calls[1] ?? [];
    expect(previewUrl).toBe("https://api.example.test/api/v1/admin/products/import/preview");
    expect(previewInit.headers.Authorization).toBe(`Bearer ${serverToken}`);
    expect(JSON.parse(previewInit.body)).toEqual({ url: "https://www.mci.tv/produto/x" });
  });

  it("does not send a preview without a server-issued session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { productImportService } = await import("./productImport");
    await expect(productImportService.preview("https://www.mci.tv/p")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a rejected login session and never displays the server login body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "sensitive-server-detail" }), { status: 401 })));
    const { setAuthToken, hasAuthToken } = await import("@/lib/api");
    const { loginAdmin } = await import("./adminAuth");
    setAuthToken("previous-test-session");
    await expect(loginAdmin("admin@example.test", "invalid")).rejects.toMatchObject({ status: 401, message: "E-mail ou senha inválidos." });
    expect(hasAuthToken()).toBe(false);
  });

  it("does not create a session when a successful login omits the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 })));
    const { loginAdmin } = await import("./adminAuth");
    const { hasAuthToken } = await import("@/lib/api");
    await expect(loginAdmin("admin@example.test", "test-password")).rejects.toMatchObject({ status: 502 });
    expect(hasAuthToken()).toBe(false);
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

  it("leaves the unrelated customer login pending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { authService } = await import("./index");
    await expect(authService.login("customer@example.test", "test-password")).rejects.toMatchObject({ status: 501 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});