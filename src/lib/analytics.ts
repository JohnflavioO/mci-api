import { analyticsConfig } from "@/lib/api";

/**
 * Medição de e-commerce (Google Analytics 4 e Meta Pixel).
 *
 * - Nada carrega sem ID configurado (VITE_GA4_MEASUREMENT_ID / VITE_META_PIXEL_ID).
 * - Nada carrega antes do visitante aceitar os cookies de medição (LGPD).
 * - Eventos chamados antes do aceite são descartados, nunca enviados depois.
 * - Nunca enviar dados pessoais (nome, e-mail, telefone, CPF) nos parâmetros.
 */

export type AnalyticsItem = { id: string; name: string; price?: number | null; quantity?: number; category?: string | null; brand?: string | null };
export type ConsentChoice = "granted" | "denied";

type GtagFn = (...args: unknown[]) => void;
type FbqFn = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown; callMethod?: (...args: unknown[]) => void };
type AnalyticsWindow = Window & { dataLayer?: unknown[]; gtag?: GtagFn; fbq?: FbqFn; _fbq?: FbqFn };

const CONSENT_KEY = "mci-analytics-consent";
const PURCHASE_KEY_PREFIX = "mci-purchase-tracked:";
let loaded = false;

const browser = () => (typeof window === "undefined" ? null : (window as AnalyticsWindow));

export const isAnalyticsConfigured = () => {
  const config = analyticsConfig();
  return Boolean(config.ga4MeasurementId || config.metaPixelId);
};

export function getConsent(): ConsentChoice | null {
  try {
    const value = browser()?.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice) {
  try { browser()?.localStorage.setItem(CONSENT_KEY, choice); } catch { /* sem armazenamento: vale só nesta visita */ }
  if (choice === "granted") loadAnalytics();
}

const canTrack = () => loaded && getConsent() === "granted";

function injectScript(src: string) {
  const w = browser();
  if (!w || w.document.querySelector(`script[src="${src}"]`)) return;
  const script = w.document.createElement("script");
  script.async = true;
  script.src = src;
  w.document.head.appendChild(script);
}

/** Carrega GA4 e Pixel uma única vez, só com IDs configurados e consentimento dado. */
export function loadAnalytics() {
  const w = browser();
  if (!w || loaded || getConsent() !== "granted") return;
  const { ga4MeasurementId, metaPixelId } = analyticsConfig();
  if (!ga4MeasurementId && !metaPixelId) return;

  if (ga4MeasurementId) {
    w.dataLayer = w.dataLayer || [];
    // gtag precisa enfileirar o objeto "arguments" original, não um array.
    w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); } as GtagFn;
    w.gtag("js", new Date());
    // page_view é enviado manualmente a cada navegação (a loja é uma SPA).
    w.gtag("config", ga4MeasurementId, { send_page_view: false, anonymize_ip: true });
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4MeasurementId)}`);
  }

  if (metaPixelId && !w.fbq) {
    const fbq: FbqFn = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as FbqFn;
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.push = fbq;
    w.fbq = fbq;
    w._fbq = fbq;
    injectScript("https://connect.facebook.net/en_US/fbevents.js");
    w.fbq("init", metaPixelId);
  }

  loaded = true;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const itemsValue = (items: AnalyticsItem[]) => round2(items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0));
const gaItems = (items: AnalyticsItem[]) => items.map((item) => ({
  item_id: item.id,
  item_name: item.name,
  ...(item.price != null ? { price: round2(item.price) } : {}),
  quantity: item.quantity ?? 1,
  ...(item.category ? { item_category: item.category } : {}),
  ...(item.brand ? { item_brand: item.brand } : {}),
}));
const metaContents = (items: AnalyticsItem[]) => ({
  content_ids: items.map((item) => item.id),
  contents: items.map((item) => ({ id: item.id, quantity: item.quantity ?? 1, ...(item.price != null ? { item_price: round2(item.price) } : {}) })),
  content_type: "product",
  num_items: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
});

function send(gaEvent: string, gaParams: Record<string, unknown>, metaEvent?: string, metaParams?: Record<string, unknown>) {
  if (!canTrack()) return;
  const w = browser()!;
  w.gtag?.("event", gaEvent, gaParams);
  if (metaEvent) w.fbq?.("track", metaEvent, metaParams ?? {});
}

export function trackPageView(path: string, title: string) {
  if (!canTrack()) return;
  const w = browser()!;
  w.gtag?.("event", "page_view", { page_path: path, page_location: w.location.href, page_title: title });
  w.fbq?.("track", "PageView");
}

export function trackViewItem(item: AnalyticsItem, currency = "BRL") {
  const items = [{ ...item, quantity: 1 }];
  send("view_item", { currency, value: itemsValue(items), items: gaItems(items) }, "ViewContent", { currency, value: itemsValue(items), ...metaContents(items) });
}

export function trackAddToCart(item: AnalyticsItem, currency = "BRL") {
  const items = [item];
  send("add_to_cart", { currency, value: itemsValue(items), items: gaItems(items) }, "AddToCart", { currency, value: itemsValue(items), ...metaContents(items) });
}

export function trackBeginCheckout(items: AnalyticsItem[], currency = "BRL") {
  send("begin_checkout", { currency, value: itemsValue(items), items: gaItems(items) }, "InitiateCheckout", { currency, value: itemsValue(items), ...metaContents(items) });
}

export function trackAddShippingInfo(items: AnalyticsItem[], shippingTier: string, currency = "BRL") {
  send("add_shipping_info", { currency, value: itemsValue(items), shipping_tier: shippingTier, items: gaItems(items) });
}

export function trackAddPaymentInfo(items: AnalyticsItem[], value: number, currency = "BRL") {
  send("add_payment_info", { currency, value: round2(value), items: gaItems(items) }, "AddPaymentInfo", { currency, value: round2(value), ...metaContents(items) });
}

/** Compra confirmada. Registra cada pedido uma única vez por navegador (recarregar a página não duplica). */
export function trackPurchase(orderId: string, items: AnalyticsItem[], value: number, shipping: number, currency = "BRL") {
  if (!canTrack()) return;
  const key = PURCHASE_KEY_PREFIX + orderId;
  try {
    if (browser()!.localStorage.getItem(key)) return;
    browser()!.localStorage.setItem(key, "1");
  } catch { /* sem armazenamento: segue sem proteção contra duplicidade */ }
  send("purchase", { transaction_id: orderId, currency, value: round2(value), shipping: round2(shipping), items: gaItems(items) },
    "Purchase", { currency, value: round2(value), ...metaContents(items) });
}
