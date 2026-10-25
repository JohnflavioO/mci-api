import { ApiError } from "@/lib/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { CatalogProduct } from "./catalog";

/** Adaptador Supabase para catálogo público e administração de produtos. */
export type SbProductRow = {
  id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  category: string | null;
  description: string | null;
  status: "draft" | "published";
  row_version: number;
  /** Só existe após a proposta 0004 (estoque). */
  stock_quantity?: number | null;
  stock_confirmed?: boolean | null;
  product_prices?: { currency: string; customer_price: number | string | null } | { currency: string; customer_price: number | string | null }[] | null;
  product_reseller_prices?: { reseller_price: number | string | null } | { reseller_price: number | string | null }[] | null;
  product_specs?: { label: string; value: string | null }[] | null;
  product_images?: { url: string; position: number }[] | null;
};

export type SupabaseCatalogProduct = CatalogProduct & {
  status: "draft" | "published";
  rowVersion: number;
  resellerPrice: number | null;
  stockConfirmed: boolean;
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
    inStock: row.stock_quantity == null ? null : row.stock_quantity > 0,
    stock: row.stock_quantity ?? null,
    stockConfirmed: row.stock_confirmed === true,
    customerPrice: toPrice(price?.customer_price),
    currency: price?.currency?.trim() || null,
    resellerPrice: toPrice(reseller?.reseller_price),
    status: row.status,
    rowVersion: row.row_version,
  };
}

const BASE_SELECT =
  "id,name,brand,sku,category,description,status,row_version,product_prices(currency,customer_price),product_specs(label,value),product_images(url,position)";
/** Com estoque (proposta 0004). Antes dela a coluna não existe e cai no BASE_SELECT. */
const PUBLIC_SELECT = `${BASE_SELECT},stock_quantity,stock_confirmed`;
/** Preço de revenda: RLS só libera para papéis autorizados. */
const ADMIN_SELECT = `${PUBLIC_SELECT},product_reseller_prices(reseller_price)`;
const ADMIN_BASE_SELECT = `${BASE_SELECT},product_reseller_prices(reseller_price)`;

/** 42703 = coluna inexistente (0004 ainda não aplicada). */
export const isMissingStockColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /stock_quantity/.test(e.message ?? ""));

