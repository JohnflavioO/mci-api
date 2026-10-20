import { afterEach, describe, expect, it, vi } from "vitest";
import { setAuthToken, hasAuthToken } from "@/lib/api";
import { publishProduct, ADMIN_PRODUCT_ENDPOINTS } from "./adminProducts";

const reply = (status: number, body: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => { vi.restoreAllMocks(); setAuthToken(null); });

describe("publishProduct", () => {
  it("não chama a API sem sessão administrativa", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    await expect(publishProduct("10")).rejects.toMatchObject({ status: 401 });
    expect(f).not.toHaveBeenCalled();
  });

  it("usa POST /admin/products/:id/publish com Bearer", async () => {
    setAuthToken("tok");
    const f = reply(200, { status: "published" });
    await publishProduct("10");
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toContain(`/api/v1${ADMIN_PRODUCT_ENDPOINTS.publish("10")}`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("401 encerra a sessão", async () => {
    setAuthToken("tok");
    reply(401, { error: "x" });
    await expect(publishProduct("10")).rejects.toMatchObject({ status: 401 });
    expect(hasAuthToken()).toBe(false);
  });

  it("422 mostra o motivo real da API", async () => {
    setAuthToken("tok");
    reply(422, { error: "Preço de revenda ausente" });
    await expect(publishProduct("10")).rejects.toThrow("Preço de revenda ausente");
  });
});
