import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { CatalogProduct } from "./catalog";

/**
 * Adaptador Supabase para o catálogo (tabelas propostas em
 * supabase/proposed/revisao/0001_catalog.up.sql). Ainda NÃO ligado às telas:
 * a integração Oracle (catalog.ts / adminProducts.ts) continua ativa até as tabelas existirem.
 */
export type SbProductRow = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  category: string | null;
  description: string | null;
  status: "draft" | "published";
  row_version: number;
  product_prices?: { currency: string; customer_price: number | string | null } | { currency: string; customer_price: number | string | null }[] | null;
  product_reseller_prices?: { reseller_price: number | string | null } | { reseller_price: number | string | null }[] | null;
  product_specs?: { label: string; value: string | null }[] | null;
  product_images?: { url: string; position: number }[] | null;
};

export type SupabaseCatalogProduct = CatalogProduct & {
  status: "draft" | "published";
  rowVersion: number;
  resellerPrice: number | null;
};

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** numeric chega como string no PostgREST; só aceita valores finitos e positivos. */
const toPrice = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const isHttpsUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try { return new URL(u).protocol === "https:"; } catch { return false; }
};

export function fromSupabase(row: SbProductRow): SupabaseCatalogProduct {
  const price = one(row.product_prices);
  const reseller = one(row.product_reseller_prices);
  return {
    slug: row.id,
    name: row.name,
    brand: row.brand ? row.brand : null,
    sku: row.sku,
    category: row.category ?? "",
    description: row.description,
    specs: (row.product_specs ?? []).filter((s) => s.value != null && s.value !== "").map((s) => ({ label: s.label, value: s.value as string })),
    images: [...(row.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url).filter(isHttpsUrl),
    inStock: null,
    customerPrice: toPrice(price?.customer_price),
    currency: price?.currency?.trim() || null,
    resellerPrice: toPrice(reseller?.reseller_price),
    status: row.status,
    rowVersion: row.row_version,
  };
}

const PUBLIC_SELECT =
  "id,name,brand,sku,category,description,status,row_version,product_prices(currency,customer_price),product_specs(label,value),product_images(url,position)";
/** Preço de revenda: RLS só libera para papéis autorizados. */
const ADMIN_SELECT = `${PUBLIC_SELECT},product_reseller_prices(reseller_price)`;

export function createSupabaseCatalog(sb: () => SupabaseClient = getSupabase) {
  return {
    listPublished: async (): Promise<SupabaseCatalogProduct[]> => {
      const { data, error } = await sb().from("products").select(PUBLIC_SELECT).eq("status", "published").order("name");
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SbProductRow[]).map(fromSupabase);
    },
    get: async (id: string): Promise<SupabaseCatalogProduct | null> => {
      const { data, error } = await sb().from("products").select(PUBLIC_SELECT).eq("id", id).eq("status", "published").maybeSingle();
      if (error) throw new Error(error.message);
      return data ? fromSupabase(data as unknown as SbProductRow) : null;
    },
    listAdmin: async (): Promise<SupabaseCatalogProduct[]> => {
      const { data, error } = await sb().from("products").select(ADMIN_SELECT).order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SbProductRow[]).map(fromSupabase);
    },
  };
}