export function createSupabaseCatalog(sb: () => SupabaseClient = getSupabase) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withStockFallback = async (run: (sel: string) => PromiseLike<{ data: any; error: any }>, sel: string, base: string) => {
    let r = await run(sel);
    if (isMissingStockColumn(r.error)) r = await run(base);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    /** Catálogo do revendedor: preço exclusivo sujeito às políticas RLS do banco. */
    listReseller: async (): Promise<SupabaseCatalogProduct[]> => {
      const client = sb();
      const [data, setting] = await Promise.all([
        withStockFallback((sel) => client.from("products").select(sel).eq("status", "published").order("name"), ADMIN_SELECT, ADMIN_BASE_SELECT),
        client.from("platform_settings").select("setting_value").eq("setting_key", "manual_stock_confirmation").maybeSingle(),
      ]);
      const manual = setting.error ? true : (setting.data?.setting_value as { enabled?: boolean } | null)?.enabled !== false;
      return ((data ?? []) as unknown as SbProductRow[]).map(fromSupabase).map((p) => ({ ...p, stockConfirmed: manual ? p.stockConfirmed : true }));
    },
    listPublished: async (): Promise<SupabaseCatalogProduct[]> => {
      const client = sb();
      const [data, setting] = await Promise.all([
        withStockFallback((s) => client.from("products").select(s).eq("status", "published").order("name"), PUBLIC_SELECT, BASE_SELECT),
        client.from("platform_settings").select("setting_value").eq("setting_key", "manual_stock_confirmation").maybeSingle(),
      ]);
      const manual = setting.error ? true : (setting.data?.setting_value as { enabled?: boolean } | null)?.enabled !== false;
      return ((data ?? []) as unknown as SbProductRow[]).map(fromSupabase).map((p) => ({ ...p, stockConfirmed: manual ? p.stockConfirmed : true }));
    },
    get: async (id: string): Promise<SupabaseCatalogProduct | null> => {
      const client = sb();
      const [data, setting] = await Promise.all([
        withStockFallback((s) => client.from("products").select(s).eq("id", id).eq("status", "published").maybeSingle(), PUBLIC_SELECT, BASE_SELECT),
        client.from("platform_settings").select("setting_value").eq("setting_key", "manual_stock_confirmation").maybeSingle(),
      ]);
      if (!data) return null;
      const product = fromSupabase(data as unknown as SbProductRow);
      const manual = setting.error ? true : (setting.data?.setting_value as { enabled?: boolean } | null)?.enabled !== false;
      return { ...product, stockConfirmed: manual ? product.stockConfirmed : true };
    },
    listAdmin: async (): Promise<SupabaseCatalogProduct[]> => {
      const data = await withStockFallback((s) => sb().from("products").select(s).order("updated_at", { ascending: false }), ADMIN_SELECT, ADMIN_BASE_SELECT);
      return ((data ?? []) as unknown as SbProductRow[]).map(fromSupabase);
    },
    saveAdmin: async (input: {
      id?: string;
      name: string;
      brand: string;
      sku: string;
      category: string;
      description: string;
      status: "draft" | "published";
      customerPrice: number | null;
      resellerPrice: number | null;
      imageUrl: string;
    }): Promise<string> => {
      const { data, error } = await sb().rpc("admin_save_product", {
        p_id: input.id || null,
        p_name: input.name.trim(),
        p_brand: input.brand.trim(),
        p_sku: input.sku.trim() || null,
        p_category: input.category.trim() || null,
        p_description: input.description.trim() || null,
        p_status: input.status,
        p_customer_price: input.customerPrice,
        p_reseller_price: input.resellerPrice,
        p_image_url: input.imageUrl.trim() || null,
      });
      if (error) {
        const status = error.code === "23505" ? 409 : error.code === "42501" ? 403 : error.code === "23514" ? 422 : error.code === "PGRST202" ? 404 : 400;
        throw new ApiError(status === 409 ? "SKU já cadastrado." : status === 403 ? "Sua conta não tem permissão de administrador." : error.message, status);
      }
      return String(data);
    },
    /** Atualiza a galeria sem deixar um produto publicado temporariamente sem imagens. */
    saveProductImages: async (productId: string, existingUrls: string[], files: File[]): Promise<void> => {
      const client = sb();
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const extByType: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/avif": "avif",
        };
        const ext = extByType[file.type];
        if (!ext) throw new Error("Formato de imagem não permitido.");
        if (file.size > 8 * 1024 * 1024) throw new Error("Cada imagem deve ter no máximo 8 MB.");
        const path = `${productId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await client.storage.from("product-images").upload(path, file, {
          cacheControl: "31536000",
          contentType: file.type,
          upsert: false,
        });
        if (uploadError) throw new Error(`Falha ao enviar a imagem "${file.name}": ${uploadError.message}`);
        uploadedUrls.push(client.storage.from("product-images").getPublicUrl(path).data.publicUrl);
      }

      const urls = [...existingUrls, ...uploadedUrls].slice(0, 10);
      const { data: currentRows, error: readError } = await client
        .from("product_images")
        .select("id,url,position")
        .eq("product_id", productId)
        .order("position", { ascending: true });
      if (readError) throw new Error(`Não foi possível carregar a galeria atual: ${readError.message}`);

      const current = (currentRows ?? []) as { id: number; url: string; position: number }[];
      // Primeiro desloca posições para evitar colisões com a restrição UNIQUE(product_id, position)
      // ao reordenar fotos. Nenhuma linha é removida nesta etapa, evitando violar a regra
      // que exige imagens para produtos publicados.
      if (current.length) {
        const { error: shiftError } = await client
          .from("product_images")
          .update({ position: 1000 })
          .eq("product_id", productId);
        if (shiftError) throw new Error(`Não foi possível preparar a ordem das imagens: ${shiftError.message}`);
      }

      // Atualiza as linhas existentes e insere as imagens adicionais antes de excluir qualquer
      // sobra; assim o produto publicado mantém imagens durante todo o processo.
      const sharedCount = Math.min(current.length, urls.length);
      for (let i = 0; i < sharedCount; i++) {
        const { error } = await client
          .from("product_images")
          .update({ url: urls[i], position: i })
          .eq("id", current[i].id)
          .eq("product_id", productId);
        if (error) throw new Error(`Não foi possível atualizar a foto ${i + 1}: ${error.message}`);
      }

      if (urls.length > current.length) {
        const additions = urls.slice(current.length).map((url, offset) => ({
          product_id: productId,
          url,
          position: current.length + offset,
        }));
        const { error } = await client.from("product_images").insert(additions);
        if (error) throw new Error(`Não foi possível salvar as imagens adicionais: ${error.message}`);
      }

      if (current.length > urls.length) {
        const idsToRemove = current.slice(urls.length).map((row) => row.id);
        const { error } = await client
          .from("product_images")
          .delete()
          .eq("product_id", productId)
          .in("id", idsToRemove);
        if (error) throw new Error(`Não foi possível remover as fotos excedentes: ${error.message}`);
      }
    },
    /** Requer proposta 0004. null = estoque não informado. */
    setStock: async (id: string, stock: number | null, confirmed = false): Promise<void> => {
      const { error } = await sb().rpc("set_product_stock", { p_id: id, p_stock: stock, p_confirmed: confirmed });
      if (error) throw new Error(error.code === "PGRST202" ? "O controle de estoque ainda não foi ativado no banco." : error.message);
    },
    getStockConfirmationMode: async (): Promise<boolean> => {
      const { data, error } = await sb().from("platform_settings").select("setting_value").eq("setting_key", "manual_stock_confirmation").maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.setting_value as { enabled?: boolean } | null)?.enabled !== false;
    },
    setStockConfirmationMode: async (enabled: boolean): Promise<void> => {
      const { error } = await sb().rpc("set_stock_confirmation_mode", { p_enabled: enabled });
      if (error) throw new Error(error.message);
    },
    /** Preço de revenda: o RLS só devolve linha para revendedor aprovado; demais recebem null. */
    resellerPrice: async (id: string): Promise<number | null> => {
      const { data: s } = await sb().auth.getSession();
      if (!s.session) return null;
      const { data, error } = await sb().from("product_reseller_prices").select("reseller_price").eq("product_id", id).maybeSingle();
      if (error || !data) return null;
      return toPrice((data as { reseller_price: number | string | null }).reseller_price);
    },
  };
}
