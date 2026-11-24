import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { onlyDigits } from "@/lib/br-docs";

/**
 * "Minha conta" dos portais de afiliado e admin: nome, telefone, e-mail e senha.
 * Os dados ficam no cadastro de login (user_metadata). O CPF não é editável aqui,
 * porque é usado para bloquear autoindicação; a troca passa pela loja.
 */
type Account = { id: string; email: string; fullName: string; phone: string; cpf: string; pendingEmail: string };

const formatPhone = (value: string) => {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const maskCpf = (cpf: string) => {
  const d = onlyDigits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "Não informado";
};
const field = "mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:bg-secondary disabled:text-muted-foreground";

export function AccountSettings({ portal }: { portal: "afiliado" | "admin" }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["account", "settings"],
    queryFn: async (): Promise<Account> => {
      const { data, error } = await getSupabase().auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const meta = data.user.user_metadata ?? {};
      return {
        id: data.user.id,
        email: data.user.email ?? "",
        fullName: String(meta["full_name"] ?? meta["name"] ?? ""),
        phone: formatPhone(String(meta["phone"] ?? "")),
        cpf: String(meta["cpf"] ?? ""),
        pendingEmail: data.user.new_email ?? "",
      };
    },
    retry: false,
  });
  const [form, setForm] = useState({ fullName: "", phone: "" });
  const [email, setEmail] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  useEffect(() => {
    if (!query.data) return;
    setForm({ fullName: query.data.fullName, phone: query.data.phone });
    setEmail(query.data.email);
  }, [query.data]);

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["account", "settings"] }),
    qc.invalidateQueries({ queryKey: ["portal", "sidebar-profile"] }),
    qc.invalidateQueries({ queryKey: ["admin", "portal-sidebar-profile"] }),
  ]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const fullName = form.fullName.trim().replace(/\s+/g, " ");
      const phone = onlyDigits(form.phone);
      if (fullName.length < 3 || !fullName.includes(" ")) throw new Error("Informe nome e sobrenome.");
      if (phone.length < 10 || phone.length > 11) throw new Error("Informe o telefone com DDD.");
      const { error } = await getSupabase().auth.updateUser({ data: { full_name: fullName, phone } });
      if (error) throw new Error("Não foi possível salvar seus dados. Tente novamente.");
      if (portal === "afiliado") {
        // Atualiza o nome exibido ao admin nos saques (affiliate_profiles.display_name).
        const { data } = await getSupabase().auth.getSession();
        await fetch("/api/affiliate/account", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }).catch(() => undefined);
      }
    },
    onSuccess: async () => { await refresh(); toast.success("Dados atualizados."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeEmail = useMutation({
    mutationFn: async () => {
      const next = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) throw new Error("Informe um e-mail válido.");
      const { error } = await getSupabase().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/${portal}/conta` });
      if (error) throw new Error(/already|registered|exists/i.test(error.message) ? "Este e-mail já está em uso por outra conta." : "Não foi possível pedir a troca de e-mail.");
    },
    onSuccess: async () => { await refresh(); toast.success("Enviamos um link de confirmação. A troca só vale depois de confirmada."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error("Conta não carregada.");
      if (passwords.next.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
      if (passwords.next !== passwords.confirm) throw new Error("A confirmação não confere com a nova senha.");
      if (passwords.next === passwords.current) throw new Error("A nova senha precisa ser diferente da atual.");
      const sb = getSupabase();
      // Confirma a senha atual antes de trocar (evita troca por quem só pegou a sessão aberta).
      const { error: checkError } = await sb.auth.signInWithPassword({ email: query.data.email, password: passwords.current });
      if (checkError) throw new Error("Senha atual incorreta.");
      const { error } = await sb.auth.updateUser({ password: passwords.next });
      if (error) throw new Error(/weak|pwned|short/i.test(error.message) ? "Escolha uma senha mais forte." : "Não foi possível trocar a senha.");
    },
    onSuccess: () => { setPasswords({ current: "", next: "", confirm: "" }); toast.success("Senha alterada."); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Carregando sua conta…</div>;
  if (query.isError) return <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950"><p className="font-semibold">Não foi possível carregar sua conta.</p><p className="mt-2">{query.error.message}</p><button type="button" onClick={() => void query.refetch()} className="mt-4 rounded-md border border-amber-400 px-3 py-2 font-medium">Tentar novamente</button></div>;

  const d = query.data;
  const profileChanged = form.fullName.trim() !== d.fullName || onlyDigits(form.phone) !== onlyDigits(d.phone);
  const emailChanged = email.trim().toLowerCase() !== d.email.toLowerCase();

  return <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
    <section className="rounded-xl border bg-card p-5 lg:col-span-2">
      <div className="flex items-center gap-2"><UserRound className="size-4 text-orange-600" /><h3 className="font-semibold">Dados pessoais</h3></div>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); saveProfile.mutate(); }}>
        <label className="text-sm font-medium">Nome completo<input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} autoComplete="name" className={field} /></label>
        <label className="text-sm font-medium">Telefone / WhatsApp<input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))} inputMode="tel" autoComplete="tel" placeholder="(11) 98765-4321" className={field} /></label>
        {portal === "afiliado" && <label className="text-sm font-medium">CPF<input value={maskCpf(d.cpf)} disabled className={field} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Para corrigir o CPF, fale com a loja.</span></label>}
        <div className="flex items-end justify-end sm:col-span-2">
          <button type="submit" disabled={!profileChanged || saveProfile.isPending} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#171a1f] px-4 text-sm font-semibold text-white disabled:opacity-50"><Save className="size-4" />{saveProfile.isPending ? "Salvando…" : "Salvar dados"}</button>
        </div>
      </form>
    </section>

    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2"><Mail className="size-4 text-orange-600" /><h3 className="font-semibold">E-mail de acesso</h3></div>
      <p className="mt-1 text-sm text-muted-foreground">Usado para entrar e receber avisos. Ao trocar, enviamos um link de confirmação.</p>
      <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); changeEmail.mutate(); }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" aria-label="E-mail" className={field} />
        {d.pendingEmail && <p className="text-xs text-amber-800">Aguardando confirmação de {d.pendingEmail}. Abra o link enviado para concluir.</p>}
        <button type="submit" disabled={!emailChanged || changeEmail.isPending} className="h-10 rounded-md border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50">{changeEmail.isPending ? "Enviando…" : "Trocar e-mail"}</button>
      </form>
    </section>

    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2"><KeyRound className="size-4 text-orange-600" /><h3 className="font-semibold">Senha</h3></div>
      <p className="mt-1 text-sm text-muted-foreground">Mínimo de 8 caracteres.</p>
      <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); changePassword.mutate(); }}>
        <input value={passwords.current} onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))} type="password" autoComplete="current-password" placeholder="Senha atual" aria-label="Senha atual" className={field} />
        <input value={passwords.next} onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))} type="password" autoComplete="new-password" placeholder="Nova senha" aria-label="Nova senha" className={field} />
        <input value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))} type="password" autoComplete="new-password" placeholder="Confirme a nova senha" aria-label="Confirme a nova senha" className={field} />
        <button type="submit" disabled={!passwords.current || !passwords.next || changePassword.isPending} className="h-10 rounded-md border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50">{changePassword.isPending ? "Alterando…" : "Alterar senha"}</button>
      </form>
    </section>
  </div>;
}
