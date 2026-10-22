/** Validação de CNPJ e Inscrição Estadual (dígitos verificadores por UF, regras SINTEGRA). */
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
  "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
export type UF = (typeof UFS)[number];

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function isValidCnpj(value: string): boolean {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((s, x, i) => s + x * Number(c[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

const sum = (d: string, w: number[]) => w.reduce((s, x, i) => s + x * Number(d[i]), 0);
const desc = (from: number, n: number) => Array.from({ length: n }, (_, i) => from - i); // from..(from-n+1)
const w92 = desc(9, 8);
const m11a = (s: number) => { const r = s % 11; return r <= 1 ? 0 : 11 - r; }; // resto 0/1 -> 0
const m11b = (s: number) => { const v = 11 - (s % 11); return v >= 10 ? 0 : v; }; // 10/11 -> 0
const last = (d: string) => Number(d[d.length - 1]);

const rules: Record<UF, (d: string) => boolean> = {
  AC: (d) => d.length === 13 && d.startsWith("01")
    && m11b(sum(d, [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(d[11])
    && m11b(sum(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(d[12]),
  AL: (d) => d.length === 9 && d.startsWith("24") && ((sum(d, w92) * 10) % 11) % 10 === last(d),
  AP: (d) => {
    if (d.length !== 9 || !d.startsWith("03")) return false;
    const n = Number(d.slice(0, 8));
    const [p, dd] = n <= 3017000 && n >= 3000001 ? [5, 0] : n >= 3017001 && n <= 3019022 ? [9, 1] : [0, 0];
    const v = 11 - ((p + sum(d, w92)) % 11);
    return (v === 10 ? 0 : v === 11 ? dd : v) === last(d);
  },
  AM: (d) => { if (d.length !== 9) return false; const s = sum(d, w92); return (s < 11 ? 11 - s : m11a(s)) === last(d); },
  BA: (d) => {
    if (d.length !== 8 && d.length !== 9) return false;
    const n = d.length;
    const test = Number(d[n === 8 ? 0 : 1]);
    const mod10 = [0, 1, 2, 3, 4, 5, 8].includes(test);
    const f = (s: number) => (mod10 ? (10 - (s % 10)) % 10 : m11a(s));
    const base = d.slice(0, n - 2);
    const d2 = f(sum(base, desc(n - 1, n - 2)));
    const d1 = f(sum(base + d2, desc(n, n - 1)));
    return d1 === Number(d[n - 2]) && d2 === Number(d[n - 1]);
  },
  CE: (d) => d.length === 9 && m11b(sum(d, w92)) === last(d),
  DF: (d) => d.length === 13 && d.startsWith("07")
    && m11b(sum(d, [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(d[11])
    && m11b(sum(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === Number(d[12]),
  ES: (d) => d.length === 9 && m11a(sum(d, w92)) === last(d),
  GO: (d) => {
    if (d.length !== 9 || !/^(1[015]|2\d)/.test(d)) return false;
    const r = sum(d, w92) % 11;
    const n = Number(d.slice(0, 8));
    const v = r === 0 ? 0 : r === 1 ? (n >= 10103105 && n <= 10119997 ? 1 : 0) : 11 - r;
    return v === last(d);
  },
  MA: (d) => d.length === 9 && d.startsWith("12") && m11a(sum(d, w92)) === last(d),
  MG: (d) => {
    if (d.length !== 13) return false;
    const x = d.slice(0, 3) + "0" + d.slice(3, 11);
    const s = [...x].reduce((a, c, i) => a + [...String(Number(c) * (i % 2 === 0 ? 1 : 2))].reduce((b, k) => b + Number(k), 0), 0);
    const d1 = (10 - (s % 10)) % 10;
    const d2 = m11a(sum(d.slice(0, 11) + d1, [3, 2, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
    return d1 === Number(d[11]) && d2 === Number(d[12]);
  },
  MS: (d) => {
    if (d.length !== 9 || !/^(28|50)/.test(d)) return false;
    const r = sum(d, w92) % 11;
    const v = r === 0 ? 0 : 11 - r;
    return (v > 9 ? 0 : v) === last(d);
  },
  MT: (d) => { const p = d.padStart(11, "0"); return p.length === 11 && m11a(sum(p, [3, 2, 9, 8, 7, 6, 5, 4, 3, 2])) === last(p); },
  PA: (d) => d.length === 9 && d.startsWith("15") && m11a(sum(d, w92)) === last(d),
  PB: (d) => d.length === 9 && m11b(sum(d, w92)) === last(d),
  PE: (d) => d.length === 9 && m11a(sum(d, desc(8, 7))) === Number(d[7]) && m11a(sum(d, w92)) === Number(d[8]),
  PI: (d) => d.length === 9 && m11b(sum(d, w92)) === last(d),
  PR: (d) => d.length === 10 && m11a(sum(d, [3, 2, 7, 6, 5, 4, 3, 2])) === Number(d[8])
    && m11a(sum(d, [4, 3, 2, 7, 6, 5, 4, 3, 2])) === Number(d[9]),
  RJ: (d) => d.length === 8 && m11a(sum(d, [2, 7, 6, 5, 4, 3, 2])) === last(d),
  RN: (d) => (d.length === 9 || d.length === 10) && d.startsWith("20")
    && ((sum(d, desc(d.length, d.length - 1)) * 10) % 11) % 10 === last(d),
  RO: (d) => {
    const p = d.padStart(14, "0");
    if (p.length !== 14) return false;
    const v = 11 - (sum(p, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) % 11);
    return (v >= 10 ? v - 10 : v) === last(p);
  },
  RR: (d) => d.length === 9 && d.startsWith("24") && sum(d, [1, 2, 3, 4, 5, 6, 7, 8]) % 9 === last(d),
  RS: (d) => d.length === 10 && m11b(sum(d, [2, 9, 8, 7, 6, 5, 4, 3, 2])) === last(d),
  SC: (d) => d.length === 9 && m11a(sum(d, w92)) === last(d),
  SE: (d) => d.length === 9 && m11b(sum(d, w92)) === last(d),
  SP: (d) => d.length === 12 && (sum(d, [1, 3, 4, 5, 6, 7, 8, 10]) % 11) % 10 === Number(d[8])
    && (sum(d, [3, 2, 10, 9, 8, 7, 6, 5, 4, 3, 2]) % 11) % 10 === Number(d[11]),
  TO: (d) => d.length === 9 && m11a(sum(d, w92)) === last(d),
};

export const isIeExempt = (v: string) => v.trim().toUpperCase() === "ISENTO";

/** IE válida para a UF; "ISENTO" é aceito (a aprovação manual confirma a situação). */
export function isValidIe(value: string, uf: string): boolean {
  if (isIeExempt(value)) return true;
  const rule = rules[uf as UF];
  const d = onlyDigits(value);
  return Boolean(rule) && d.length >= 8 && !/^(\d)\1+$/.test(d) && rule(d);
}
