/**
 * DADOS DE DEMONSTRAÇÃO — apenas para visualizar a interface.
 * Não são produtos, preços ou estoques reais. Substituir pela API quando
 * as rotas de catálogo existirem.
 */
export type Product = {
  slug: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  specs: Record<string, string>;
  /** Preço exibido apenas como referência visual de demonstração. */
  demoPrice: number;
  inStock: boolean;
};

export const categories = ["Câmeras", "Áudio", "Iluminação", "Acessórios", "Cabos e Conexões"];

export const demoProducts: Product[] = [
  { slug: "camera-ptz-4k", name: "Câmera PTZ 4K", category: "Câmeras", brand: "Demo", description: "Câmera robótica para transmissões ao vivo e eventos.", specs: { Resolução: "4K 30p", Zoom: "20x óptico", Saídas: "HDMI, SDI, IP" }, demoPrice: 0, inStock: true },
  { slug: "microfone-lapela-sem-fio", name: "Microfone de Lapela sem Fio", category: "Áudio", brand: "Demo", description: "Kit de lapela com transmissor e receptor compactos.", specs: { Alcance: "100 m", Bateria: "8 h" }, demoPrice: 0, inStock: true },
  { slug: "painel-led-bicolor", name: "Painel LED Bicolor", category: "Iluminação", brand: "Demo", description: "Painel de luz contínua com temperatura ajustável.", specs: { Temperatura: "3200–5600 K", Potência: "60 W" }, demoPrice: 0, inStock: false },
  { slug: "tripe-video-fluido", name: "Tripé de Vídeo com Cabeça Fluida", category: "Acessórios", brand: "Demo", description: "Tripé para movimentos suaves de câmera.", specs: { Carga: "8 kg", Altura: "1,6 m" }, demoPrice: 0, inStock: true },
  { slug: "cabo-sdi-12g", name: "Cabo SDI 12G", category: "Cabos e Conexões", brand: "Demo", description: "Cabo coaxial para sinais 4K.", specs: { Comprimento: "10 m", Padrão: "12G-SDI" }, demoPrice: 0, inStock: true },
  { slug: "mesa-audio-digital", name: "Mesa de Áudio Digital", category: "Áudio", brand: "Demo", description: "Mesa compacta para estúdio e eventos.", specs: { Canais: "16", USB: "Gravação multipista" }, demoPrice: 0, inStock: true },
];
