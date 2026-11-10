import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CheckCircle2, ShoppingBag, Tag, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

type Campaign = {
  id: string; kind: "promotion" | "announcement" | "product" | "demo_purchase";
  title: string; message: string; product_name: string | null; image_url: string | null;
  cta_label: string | null; cta_url: string | null; audience: "all" | "visitors" | "customers" | "resellers";
  interval_seconds: number; sort_order: number;
};
type RecentSale = { product_name: string; city: string | null; state: string | null; purchased_at: string };
type FeedItem = {
  id: string; source: "campaign" | "sale"; kind: Campaign["kind"] | "real_purchase";
  title: string; message: string; image_url: string | null; cta_label: string | null; cta_url: string | null;
  interval_seconds: number; demo: boolean;
};

function getSessionFlag(key: string) {
  try { return window.sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function setSessionFlag(key: string) {
  try { window.sessionStorage.setItem(key, "1"); } catch { /* storage unavailable */ }
}

export function StorefrontNotifications() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [audience, setAudience] = useState<"visitors" | "customers" | "resellers">("visitors");
  const [audienceReady, setAudienceReady] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ["storefront-notification-audience"],
    queryFn: async () => {
      const sb = getSupabase();
      const { data } = await sb.auth.getUser();
      if (!data.user) return "visitors" as const;
      const { data: reseller } = await sb.rpc("has_role", { _role: "revendedor" });
      return reseller === true ? "resellers" as const : "customers" as const;
    },
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.data) {
      setAudience(sessionQuery.data);
      setAudienceReady(true);
    } else if (sessionQuery.isError) {
      setAudience("visitors");
      setAudienceReady(true);
    }
  }, [sessionQuery.data, sessionQuery.isError]);

  const campaignsQuery = useQuery({
    queryKey: ["storefront-notifications"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("storefront_notifications")
        .select("id,kind,title,message,product_name,image_url,cta_label,cta_url,audience,interval_seconds,sort_order")
        .eq("is_active", true).order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const settingsQuery = useQuery({
    queryKey: ["storefront-notification-settings"],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("storefront_notification_settings").select("real_sales_enabled").eq("id", true).single();
      if (error) throw error;
      return Boolean(data?.real_sales_enabled);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const salesQuery = useQuery({
    queryKey: ["storefront-recent-paid-sales"],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("get_storefront_recent_sales");
      if (error) throw error;
      return (data ?? []) as RecentSale[];
    },
    enabled: settingsQuery.data === true,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const feed = useMemo<FeedItem[]>(() => {
    const campaigns = (campaignsQuery.data ?? [])
      .filter(item => item.audience === "all" || item.audience === audience)
      .map(item => ({
        id: item.id, source: "campaign" as const, kind: item.kind, title: item.title, message: item.message,
        image_url: item.image_url, cta_label: item.cta_label, cta_url: item.cta_url,
        interval_seconds: item.interval_seconds, demo: item.kind === "demo_purchase",
      }));
    const sales = (salesQuery.data ?? []).map((sale, i) => ({
      id: `paid-sale-${i}-${sale.purchased_at}-${sale.product_name}`, source: "sale" as const,
      kind: "real_purchase" as const, title: "Compra confirmada",
      message: `Um cliente${sale.city ? ` de ${sale.city}${sale.state ? "/" + sale.state : ""}` : ""} adquiriu ${sale.product_name}.`,
      image_url: null, cta_label: null, cta_url: null, interval_seconds: 35, demo: false,
    }));
    return [...sales, ...campaigns];
  }, [campaignsQuery.data, salesQuery.data, audience]);

  const visibleFeed = useMemo(() => feed.filter(item => !dismissed.includes(item.id)), [feed, dismissed]);
  const current = visibleFeed.length ? visibleFeed[index % visibleFeed.length] : null;

  useEffect(() => {
    if (!current) return;
    const impressionKey = `mci-notification-impression-${current.id}`;
    if (!getSessionFlag(impressionKey)) {
      setSessionFlag(impressionKey);
      if (current.source === "campaign") {
        void getSupabase().rpc("track_storefront_notification_event", { p_notification_id: current.id, p_event_type: "impression" });
      }
    }
    const delay = Math.max(15, Math.min(180, current.interval_seconds)) * 1000;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % Math.max(1, visibleFeed.length)), delay);
    return () => window.clearTimeout(timer);
  }, [current?.id, current?.interval_seconds, visibleFeed.length]);

  if (pathname.startsWith("/admin") || pathname.startsWith("/revendedor") || pathname.startsWith("/afiliado") || pathname.startsWith("/entrar") || pathname.startsWith("/cadastro") || pathname.startsWith("/checkout")) return null;
  if (!audienceReady || !current) return null;

  const Icon = current.kind === "promotion" ? Tag : current.kind === "real_purchase" || current.kind === "demo_purchase" ? ShoppingBag : current.kind === "product" ? CheckCircle2 : BellRing;
  const close = () => {
    setDismissed(previous => [...previous, current.id]);
    setIndex(value => visibleFeed.length > 1 ? (value + 1) % (visibleFeed.length - 1) : 0);
  };
  const click = () => {
    if (current.source === "campaign") {
      void getSupabase().rpc("track_storefront_notification_event", { p_notification_id: current.id, p_event_type: "click" });
    }
  };

  return <aside className="fixed bottom-4 left-4 z-[80] w-[min(360px,calc(100vw-2rem))] animate-in slide-in-from-left-3 duration-300" aria-live="polite" aria-label="Notificação da loja">
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3.5 pr-10 shadow-[0_12px_36px_rgba(15,23,42,0.18)]">
      <button type="button" onClick={close} aria-label="Fechar notificação" className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="size-4"/></button>
      <div className="flex items-center gap-3">
        {current.image_url ? <img src={current.image_url} alt="" className="size-14 shrink-0 rounded-lg bg-slate-50 object-contain"/> : <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600"><Icon className="size-6"/></span>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-semibold leading-5 text-slate-900">{current.title}</p>{current.demo && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">Demonstração</span>}</div>
          <p className="mt-1 text-xs leading-5 text-slate-600">{current.message}</p>
          {current.cta_url && current.cta_label && <a href={current.cta_url} onClick={click} target={current.cta_url.startsWith("https://") ? "_blank" : undefined} rel={current.cta_url.startsWith("https://") ? "noopener noreferrer" : undefined} className="mt-2 inline-flex items-center text-xs font-semibold text-orange-600 hover:text-orange-700">{current.cta_label}<span className="ml-1" aria-hidden="true">→</span></a>}
          {!current.cta_url && <p className="mt-1.5 text-[10px] text-slate-400">{current.source === "sale" ? "Pedido com pagamento confirmado" : current.demo ? "Conteúdo ilustrativo" : "Store House · MCI"}</p>}
        </div>
      </div>
      <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-slate-100"><div key={current.id} className="h-full origin-left animate-[notification-progress_var(--notification-duration)_linear_forwards] bg-orange-500" style={{ "--notification-duration": `${current.interval_seconds}s` } as CSSProperties}/></div>
    </div>
  </aside>;
}
