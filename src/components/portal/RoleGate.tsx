import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Libera o conteúdo só com sessão válida e o papel exigido no banco (has_role).
 * Sem sessão → /entrar; sem papel → página inicial. RLS continua sendo a barreira real.
 */
export function RoleGate({ role, children }: { role: "afiliado" | "revendedor"; children: ReactNode }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!isSupabaseConfigured()) throw new Error("off");
        const sb = getSupabase();
        const { data } = await sb.auth.getSession();
        if (!data.session) {
          if (active) void navigate({ to: "/entrar", replace: true });
          return;
        }
        const { data: ok, error } = await sb.rpc("has_role", { _role: role });
        if (!active) return;
        if (error || ok !== true) setDenied(true);
        else setAllowed(true);
      } catch {
        if (active) setDenied(true);
      }
    })();
    return () => { active = false; };
  }, [navigate, role]);

  if (allowed) return <>{children}</>;
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-muted-foreground">{denied ? "Sua conta não tem acesso a este portal." : "Verificando seu acesso…"}</p>
      {denied && <button onClick={() => void navigate({ to: "/" })} className="text-sm font-semibold underline">Voltar para a loja</button>}
    </div>
  );
}
