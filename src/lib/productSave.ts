type SaveAdminInput = {
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
  weightKg: number | null;
  heightCm: number | null;
  widthCm: number | null;
  lengthCm: number | null;
};

export type ProductSaveCatalog = {
  saveAdmin: (input: SaveAdminInput) => Promise<string>;
  setStock: (id: string, stock: number | null, confirmed?: boolean) => Promise<void>;
  saveProductImages: (productId: string, existingUrls: string[], files: File[]) => Promise<string[]>;
  getProductImages: (productId: string) => Promise<string[]>;
};

export type ProductSaveInput = Omit<SaveAdminInput, "imageUrl"> & {
  images: string[];
  imageFiles: File[];
  stock: number | null;
  stockConfirmed: boolean;
};

/**
 * Grava produto, estoque e galeria.
 *
 * A RPC admin_save_product apaga toda a galeria e deixa só a imagem principal que recebe.
 * Por isso a galeria completa é sempre gravada DEPOIS da última chamada a ela.
 */
export async function saveProductWithGallery(catalog: ProductSaveCatalog, input: ProductSaveInput): Promise<string> {
  const { images, imageFiles, stock, stockConfirmed, ...product } = input;
  // Produto publicado precisa de imagem. Sem nenhuma URL já salva, nasce como rascunho,
  // recebe as fotos e só então é publicado.
  const publishAfterImages = product.status === "published" && images.length === 0 && imageFiles.length > 0;

  const id = await catalog.saveAdmin({
    ...product,
    status: publishAfterImages ? "draft" : product.status,
    imageUrl: images[0] ?? "",
  });
  await catalog.setStock(id, stock, stockConfirmed);
  let savedImageUrls = await catalog.saveProductImages(id, images, imageFiles);

  if (publishAfterImages) {
    await catalog.saveAdmin({ ...product, id, status: "published", imageUrl: savedImageUrls[0] ?? "" });
    // A publicação acima reduziu a galeria à foto principal: regrava todas as fotos já enviadas.
    savedImageUrls = await catalog.saveProductImages(id, savedImageUrls, []);
  }

  const persistedImageUrls = await catalog.getProductImages(id);
  if (persistedImageUrls.length !== savedImageUrls.length) {
    throw new Error(`A galeria não foi salva integralmente: ${persistedImageUrls.length} de ${savedImageUrls.length} imagens confirmadas no banco. Tente salvar novamente.`);
  }
  return id;
}
