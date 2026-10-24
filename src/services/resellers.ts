import { ApiError } from "@/lib/api";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type ResellerStatus = "pendente" | "documentacao_solicitada" | "aprovado" | "rejeitado";
export type ReviewAction = "aprovar" | "rejeitar" | "solicitar_documentos";

export type ResellerApplication = {
  id: string; user_id: string; company_name: string; trade_name: string | null; cnpj: string;
  state_registration: string; uf: string; responsible_name: string; email: string; phone: string;
  status: ResellerStatus; review_note: string | null; documents_confirmed: boolean;
  reviewed_at: string | null; created_at: string;
};

export const statusLabel: Record<ResellerStatus, string> = {
  pendente: "Pendente",
  documentacao_solicitada: "Documentação solicitada",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

const cols = "id,user_id,company_name,trade_name,cnpj,state_registration,uf,responsible_name,email,phone,status,review_note,documents_confirmed,reviewed_at,created_at";

function fail(e: { code?: string; message?: string }): never {
  if (e.code === "42501") throw new ApiError("Acesso restrito a administradores.", 403);
  if (e.code === "PGRST205" || e.code === "42P01" || e.code === "PGRST202")
    throw new ApiError("O cadastro de revendedores ainda não foi ativado no banco.", 501);
  if (e.code === "23514" || e.code === "22023" || e.code === "P0002") throw new ApiError(e.message ?? "Dados inválidos.", 422);
  throw new ApiError("Não foi possível concluir a operação.", 500);
}

async function session() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

/** Valida a revisão antes de chamar o banco (o banco revalida e decide). */
export function checkReview(action: ReviewAction, note: string, documentsConfirmed: boolean): string | null {
  if (action === "aprovar" && !documentsConfirmed) return "Confirme a regularidade do CNPJ e da IE antes de aprovar.";
  if (action !== "aprovar" && note.trim().length < 5) return "Informe a justificativa (mínimo 5 caracteres).";
  return null;
}

export const resellerService = {
  /** Situação do usuário logado: sem sessão, revendedor liberado, ou status do pedido. */
  async myAccess(): Promise<{ signedIn: boolean; isReseller: boolean; application: ResellerApplication | null }> {
    const s = await session();
    if (!s) return { signedIn: false, isReseller: false, application: null };
    const sb = getSupabase();
    const [role, app] = await Promise.all([
      sb.rpc("has_role", { _role: "revendedor" }),
      sb.from("reseller_applications").select(cols).eq("user_id", s.user.id).maybeSingle(),
    ]);
    if (role.error) fail(role.error);
    if (app.error) fail(app.error);
    return { signedIn: true, isReseller: role.data === true, application: (app.data as ResellerApplication | null) ?? null };
  },

  async list(status?: ResellerStatus): Promise<ResellerApplication[]> {
    if (!(await session())) throw new ApiError("Entre com uma conta administradora.", 401);
    let q = getSupabase().from("reseller_applications").select(cols).order("created_at", { ascending: true });
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) fail(error);
    return (data ?? []) as ResellerApplication[];
  },

  async updateApplication(id: string, patch: Pick<ResellerApplication, "company_name" | "trade_name" | "cnpj" | "state_registration" | "uf" | "responsible_name" | "email" | "phone">): Promise<void> {
    if (!(await session())) throw new ApiError("Entre com uma conta administradora.", 401);
    const clean = {
      company_name: patch.company_name.trim(),
      trade_name: patch.trade_name?.trim() || null,
      cnpj: patch.cnpj.replace(/\\D/g, ""),
      state_registration: patch.state_registration.trim(),
      uf: patch.uf.trim().toUpperCase(),
      responsible_name: patch.responsible_name.trim(),
      email: patch.email.trim().toLowerCase(),
      phone: patch.phone.trim(),
    };
    if (!clean.company_name || clean.cnpj.length !== 14 || !clean.state_registration || !/^[A-Z]{2}$/.test(clean.uf) || !clean.responsible_name || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(clean.email) || !clean.phone) {
      throw new ApiError("Revise os campos obrigatórios. O CNPJ deve conter 14 dígitos e a UF duas letras.", 422);
    }
    const { error } = await getSupabase().from("reseller_applications").update(clean).eq("id", id);
    if (error) fail(error);
  },

  async deleteApplication(id: string): Promise<void> {
    if (!(await session())) throw new ApiError("Entre com uma conta administradora.", 401);
    const { error } = await getSupabase().from("reseller_applications").delete().eq("id", id);
    if (error) fail(error);
  },

  async review(id: string, action: ReviewAction, note: string, documentsConfirmed: boolean): Promise<ResellerStatus> {
    const msg = checkReview(action, note, documentsConfirmed);
    if (msg) throw new ApiError(msg, 422);
    const { data, error } = await getSupabase().rpc("review_reseller_application", {
      p_id: id, p_action: action, p_note: note.trim() || null, p_documents_confirmed: documentsConfirmed,
    });
    if (error) fail(error);
    return data as ResellerStatus;
  },
};
