import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type PasswordFieldProps = {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  className?: string;
  placeholder?: string;
  showGenerator?: boolean;
  onGenerated?: (password: string) => void;
};

export function generateSecurePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  // Guarantee at least one character from each required class.
  const required = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*+-_"];
  for (let i = 0; i < required.length; i += 1) {
    const pool = required[i];
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    chars[i] = pool[random[0] % pool.length];
  }
  // Shuffle without Math.random so all positions remain cryptographically selected.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function PasswordField({
  id, name, label, value, onChange, autoComplete = "new-password",
  required = true, disabled = false, minLength = 8, className = "",
  placeholder = "Digite sua senha", showGenerator = false, onGenerated,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const strength = useMemo(() => {
    if (!value) return 0;
    let score = 0;
    if (value.length >= minLength) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    return score;
  }, [value, minLength]);
  const strengthLabel = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte", "Muito forte"][strength];
  const generate = () => {
    const password = generateSecurePassword();
    onChange(password);
    onGenerated?.(password);
    setVisible(true);
    setCopied(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium leading-none">{label}</label>
    <div className="relative">
      <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
        required={required} disabled={disabled} minLength={minLength} value={value}
        onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
        className={`h-11 pr-11 ${className}`} />
      <button type="button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible} onClick={() => setVisible((current) => !current)}
        disabled={disabled} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50">
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
    {showGenerator && <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">Use pelo menos {minLength} caracteres.</span>
      <div className="flex items-center gap-2">
        {value && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void copy()} disabled={disabled}><Copy className="mr-1 size-3.5" />{copied ? "Copiada" : "Copiar"}</Button>}
        <Button type="button" variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={generate} disabled={disabled}><Sparkles className="mr-1 size-3.5" />Gerar senha</Button>
      </div>
    </div>}
    {value && <div aria-live="polite" className="space-y-1.5">
      <div className="flex gap-1" aria-hidden="true">{Array.from({length:5}, (_, index) => <span key={index} className={`h-1 flex-1 rounded-full ${index < strength ? (strength >= 4 ? "bg-emerald-500" : strength >= 3 ? "bg-amber-500" : "bg-rose-500") : "bg-muted"}`} />)}</div>
      <p className={`text-xs ${strength >= 4 ? "text-emerald-600" : "text-muted-foreground"}`}>Segurança da senha: {strengthLabel}</p>
    </div>}
  </div>;
}

export function PasswordMatchHint({ password, confirmation }: { password: string; confirmation: string }) {
  if (!confirmation) return null;
  const matches = password === confirmation;
  return <p aria-live="polite" className={`mt-1 text-xs ${matches ? "text-emerald-600" : "text-destructive"}`}>{matches ? <><Check className="mr-1 inline size-3.5" />As senhas coincidem.</> : "As senhas ainda não coincidem."}</p>;
}
