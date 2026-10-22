import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { hasAuthToken } from "@/lib/api";

/**
 * Bloqueia a renderização do portal administrativo sem uma sessão criada pelo
 * login administrativo. A autorização real dos dados deve continuar no backend/RLS.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!hasAuthToken()) {
      void navigate({ to: "/entrar", search: { admin: true }, replace: true });
      return;
    }
    setAllowed(true);
  }, [navigate]);

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Verificando acesso administrativo…</p>
      </div>
    );
  }

  return <>{children}</>;
}
