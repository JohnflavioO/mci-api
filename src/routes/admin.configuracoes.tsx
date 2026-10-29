import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, CheckCircle2, ChevronRight, Info,
  MapPin, PackageCheck, Save, Settings2, ShieldCheck, Store,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { createSupabaseCatalog } from "@/services/supabaseCatalog";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/shop/states";

type CompanyProfile = {
  id: number;
  legal_name: string; trade_name: string; cnpj: string; state_registration: string;
  municipal_registration: string; tax_regime: string; address_postal_code: string;
  address_street: string; address_number: string; address_complement: string;
  address_district: string; address_city: string; address_state: string;
  address_country: string; phone: string; institutional_email: string; website: string;
  store_name: string; store_support_email: string; store_support_phone: string;
  store_footer_text: string; updated_at?: string; updated_by?: string | null;
};
const emptyCompanyProfile: CompanyProfile = {
  id: 1, legal_name: "", trade_name: "MCI Xpress", cnpj: "", state_registration: "",
  municipal_registration: "", tax_regime: "", address_postal_code: "", address_street: "",
  address_number: "", address_complement: "", address_district: "", address_city: "",
  address_state: "", address_country: "Brasil", phone: "", institutional_email: "",
  website: "", store_name: "MCI Xpress", store_support_email: "", store_support_phone: "",
  store_footer_text: "",
};
const companyFields = Object.keys(emptyCompanyProfile).filter((key) => key !== "id") as (keyof CompanyProfile)[];
const fieldClass = "mt-1.5 w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
function Field({ label, value, onChange, placeholder, type = "text", required = false }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return <label className="block text-sm font-medium">{label}{required && <span className="ml-1 text-destructive">*</span>}
    <input className={fieldClass} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} />
  </label>;
}

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações | MCI Xpress" }] }),
  component: StockSettingsPage,
});

