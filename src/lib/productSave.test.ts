import { describe, expect, it } from "vitest";
import { saveProductWithGallery, type ProductSaveCatalog, type ProductSaveInput } from "./productSave";

/** Banco falso que imita a RPC real: admin_save_product apaga a galeria e deixa só a imagem principal. */
function fakeCatalog(initial: string[] = []) {
  let gallery = [...initial];
  let status = "draft";
  let uploads = 0;
  const catalog: ProductSaveCatalog = {
    saveAdmin: async (input) => {
      status = input.status;
      gallery = input.imageUrl ? [input.imageUrl] : [];
      return input.id ?? "p1";
    },
    setStock: async () => {},
    saveProductImages: async (_id, existing, files) => {
      gallery = [...existing, ...files.map(() => `https://cdn.test/up-${++uploads}.jpg`)];
      return gallery;
    },
    getProductImages: async () => gallery,
  };
  return { catalog, gallery: () => gallery, status: () => status };
}

const base: ProductSaveInput = {
  name: "Amaran Ray 360c", brand: "Amaran", sku: "5542", category: "Iluminação", description: "",
  status: "published", customerPrice: 4210, resellerPrice: 3073.3,
  weightKg: 3.3, heightCm: 30, widthCm: 30, lengthCm: 40,
  images: [], imageFiles: [], stock: 10, stockConfirmed: true,
};
const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("saveProductWithGallery", () => {
  it("mantém as fotos novas ao editar um produto publicado que já tem foto principal", async () => {
    const db = fakeCatalog(["https://mci.tv/principal.png"]);
    await saveProductWithGallery(db.catalog, { ...base, id: "p1", images: ["https://mci.tv/principal.png"], imageFiles: [file("a.jpg"), file("b.jpg")] });
    expect(db.gallery()).toEqual(["https://mci.tv/principal.png", "https://cdn.test/up-1.jpg", "https://cdn.test/up-2.jpg"]);
    expect(db.status()).toBe("published");
  });

  it("publica produto novo só com fotos enviadas sem perder a galeria", async () => {
    const db = fakeCatalog();
    await saveProductWithGallery(db.catalog, { ...base, imageFiles: [file("a.jpg"), file("b.jpg"), file("c.jpg")] });
    expect(db.gallery()).toHaveLength(3);
    expect(db.status()).toBe("published");
  });

  it("preserva a ordem e as remoções feitas no formulário", async () => {
    const db = fakeCatalog(["https://x.test/1.jpg", "https://x.test/2.jpg", "https://x.test/3.jpg"]);
    await saveProductWithGallery(db.catalog, { ...base, id: "p1", images: ["https://x.test/3.jpg", "https://x.test/1.jpg"] });
    expect(db.gallery()).toEqual(["https://x.test/3.jpg", "https://x.test/1.jpg"]);
  });
});
