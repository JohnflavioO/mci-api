import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getSupabase } from "@/lib/supabase";

/**
 * Bloqueia o portal administrativo até confirmar uma sessão Supabase válida
 * e o papel admin no banco. A autorização dos dados também deve ser aplicada
 * por RLS nas tabelas e funções acessadas pelo cliente.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;

    const verify = async () => {
      try {
        const supabase = getSupabase();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !sessionData.session) {
          if (active) void navigate({ to: "/admin-login", replace: true });
          return;
        }

        const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
          _role: "admin",
        });

        if (roleError || isAdmin !== true) {
          await supabase.auth.signOut();
          if (active) void navigate({ to: "/admin-login", replace: true });
          return;
        }

        if (active) setAllowed(true);
      } catch {
        if (active) void navigate({ to: "/admin-login", replace: true });
      }
    };

    void verify();
    return () => {
      active = false;
    };
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
