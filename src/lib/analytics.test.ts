import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type W = Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[]; fbq?: unknown };

async function freshModule() {
  vi.resetModules();
  return import("./analytics");
}

describe("analytics", () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.querySelectorAll("script").forEach((script) => script.remove());
    delete (window as W).gtag;
    delete (window as W).dataLayer;
    delete (window as W).fbq;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fica desligada sem IDs configurados", async () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "");
    vi.stubEnv("VITE_META_PIXEL_ID", "");
    const analytics = await freshModule();
    expect(analytics.isAnalyticsConfigured()).toBe(false);
    analytics.setConsent("granted");
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("não carrega nada antes do consentimento nem após recusa", async () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");
    const analytics = await freshModule();
    analytics.loadAnalytics();
    expect(document.head.querySelector("script")).toBeNull();
    analytics.setConsent("denied");
    expect(document.head.querySelector("script")).toBeNull();
    expect((window as W).gtag).toBeUndefined();
  });

  it("carrega após o aceite e registra cada compra uma única vez", async () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST1234");
    const analytics = await freshModule();
    analytics.setConsent("granted");
    expect(document.head.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-TEST1234"]')).not.toBeNull();

    const gtag = vi.fn();
    (window as W).gtag = gtag;
    const items = [{ id: "p1", name: "Halo amaran 200x", price: 2499, quantity: 1 }];
    analytics.trackPurchase("order-1", items, 2545.48, 46.48);
    analytics.trackPurchase("order-1", items, 2545.48, 46.48);
    const purchases = gtag.mock.calls.filter(([type, name]) => type === "event" && name === "purchase");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]![2]).toMatchObject({ transaction_id: "order-1", currency: "BRL", value: 2545.48, shipping: 46.48 });
  });

  it("ignora IDs com formato inválido", async () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "UA-123");
    vi.stubEnv("VITE_META_PIXEL_ID", "abc");
    const analytics = await freshModule();
    expect(analytics.isAnalyticsConfigured()).toBe(false);
  });
});
