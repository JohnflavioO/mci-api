import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Camera, CheckCircle2, Loader2, Save, UserRound } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/shop/states";

type Profile = {
  userId: string; email: string; fullName: string; avatarUrl: string;
  companyName: string; tradeName: string; cnpj: string; stateRegistration: string;
  uf: string; responsibleName: string; phone: string;
};
const empty: Profile = { userId: "", email: "", fullName: "", avatarUrl: "", companyName: "", tradeName: "", cnpj: "", stateRegistration: "", uf: "", responsibleName: "", phone: "" };
const inputClass = "mt-2 h-11";

export function ResellerAccountSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Profile>(empty);
  const [photo, setPhoto] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["reseller", "account-settings"],
    queryFn: async () => {
      const sb = getSupabase();
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data: app, error } = await sb.from("reseller_applications")
        .select("company_name,trade_name,cnpj,state_registration,uf,responsible_name,email,phone")
        .eq("user_id", auth.user.id).maybeSingle();
      if (error) throw error;
      const meta = auth.user.user_metadata ?? {};
      return {
        ...empty, userId: auth.user.id, email: auth.user.email ?? "",
        fullName: String(meta.full_name ?? meta.name ?? ""),
        avatarUrl: String(meta.avatar_url ?? ""),
        companyName: String(app?.company_name ?? meta.company_name ?? ""),
        tradeName: String(app?.trade_name ?? meta.trade_name ?? ""),
        cnpj: String(app?.cnpj ?? meta.cnpj ?? ""),
        stateRegistration: String(app?.state_registration ?? meta.state_registration ?? ""),
        uf: String(app?.uf ?? meta.uf ?? ""),
        responsibleName: String(app?.responsible_name ?? meta.full_name ?? ""),
        phone: String(app?.phone ?? meta.phone ?? ""),
      } satisfies Profile;
    },
  });
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      let avatarUrl = form.avatarUrl;
      if (photo) {
        if (!photo.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
        if (photo.size > 3 * 1024 * 1024) throw new Error("A foto deve ter no máximo 3 MB.");
        const { data: currentAuth, error: currentAuthError } = await sb.auth.getUser();
        if (currentAuthError) throw new Error(`Não foi possível validar sua sessão antes do upload: ${currentAuthError.message}`);
        const currentUserId = currentAuth.user?.id;
        if (!currentUserId) throw new Error("Sua sessão expirou. Entre novamente antes de enviar a foto.");
        if (currentUserId !== form.userId) throw new Error("A conta ativa mudou desde que esta tela foi aberta. Atualize a página e tente novamente.");
        const path = `${currentUserId}/profile-${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: uploadError } = await sb.storage.from("profile-photos").upload(path, photo, { upsert: false, contentType: photo.type });
        if (uploadError) {
          const detail = uploadError.message || "Erro desconhecido do Supabase Storage";
          const lower = detail.toLowerCase();
          if (lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist"))) {
            throw new Error("O bucket profile-photos não existe no projeto Supabase conectado a este site. Confirme o projeto e execute a migration de armazenamento.");
          }
          if (lower.includes("row-level security") || lower.includes("permission denied") || lower.includes("unauthorized") || lower.includes("not allowed")) {
            throw new Error(`O Supabase bloqueou o envio da foto por permissão. Confira as políticas de Storage para profile-photos. Detalhe: ${detail}`);
          }
          if (lower.includes("payload too large") || lower.includes("exceeded the maximum allowed size")) {
            throw new Error("A imagem excede o limite permitido pelo armazenamento. Escolha uma imagem menor que 3 MB.");
          }
          throw new Error(`Falha no upload da foto (Supabase Storage): ${detail}`);
        }
        const { data } = sb.storage.from("profile-photos").getPublicUrl(path);
        avatarUrl = data.publicUrl;
      }
      const { error: userError } = await sb.auth.updateUser({ data: { full_name: form.fullName.trim(), avatar_url: avatarUrl, phone: form.phone.trim() } });
      if (userError) throw userError;
      const { data: app, error: appError } = await sb.from("reseller_applications").select("id,status").eq("user_id", form.userId).maybeSingle();
      if (appError) throw appError;
      if (app) {
        const { error } = await sb.rpc("update_my_reseller_profile", {
          p_company_name: form.companyName.trim(), p_trade_name: form.tradeName.trim() || null,
          p_state_registration: form.stateRegistration.trim(), p_uf: form.uf.trim().toUpperCase(),
          p_responsible_name: form.responsibleName.trim(), p_phone: form.phone.replace(/\D/g, ""),
        });
        if (error) throw new Error("Os dados pessoais foram salvos, mas não foi possível atualizar os dados comerciais. A atualização comercial precisa estar habilitada no banco.");
      } else if (form.companyName.trim() || form.cnpj.trim()) {
        const { error } = await sb.rpc("submit_my_reseller_application", {
          p_company_name: form.companyName.trim(), p_trade_name: form.tradeName.trim() || null,
          p_cnpj: form.cnpj.replace(/\D/g, ""), p_state_registration: form.stateRegistration.trim(),
          p_uf: form.uf.trim().toUpperCase(), p_responsible_name: form.responsibleName.trim(),
          p_phone: form.phone.replace(/\D/g, ""),
        });
        if (error) throw new Error("Perfil pessoal salvo, mas a inscrição comercial não foi concluída. Confira os dados obrigatórios e tente novamente.");
      }
      return avatarUrl;
    },
    onSuccess: async (avatarUrl) => {
      setForm((current) => ({ ...current, avatarUrl }));
      setPhoto(null);
      setNotice("Configurações salvas com sucesso.");
      await Promise.all([qc.invalidateQueries({ queryKey: ["reseller", "account-settings"] }), qc.invalidateQueries({ queryKey: ["reseller", "access"] })]);
    },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const set = (key: keyof Profile, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fields: { key: keyof Profile; label: string; required?: boolean; span?: boolean; type?: string }[] = [
    { key: "fullName", label: "Nome completo", required: true, span: true },
    { key: "companyName", label: "Razão social", required: true, span: true },
    { key: "tradeName", label: "Nome fantasia" },
    { key: "cnpj", label: "CNPJ", required: true },
    { key: "responsibleName", label: "Responsável", required: true },
    { key: "uf", label: "UF", required: true },
    { key: "stateRegistration", label: "Inscrição estadual", required: true },
    { key: "phone", label: "Telefone", required: true },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="bg-graphite px-6 py-6 text-graphite-foreground sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Minha conta</p>
          <h2 className="mt-2 text-2xl font-bold">Perfil e dados da empresa</h2>
          <p className="mt-1 text-sm text-graphite-muted">Mantenha seus contatos e informações comerciais atualizados.</p>
        </div>
        <div className="grid gap-6 p-6 sm:grid-cols-[180px_1fr] sm:p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="grid size-28 place-items-center overflow-hidden rounded-full border bg-secondary">
              {form.avatarUrl ? <img src={form.avatarUrl} alt="Foto do perfil" className="size-full object-cover" /> : <UserRound className="size-12 text-muted-foreground" />}
            </div>
            <Label htmlFor="profile-photo" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary"><Camera className="size-4" /> Alterar foto</Label>
            <input id="profile-photo" type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            <p className="text-center text-xs text-muted-foreground">Imagem JPG, PNG ou WebP, até 3 MB.</p>
            {photo && <p className="max-w-full truncate text-xs">{photo.name}</p>}
          </div>
          <div className="grid content-start gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="profile-email">E-mail da conta</Label><Input id="profile-email" value={form.email} disabled className={inputClass} /><p className="mt-1 text-xs text-muted-foreground">Para trocar o e-mail, será necessário confirmar o novo endereço.</p></div>
            <div className="sm:col-span-2"><Label htmlFor="profile-name">Nome completo</Label><Input id="profile-name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required className={inputClass} /></div>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-secondary"><Building2 className="size-5" /></span><div><h3 className="text-lg font-semibold">Dados da empresa</h3><p className="mt-1 text-sm text-muted-foreground">Informações utilizadas na análise comercial da MCI.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.filter((f) => f.key !== "fullName").map((f) => <div key={f.key} className={f.span ? "sm:col-span-2" : ""}><Label htmlFor={f.key}>{f.label}</Label><Input id={f.key} value={String(form[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} required={f.required} className={inputClass} disabled={f.key === "cnpj" && Boolean(query.data.cnpj)} /></div>)}
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-sm">{save.isSuccess ? <span className="flex items-center gap-2 text-green-700"><CheckCircle2 className="size-4" />{notice}</span> : save.isError ? <span className="text-destructive">{save.error.message}</span> : <span className="text-muted-foreground">As alterações são salvas na sua conta.</span>}</div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar alterações</Button>
        </div>
      </section>
    </div>
  );
}
