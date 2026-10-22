import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { resellerService, statusLabel } from "@/services/resellers";
import { ErrorState, LoadingState } from "@/components/shop/states";

/** Libera o portal só para quem tem o papel "revendedor" no banco; o banco (RLS) continua sendo a barreira real. */
export function ResellerGate({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ["reseller", "access"], queryFn: resellerService.myAccess, retry: false });
  if (q.isPending) return <div className="mx-auto max-w-lg p-10"><LoadingState /></div>;
  if (q.isError) return <div className="mx-auto max-w-lg p-10"><ErrorState message={q.error.message} onRetry={() => void q.refetch()} /></div>;
  if (q.data.isReseller) return <>{children}</>;
  const app = q.data.application;
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-bold">Portal do Revendedor</h1>
      {!q.data.signedIn ? (
        <p className="mt-4 text-muted-foreground">Entre com sua conta de revendedor. <Link to="/entrar" className="underline">Entrar</Link> · <Link to="/cadastro" className="underline">Cadastrar</Link></p>
      ) : !app ? (
        <p className="mt-4 text-muted-foreground">Sua conta não possui cadastro de revendedor.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <p>Situação do cadastro: <span className="font-semibold">{statusLabel[app.status]}</span></p>
          {app.review_note && <p className="text-sm text-muted-foreground">Observação: {app.review_note}</p>}
          <p className="text-sm text-muted-foreground">O acesso é liberado após a aprovação do administrador.</p>
        </div>
      )}
    </div>
  );
}
