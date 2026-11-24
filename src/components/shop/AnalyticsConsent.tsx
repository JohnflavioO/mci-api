import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConsent, isAnalyticsConfigured, loadAnalytics, setConsent, trackPageView } from "@/lib/analytics";

/** Último endereço registrado (no módulo: sobrevive a remontagens do componente). */
let lastPageView = "";

/** Áreas internas não entram na medição de marketing. */
const isPrivatePath = (path: string) => /^\/(admin|admin-login|revendedor|afiliado)(\/|$)/.test(path);

/**
 * Aviso de cookies (LGPD) e envio de page_view a cada navegação.
 * Só aparece quando há um ID de medição configurado; sem aceite nenhum script de terceiros carrega.
 */
export function AnalyticsConsent() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAnalyticsConfigured()) return;
    const choice = getConsent();
    if (choice === "granted") loadAnalytics();
    setOpen(choice === null);

    const send = () => {
      const path = router.state.location.pathname;
      const full = path + (router.state.location.searchStr ?? "");
      // O roteador também avisa "resolvido" na primeira carga; o mesmo endereço não é contado duas vezes.
      if (full === lastPageView || isPrivatePath(path)) return;
      lastPageView = full;
      trackPageView(full, document.title);
    };
    send();
    // O título da página é atualizado depois da navegação; espera um ciclo para lê-lo.
    return router.subscribe("onResolved", () => { window.setTimeout(send, 0); });
  }, [router]);

  if (!open) return null;
  const choose = (choice: "granted" | "denied") => {
    setConsent(choice);
    setOpen(false);
    if (choice === "granted") {
      // A página atual foi aberta antes do aceite: registra agora a visita a ela.
      const path = router.state.location.pathname;
      lastPageView = path + (router.state.location.searchStr ?? "");
      if (!isPrivatePath(path)) trackPageView(lastPageView, document.title);
    }
  };

  return (
    <div role="dialog" aria-live="polite" aria-label="Preferências de cookies" className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-xl rounded-2xl border bg-background p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:mx-0 sm:w-[26rem]">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Cookie className="size-4" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Cookies de medição</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Usamos cookies do Google e da Meta para entender como a loja é usada e medir nossos anúncios. Você pode recusar sem afetar suas compras.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="rounded-lg" onClick={() => choose("granted")}>Aceitar</Button>
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => choose("denied")}>Recusar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
