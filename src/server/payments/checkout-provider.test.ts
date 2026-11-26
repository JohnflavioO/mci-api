import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutProvider } from "./checkout-provider";
import { infinitePayConfig } from "./infinitepay-config";
import { createInfinitePayCheckout } from "./infinitepay";

vi.mock("./infinitepay-config", () => ({ infinitePayConfig: vi.fn() }));
vi.mock("./infinitepay", () => ({ createInfinitePayCheckout: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("checkout provider selection", () => {
  const config = { apiKey: "inchk_test", handle: "test", appBaseUrl: "https://example.com", supabaseUrl: "https://example.com", serviceRoleKey: "test" };
  it("preserves InfinitePay by default", () => {
    vi.stubEnv("CHECKOUT_PROVIDER", undefined);
    vi.mocked(infinitePayConfig).mockReturnValue(config);
    expect(checkoutProvider()?.name).toBe("infinitepay");
  });
  it("does not fall back when Rede or an invalid provider is selected", () => {
    vi.mocked(infinitePayConfig).mockReturnValue(config);
    expect(checkoutProvider("rede")).toBeNull();
    expect(checkoutProvider("invalid")).toBeNull();
    expect(infinitePayConfig).not.toHaveBeenCalled();
  });
  it("requires valid existing configuration", () => {
    vi.mocked(infinitePayConfig).mockReturnValue(null);
    expect(checkoutProvider("infinitepay")).toBeNull();
  });
  it("delegates the checkout without changing the input", async () => {
    vi.mocked(infinitePayConfig).mockReturnValue(config);
    const input = {} as Parameters<typeof createInfinitePayCheckout>[1];
    vi.mocked(createInfinitePayCheckout).mockResolvedValue("https://example.com/checkout");
    expect(await checkoutProvider("infinitepay")?.createCheckout(input)).toBe("https://example.com/checkout");
    expect(createInfinitePayCheckout).toHaveBeenCalledWith(config, input);
  });
});