function StockSettingsPage() {
  const qc = useQueryClient();
  const catalog = createSupabaseCatalog();
  const catalogClient = getSupabase();

  const companyQuery = useQuery({
    queryKey: ["admin", "platform-company-profile"],
    queryFn: async () => {
      const { data, error } = await catalogClient
        .from("platform_company_profile")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw new Error(error.message.includes("platform_company_profile")
        ? "A estrutura de dados da empresa ainda não foi aplicada no Supabase."
        : error.message);
      return data as CompanyProfile;
    },
    retry: false,
  });
  const [company, setCompany] = useState<CompanyProfile>(emptyCompanyProfile);
  useEffect(() => {
    if (companyQuery.data) setCompany(companyQuery.data);
  }, [companyQuery.data]);
  const companySave = useMutation({
    mutationFn: async () => {
      const { data: authData, error: authError } = await catalogClient.auth.getUser();
      if (authError || !authData.user) {
        throw new Error("Sua sessão não foi validada. Entre novamente antes de salvar.");
      }
      const { error } = await catalogClient.from("platform_company_profile").update({
        updated_by: authData.user.id,
        legal_name: company.legal_name.trim(),
        trade_name: company.trade_name.trim(),
        cnpj: company.cnpj.trim(),
        state_registration: company.state_registration.trim(),
        municipal_registration: company.municipal_registration.trim(),
        tax_regime: company.tax_regime.trim(),
        address_postal_code: company.address_postal_code.trim(),
        address_street: company.address_street.trim(),
        address_number: company.address_number.trim(),
        address_complement: company.address_complement.trim(),
        address_district: company.address_district.trim(),
        address_city: company.address_city.trim(),
        address_state: company.address_state.trim().toUpperCase(),
        address_country: company.address_country.trim(),
        phone: company.phone.trim(),
        institutional_email: company.institutional_email.trim(),
        website: company.website.trim(),
        store_name: company.store_name.trim(),
        store_support_email: company.store_support_email.trim(),
        store_support_phone: company.store_support_phone.trim(),
        store_footer_text: company.store_footer_text.trim(),
      }).eq("id", 1);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Dados institucionais salvos.");
      await qc.invalidateQueries({ queryKey: ["admin", "platform-company-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const companyConfigured = companyQuery.data !== undefined && !companyQuery.isError;
  const companyChanged = companyConfigured && companyFields.some((key) => company[key] !== companyQuery.data?.[key]);

  const query = useQuery({
    queryKey: ["admin", "stock-confirmation-mode"],
    queryFn: catalog.getStockConfirmationMode,
    retry: false,
  });
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (query.data !== undefined) setEnabled(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => catalog.setStockConfirmationMode(enabled),
    onSuccess: async () => {
      toast.success("Configuração de estoque salva.");
      await qc.invalidateQueries({ queryKey: ["admin", "stock-confirmation-mode"] });
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      await qc.invalidateQueries({ queryKey: ["admin", "supabase-products"] });
      await qc.invalidateQueries({ queryKey: ["admin-dashboard", "products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isConfigured = query.data !== undefined && !query.isError;
  const hasChanges = isConfigured && enabled !== query.data;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <header className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-background shadow-sm">
              <Settings2 className="size-6 text-primary" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Central administrativa <ChevronRight className="size-3" /> Preferências da plataforma
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Administre os dados oficiais da empresa, a identidade da loja e as regras operacionais do e-commerce.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground sm:self-center">
            <ShieldCheck className="size-4" />
            Área administrativa
          </div>
        </div>
      </header>


      <section aria-labelledby="company-settings-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Institucional</p>
            <h3 id="company-settings-heading" className="mt-1 text-xl font-bold">Empresa e loja</h3>
            <p className="mt-1 text-sm text-muted-foreground">Dados oficiais da empresa responsável pelo MCI Xpress e informações de contato da loja.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Somente Super Admin</span>
        </div>
        {companyQuery.isPending ? <div className="rounded-2xl border bg-card p-6"><LoadingState /></div> : companyQuery.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-card p-5">
            <ErrorState message={companyQuery.error.message} onRetry={() => void companyQuery.refetch()} />
            <p className="mt-3 text-sm text-muted-foreground">A migração desta seção está no branch para revisão. Ela não é executada automaticamente.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start gap-3 border-b p-5 sm:p-6">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></span>
                <div><h4 className="text-lg font-semibold">Identificação empresarial</h4><p className="mt-1 text-sm text-muted-foreground">Informações jurídicas e fiscais da empresa-mãe.</p></div>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                <div className="sm:col-span-2"><Field label="Razão social" value={company.legal_name} onChange={(v) => setCompany({...company, legal_name:v})} placeholder="Razão social conforme CNPJ" required /></div>
                <Field label="Nome fantasia" value={company.trade_name} onChange={(v) => setCompany({...company, trade_name:v})} placeholder="Nome fantasia" />
                <Field label="CNPJ" value={company.cnpj} onChange={(v) => setCompany({...company, cnpj:v})} placeholder="00.000.000/0000-00" />
                <Field label="Inscrição estadual" value={company.state_registration} onChange={(v) => setCompany({...company, state_registration:v})} placeholder="Número ou ISENTO" />
                <Field label="Inscrição municipal" value={company.municipal_registration} onChange={(v) => setCompany({...company, municipal_registration:v})} placeholder="Opcional" />
                <Field label="Regime tributário" value={company.tax_regime} onChange={(v) => setCompany({...company, tax_regime:v})} placeholder="Ex.: Simples Nacional" />
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start gap-3 border-b p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="size-5" /></span><div><h4 className="text-lg font-semibold">Endereço fiscal</h4><p className="mt-1 text-sm text-muted-foreground">Endereço oficial para cadastro e documentação.</p></div></div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
                <Field label="CEP" value={company.address_postal_code} onChange={(v) => setCompany({...company,address_postal_code:v})} placeholder="00000-000" />
                <div className="sm:col-span-2"><Field label="Logradouro" value={company.address_street} onChange={(v) => setCompany({...company,address_street:v})} placeholder="Rua, avenida..." /></div>
                <Field label="Número" value={company.address_number} onChange={(v) => setCompany({...company,address_number:v})} placeholder="Número" />
                <Field label="Complemento" value={company.address_complement} onChange={(v) => setCompany({...company,address_complement:v})} placeholder="Sala, bloco..." />
                <Field label="Bairro" value={company.address_district} onChange={(v) => setCompany({...company,address_district:v})} placeholder="Bairro" />
                <Field label="Cidade" value={company.address_city} onChange={(v) => setCompany({...company,address_city:v})} placeholder="Cidade" />
                <Field label="Estado (UF)" value={company.address_state} onChange={(v) => setCompany({...company,address_state:v.toUpperCase().slice(0,2)})} placeholder="CE" />
                <Field label="País" value={company.address_country} onChange={(v) => setCompany({...company,address_country:v})} placeholder="Brasil" />
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-start gap-3 border-b p-5 sm:p-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Store className="size-5" /></span><div><h4 className="text-lg font-semibold">Identidade e atendimento da loja</h4><p className="mt-1 text-sm text-muted-foreground">Nome público, contatos institucionais e informações do rodapé.</p></div></div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
                <Field label="Nome da loja" value={company.store_name} onChange={(v) => setCompany({...company,store_name:v})} placeholder="MCI Xpress" required />
                <Field label="Site oficial" value={company.website} onChange={(v) => setCompany({...company,website:v})} placeholder="https://..." type="url" />
                <Field label="Telefone institucional" value={company.phone} onChange={(v) => setCompany({...company,phone:v})} placeholder="(00) 00000-0000" type="tel" />
                <Field label="E-mail institucional" value={company.institutional_email} onChange={(v) => setCompany({...company,institutional_email:v})} placeholder="empresa@dominio.com.br" type="email" />
                <Field label="E-mail de atendimento" value={company.store_support_email} onChange={(v) => setCompany({...company,store_support_email:v})} placeholder="atendimento@dominio.com.br" type="email" />
                <Field label="Telefone de atendimento" value={company.store_support_phone} onChange={(v) => setCompany({...company,store_support_phone:v})} placeholder="(00) 00000-0000" type="tel" />
                <label className="block text-sm font-medium sm:col-span-2 lg:col-span-3">Texto institucional do rodapé<textarea className={fieldClass} rows={3} value={company.store_footer_text} onChange={(e) => setCompany({...company,store_footer_text:e.target.value})} placeholder="Informações institucionais exibidas no rodapé da loja." /></label>
              </div>
              <div className="flex flex-col-reverse gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <p className="text-xs text-muted-foreground">{companyChanged ? "Existem alterações ainda não salvas." : company.updated_at ? `Última atualização: ${new Date(company.updated_at).toLocaleString("pt-BR")}` : "Os dados serão gravados no perfil institucional da plataforma."}</p>
                <Button onClick={() => companySave.mutate()} disabled={!companyChanged || companySave.isPending || !company.store_name.trim()} className="sm:min-w-44"><Save className="mr-2 size-4" />{companySave.isPending ? "Salvando dados…" : "Salvar dados da empresa"}</Button>
              </div>
            </section>
          </div>
        )}
      </section>

      <section aria-labelledby="catalog-settings-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Catálogo</p>
            <h3 id="catalog-settings-heading" className="mt-1 text-xl font-bold">Estoque e disponibilidade</h3>
          </div>
          <p className="text-sm text-muted-foreground">Regras aplicadas à exibição dos produtos na loja.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-start gap-3 border-b p-5 sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <PackageCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold">Confirmação de estoque</h4>
                  {isConfigured && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${query.data ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                      <span className={`size-1.5 rounded-full ${query.data ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {query.data ? "Confirmação obrigatória" : "Confirmação dispensada"}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Defina se a equipe da MCI precisa validar o estoque antes de um produto aparecer como disponível.
                </p>
              </div>
            </div>

            {query.isPending ? (
              <div className="p-6"><LoadingState /></div>
            ) : query.isError ? (
              <div className="space-y-3 p-5 sm:p-6">
                <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p>Confirme se a migration de configuração foi aplicada ao Supabase antes de tentar salvar.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <label className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors ${enabled ? "border-primary/30 bg-primary/[0.035]" : "hover:bg-muted/40"}`}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Exigir confirmação manual da MCI</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      Quando ativada, a disponibilidade exige estoque informado maior que zero e confirmação explícita da equipe.
                    </span>
                  </span>
                </label>

                <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 ${enabled ? "border-amber-500/20 bg-amber-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                  {enabled
                    ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
                    : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
                  <div>
                    <p className="font-semibold">{enabled ? "Validação manual ativa" : "Validação manual desativada"}</p>
                    <p className="mt-1 text-muted-foreground">
                      {enabled
                        ? "Produtos importados ou sem confirmação explícita continuam indisponíveis. Isso evita exibir itens cujo estoque ainda não foi validado."
                        : "A confirmação manual não será exigida, mas o produto ainda precisa ter quantidade de estoque informada e maior que zero."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {hasChanges ? "Há alterações ainda não salvas." : "As alterações só entram em vigor após salvar."}
                  </p>
                  <Button onClick={() => save.mutate()} disabled={save.isPending || !hasChanges} className="sm:min-w-44">
                    {save.isPending ? "Salvando configuração…" : "Salvar configuração"}
                  </Button>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-primary" />
                <h4 className="font-semibold">Como funciona</h4>
              </div>
              <ol className="mt-4 space-y-4">
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">01</span>
                  <div>
                    <p className="text-sm font-medium">Estoque informado</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">O produto precisa ter uma quantidade válida maior que zero.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">02</span>
                  <div>
                    <p className="text-sm font-medium">Validação da equipe</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">Quando a regra está ativa, a MCI também precisa confirmar o estoque.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">03</span>
                  <div>
                    <p className="text-sm font-medium">Exibição na loja</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">A regra controla quando o produto pode ser considerado disponível.</p>
                  </div>
                </li>
              </ol>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.035] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h4 className="font-semibold">Alteração controlada</h4>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Revise o impacto no catálogo antes de mudar esta regra. A configuração é global e pode afetar vários produtos.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
