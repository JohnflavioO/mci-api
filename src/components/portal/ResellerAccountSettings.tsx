import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Camera, CheckCircle2, Loader2, Save, UserRound, FilePenLine, LockKeyhole } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/shop/states";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

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
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestFields, setRequestFields] = useState<string[]>(["company_name"]);
  const [requestValues, setRequestValues] = useState({ company_name: "", trade_name: "", cnpj: "", state_registration: "", uf: "", responsible_name: "" });
  const [requestReason, setRequestReason] = useState("");
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

  const savePhoto = async () => {
    if (!photo || !photoPreview || !form.userId) return;
    setPhotoSaving(true); setNotice("");
    try {
      const sb = getSupabase();
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth.user || auth.user.id !== form.userId) throw new Error("Sua sessão expirou ou mudou. Entre novamente.");
      const image = new Image(); image.src = photoPreview;
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Não foi possível abrir a imagem.")); });
      const side = Math.min(image.naturalWidth, image.naturalHeight) / cropZoom;
      const cx = image.naturalWidth * cropX / 100; const cy = image.naturalHeight * cropY / 100;
      const sx = Math.max(0, Math.min(image.naturalWidth - side, cx - side / 2));
      const sy = Math.max(0, Math.min(image.naturalHeight - side, cy - side / 2));
      const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Não foi possível preparar a imagem.");
      ctx.drawImage(image, sx, sy, side, side, 0, 0, 512, 512);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Falha ao recortar a imagem.")), "image/jpeg", 0.9));
      const path = auth.user.id + "/profile.jpg";
      const { error: uploadError } = await sb.storage.from("profile-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw new Error("Não foi possível salvar a foto: " + uploadError.message);
      const { data } = sb.storage.from("profile-photos").getPublicUrl(path);
      const avatarUrl = data.publicUrl + "?v=" + Date.now();
      const { error: userError } = await sb.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (userError) throw new Error("A foto foi enviada, mas o perfil não foi atualizado: " + userError.message);
      setForm((current) => ({ ...current, avatarUrl })); setPhoto(null); setPhotoPreview(""); setPhotoDialogOpen(false);
      setNotice("Foto do perfil atualizada."); await qc.invalidateQueries({ queryKey: ["reseller", "account-settings"] });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a foto."); }
    finally { setPhotoSaving(false); }
  };

  const submitChangeRequest = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth.user || auth.user.id !== form.userId) throw new Error("Sua sessão expirou. Entre novamente.");
      if (requestFields.length === 0) throw new Error("Selecione pelo menos um dado para solicitar alteração.");
      if (requestReason.trim().length < 10) throw new Error("Explique o motivo da solicitação (mínimo 10 caracteres).");
      const proposed: Record<string, string> = {};
      for (const key of requestFields) proposed[key] = requestValues[key as keyof typeof requestValues].trim();
      const { error } = await sb.rpc("submit_reseller_change_request", {
        p_requested_fields: requestFields,
        p_proposed_values: proposed,
        p_reason: requestReason.trim(),
      });
      if (error) throw new Error("Não foi possível enviar a solicitação: " + error.message);
    },
    onSuccess: async () => {
      setRequestOpen(false); setRequestReason("");
      setNotice("Solicitação enviada ao Super Admin para análise.");
      await qc.invalidateQueries({ queryKey: ["reseller", "change-requests"] });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      const { data: auth, error: authError } = await sb.auth.getUser();
      if (authError || !auth.user || auth.user.id !== form.userId) throw new Error("Sua sessão expirou. Entre novamente.");
      const phone = form.phone.replace(/\\D/g, "");
      if (phone && !/^\\d{10,11}$/.test(phone)) throw new Error("Informe telefone com DDD (10 ou 11 dígitos).");
      const { error: userError } = await sb.auth.updateUser({ data: { full_name: form.fullName.trim(), phone }, ...(form.email.trim() && form.email.trim() !== auth.user.email ? { email: form.email.trim() } : {}) });
      if (userError) throw new Error("Não foi possível salvar os dados pessoais: " + userError.message);
      const { data: app, error: appError } = await sb.from("reseller_applications").select("id,status").eq("user_id", form.userId).maybeSingle();
      if (appError) throw appError;
      if (app) {
        const { error } = await sb.rpc("update_my_reseller_profile", { p_phone: phone });
        if (error) throw new Error("Dados pessoais salvos, mas o telefone comercial não foi atualizado: " + error.message);
      }
    },
    onSuccess: async () => { setNotice(form.email.trim() !== query.data.email ? "Dados salvos. Verifique a caixa de entrada para confirmar o novo e-mail." : "Dados pessoais e telefone salvos com sucesso."); await Promise.all([qc.invalidateQueries({ queryKey: ["reseller", "account-settings"] }), qc.invalidateQueries({ queryKey: ["reseller", "access"] })]); },
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const set = (key: keyof Profile, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const fields: { key: keyof Profile; label: string; required?: boolean; span?: boolean; type?: string }[] = [
    { key: "fullName", label: "Nome completo", required: true, span: true },
    { key: "phone", label: "Telefone / WhatsApp", required: true },
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
            <Button type="button" variant="outline" className="gap-2" onClick={() => photoInputRef.current?.click()}><Camera className="size-4" /> Alterar foto</Button>
            <input ref={photoInputRef} id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { const file = e.target.files?.[0] ?? null; if (!file) return; if (file.size > 3 * 1024 * 1024) { setNotice("A foto deve ter no máximo 3 MB."); return; } setPhoto(file); setPhotoPreview(URL.createObjectURL(file)); setCropZoom(1); setCropX(50); setCropY(50); setPhotoDialogOpen(true); e.currentTarget.value = ""; }} />
            <p className="text-center text-xs text-muted-foreground">Imagem JPG, PNG ou WebP, até 3 MB.</p>
            {photo && <p className="max-w-full truncate text-xs">{photo.name}</p>}
          </div>
          <div className="grid content-start gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="profile-email">E-mail da conta</Label><Input id="profile-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} /><p className="mt-1 text-xs text-muted-foreground">A troca de e-mail será feita pelo fluxo seguro de confirmação do Supabase.</p></div>
            <div className="sm:col-span-2"><Label htmlFor="profile-name">Nome completo</Label><Input id="profile-name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required className={inputClass} /></div>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-secondary"><Building2 className="size-5" /></span><div><h3 className="text-lg font-semibold">Dados oficiais da empresa</h3><p className="mt-1 text-sm text-muted-foreground">Os dados abaixo são somente para consulta. Para corrigir informações oficiais, envie uma solicitação ao Super Admin.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2">
          {([
            ["companyName", "Razão social"], ["tradeName", "Nome fantasia"], ["cnpj", "CNPJ"], ["stateRegistration", "Inscrição estadual"], ["uf", "UF fiscal"], ["responsibleName", "Responsável legal/comercial"]
          ] as const).map(([key, label]) => <div key={key}><Label htmlFor={"readonly-" + key}>{label}</Label><div className="relative"><Input id={"readonly-" + key} value={form[key] || "Não informado"} readOnly aria-readonly className={inputClass + " bg-muted pr-10 text-muted-foreground"} /><LockKeyhole className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></div></div>)}
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">CNPJ, inscrição estadual e demais dados oficiais não podem ser alterados diretamente pelo revendedor.</p>
          <Button type="button" variant="outline" className="gap-2" onClick={() => { setRequestValues({ company_name: form.companyName, trade_name: form.tradeName, cnpj: form.cnpj, state_registration: form.stateRegistration, uf: form.uf, responsible_name: form.responsibleName }); setRequestOpen(true); }}><FilePenLine className="size-4" /> Solicitar alteração cadastral</Button>
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-lg bg-secondary"><Building2 className="size-5" /></span><div><h3 className="text-lg font-semibold">Contato</h3><p className="mt-1 text-sm text-muted-foreground">Telefone e WhatsApp podem ser atualizados diretamente.</p></div></div>
        <div className="grid gap-5 sm:grid-cols-2"><div><Label htmlFor="profile-phone">Telefone / WhatsApp</Label><Input id="profile-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} required className={inputClass} /></div></div>
        <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-sm">{notice ? <span>{notice}</span> : save.isError ? <span className="text-destructive">{save.error.message}</span> : <span className="text-muted-foreground">A foto é salva separadamente. Dados oficiais exigem aprovação do Super Admin.</span>}</div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar telefone e dados pessoais</Button>
        </div>
      </section>
      <Dialog open={requestOpen} onOpenChange={(open) => !submitChangeRequest.isPending && setRequestOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Solicitar alteração cadastral</DialogTitle><DialogDescription>Selecione os dados que precisam de correção e informe os valores desejados. Nada será alterado até a aprovação do Super Admin.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            {([
              ["company_name", "Razão social"], ["trade_name", "Nome fantasia"], ["cnpj", "CNPJ"], ["state_registration", "Inscrição estadual"], ["uf", "UF fiscal"], ["responsible_name", "Responsável legal/comercial"]
            ] as const).map(([key, label]) => <div key={key} className="rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={requestFields.includes(key)} onChange={(e) => setRequestFields((current) => e.target.checked ? [...current, key] : current.filter((item) => item !== key))} />{label}</label>
              {requestFields.includes(key) && <Input className="mt-2" value={requestValues[key]} onChange={(e) => setRequestValues((current) => ({ ...current, [key]: e.target.value }))} placeholder={"Novo valor para " + label.toLowerCase()} />}
            </div>)}
            <div><Label htmlFor="request-reason">Motivo da solicitação</Label><Textarea id="request-reason" value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3} maxLength={1000} placeholder="Explique por que os dados precisam ser alterados." /></div>
            <p className="text-xs text-muted-foreground">Se necessário, o Super Admin poderá solicitar documentos comprobatórios antes de decidir.</p>
          </div>
          <DialogFooter><Button variant="outline" disabled={submitChangeRequest.isPending} onClick={() => setRequestOpen(false)}>Cancelar</Button><Button disabled={submitChangeRequest.isPending} onClick={() => submitChangeRequest.mutate()}>{submitChangeRequest.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FilePenLine className="mr-2 size-4" />} Enviar para aprovação</Button></DialogFooter>
          {submitChangeRequest.isError && <p role="alert" className="text-sm text-destructive">{submitChangeRequest.error.message}</p>}
        </DialogContent>
      </Dialog>
      <Dialog open={photoDialogOpen} onOpenChange={(open) => { if (!open && !photoSaving) { setPhotoDialogOpen(false); setPhoto(null); setPhotoPreview(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar foto do perfil</DialogTitle><DialogDescription>Pré-visualize e ajuste o enquadramento antes de salvar. A foto será salva separadamente dos demais dados.</DialogDescription></DialogHeader>
          {photoPreview && <div className="mx-auto size-64 overflow-hidden rounded-full border bg-secondary"><img src={photoPreview} alt="Pré-visualização da foto" className="h-full w-full object-cover" style={{ objectPosition: cropX + "% " + cropY + "%", transform: "scale(" + cropZoom + ")" }} /></div>}
          <div className="space-y-4"><div><Label>Zoom</Label><Slider min={1} max={3} step={0.05} value={[cropZoom]} onValueChange={(v) => setCropZoom(v[0] ?? 1)} /></div><div><Label>Posição horizontal</Label><Slider min={0} max={100} step={1} value={[cropX]} onValueChange={(v) => setCropX(v[0] ?? 50)} /></div><div><Label>Posição vertical</Label><Slider min={0} max={100} step={1} value={[cropY]} onValueChange={(v) => setCropY(v[0] ?? 50)} /></div></div>
          <DialogFooter><Button type="button" variant="outline" disabled={photoSaving} onClick={() => { setPhotoDialogOpen(false); setPhoto(null); setPhotoPreview(""); }}>Cancelar</Button><Button type="button" disabled={!photo || photoSaving} onClick={() => void savePhoto()}>{photoSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />} Confirmar e salvar foto</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
