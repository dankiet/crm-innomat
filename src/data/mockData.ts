import type { SpaceType } from "@/lib/types";

export type Material = {
  id: string;
  code: string;
  name: string;
  type: "Gạch thẻ" | "Gạch mosaic" | "Gạch bông" | "Gạch ốp lát";
  size: string;
  finish: string;
  tone: string;
  image: string;
  contextImage?: string;
  description: string;
  application: string;
  thickness?: string;
  slipResistance?: string;
  bodyType?: string;
  imageClass?: string;
};

export type LineId = "gach-the" | "mosaic" | "gach-bong" | "gach-op-lat";

export type TileLine = {
  id: LineId;
  number: string;
  title: string;
  description: string;
  leadImage: string;
  facets: string[];
};

export type CatalogItem = {
  id: string;
  code: string;
  title: string;
  line: LineId;
  surface: string;
  size: string;
  tone: string;
  image: string;
  contextImage?: string;
  pattern?: string;
  finish: string;
  description: string;
};

export type Collection = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  image: string;
  note: string;
  materialIds: string[];
  tag: string;
};
 

export type SpaceLookbookItem = {
  id: string;
  projectId: string;
  projectName: string;
  photoIndex: number;
  totalPhotosInAlbum: number;
  conceptImageId: string;
  conceptImagePath: string;
  spaceType: SpaceType;
  spaceTypeName: string;
  spaceTag: string; // VD: "01 · LIVING & LOUNGE"
  applicationPosition: string; // VD: "Ốp mảng tường nhấn trung tâm & vách TV"
  spaceCaption: string; // Diễn giải cảm xúc / concept
  product: Material; // Đối tượng Material hoàn chỉnh gồm id, code, name, size, finish, tone, image (macro), v.v.
};

export type SpaceProjectAlbum = {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  location: string;
  coverImage: string;
  spaceTypes: SpaceType[];
  photoCount: number;
  photos: SpaceLookbookItem[];
  materialList: Material[];
  conceptStory: string;
};


// Curated Architectural Room Photos for "Xem trong không gian"
export const heroImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/fe2aef755acdc0f9b7e1911403a8ff4d79eff43cb8862b97e86977dea4e679ad.webp";
export const courtyardCollectionImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/7db7bb5edb309e5fdf791b0b955ea149eade1ff94b57eb427b2178210ec2f30b.webp";
export const fnbCollectionImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/665b5955061a9b7414173bedf80b53cf12baedf8b0e2e9a0f9875c7996cca657.webp";
export const hospitalityCollectionImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/83ae6ff9cdaedaa6cb986a3784e616c78af35eb23a1499f10a239994bb3dc002.webp";

// Distinct Real CRM Macro Map Surfaces
export const terraSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/6330c03218a977bf3e83374bbe44f8a2e5449f6148c6bc9dae15c18dce367ba0.webp";
export const mineralGreenSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/a27144f26045ddc0ee52b856b255678ab800d2045a02dc4bd1fcbd573233da52.webp";
export const sandMatteSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/73c5fb491bc784aa94e4103476ed1f570e037d2552e657f47ae430b7bea7b777.webp";
export const oliveTileSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/e4fa6796fca9bf953faeadbb4b83818488e2cc919e153a46c0162cc3edf4163f.webp";
export const rippleAmberSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/50979bc96ffcb73832cc6f03e116639ee926df46c9f583a6230c1524e3e18c5f.webp";
export const whiteGlazeSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/5e733843449524d5b37011544919957d121e642d42b8c7d81fc885f993f5c961.webp";
export const carbonBlackSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/fe2aef755acdc0f9b7e1911403a8ff4d79eff43cb8862b97e86977dea4e679ad.webp";
export const desertGoldSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/7db7bb5edb309e5fdf791b0b955ea149eade1ff94b57eb427b2178210ec2f30b.webp";

export const inkFingerMosaicSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/f61c2674e05b84326994e5a9f20fc7a0030162ea984a83c48b53878de71e2084.webp";
export const fishScaleMosaicSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/83ae6ff9cdaedaa6cb986a3784e616c78af35eb23a1499f10a239994bb3dc002.webp";
export const crackleSquareMosaicSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/175792d92d26d9c6184514dda72770c42f499dfa4f63956a43d085ac225c0975.webp";
export const hexSandMosaicSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/665b5955061a9b7414173bedf80b53cf12baedf8b0e2e9a0f9875c7996cca657.webp";
export const emeraldKitkatMosaicSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/228f6cec67dc3a9711b78f36192385148625d3677b9b5cdccd091288ae6a4f23.webp";

export const cementTilePatternSurface = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/175792d92d26d9c6184514dda72770c42f499dfa4f63956a43d085ac225c0975.webp";
export const limestoneSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/fe2aef755acdc0f9b7e1911403a8ff4d79eff43cb8862b97e86977dea4e679ad.webp";
export const terrazzoSurfaceImage = "https://sbphnbtbetilifomsysa.supabase.co/storage/v1/object/public/crm-images/crm/7db7bb5edb309e5fdf791b0b955ea149eade1ff94b57eb427b2178210ec2f30b.webp";

export const tileLines: TileLine[] = [
  {
    id: "gach-the",
    number: "01",
    title: "Gạch thẻ",
    description: "Đi từ màu sắc, bề mặt đến khổ gạch phù hợp cho tường điểm nhấn, quầy bar và mặt đứng.",
    leadImage: terraSurfaceImage,
    facets: ["Màu sắc", "Bề mặt", "Kích thước"],
  },
  {
    id: "mosaic",
    number: "02",
    title: "Gạch mosaic",
    description: "Đi từ kiểu dáng thanh que, vảy cá, lục giác và nhịp ghép tạo bề mặt có tính trang sức.",
    leadImage: inkFingerMosaicSurface,
    facets: ["Kiểu dáng", "Màu sắc", "Bề mặt"],
  },
  {
    id: "gach-bong",
    number: "03",
    title: "Gạch bông",
    description: "Một điểm nhấn họa tiết thủ công khi không gian cần ký ức, bản sắc và cá tính không lẫn.",
    leadImage: cementTilePatternSurface,
    facets: ["Họa tiết", "Màu sắc", "Kích thước"],
  },
  {
    id: "gach-op-lat",
    number: "04",
    title: "Gạch ốp lát",
    description: "Lớp nền bổ trợ toàn diện, đi từ kiểu vân đá, terrazzo, xi măng đến bề mặt hoàn thiện.",
    leadImage: limestoneSurfaceImage,
    facets: ["Kiểu vân", "Bề mặt", "Kích thước"],
  },
];

export const curatedMaterials: Material[] = [
  {
    id: "m1",
    code: "GT-01",
    name: "Gạch thẻ Terracotta Men Mờ",
    type: "Gạch thẻ",
    size: "75 × 300 mm",
    finish: "Men mờ thủ công",
    tone: "#B94A2E",
    image: terraSurfaceImage,
    contextImage: courtyardCollectionImage,
    description: "Bề mặt men mờ nung ở nhiệt độ cao, giữ trọn sắc đỏ gốm nung ấm áp với gờ cạnh mộc tự nhiên.",
    application: "Tường điểm nhấn phòng khách, vách bếp, mặt tiền hiên nhà",
    thickness: "10 mm",
    slipResistance: "R10",
    bodyType: "Xương đất nung cao cấp",
  },
  {
    id: "m2",
    code: "GT-02",
    name: "Gạch thẻ Xanh Khoáng Sâu",
    type: "Gạch thẻ",
    size: "75 × 300 mm",
    finish: "Bóng gợn nước",
    tone: "#2E4E52",
    image: mineralGreenSurfaceImage,
    contextImage: fnbCollectionImage,
    description: "Men bóng gợn nhẹ phản chiếu ánh sáng tự nhiên, sắc xanh lục khoáng trầm lắng và sang trọng.",
    application: "Quầy pha chế F&B, phòng tắm master, vách ốp sảnh",
    thickness: "8.5 mm",
    slipResistance: "R9",
    bodyType: "Porcelain phủ men",
  },
  {
    id: "m3",
    code: "GT-03",
    name: "Gạch thẻ Vát Cạnh Cát Mộc",
    type: "Gạch thẻ",
    size: "60 × 240 mm",
    finish: "Men mờ vát mép",
    tone: "#C8B7A1",
    image: sandMatteSurfaceImage,
    contextImage: hospitalityCollectionImage,
    description: "Mép vát tinh tế tạo nhịp đổ bóng mềm mại theo chiều ánh sáng ban ngày.",
    application: "Vách ốp trang trí, cột trụ sảnh, phòng ngủ villa",
    thickness: "9 mm",
    slipResistance: "R10",
    bodyType: "Porcelain nguyên khối",
  },
  {
    id: "m4",
    code: "GT-04",
    name: "Gạch thẻ Xanh Olive Tự Nhiên",
    type: "Gạch thẻ",
    size: "75 × 150 mm",
    finish: "Men mờ satin",
    tone: "#5C6A48",
    image: oliveTileSurfaceImage,
    contextImage: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=88",
    description: "Sắc xanh olive lá cây dịu mắt, bề mặt satin êm ái khi tiếp xúc tay.",
    application: "Khu vực spa, phòng tắm resort, quầy coffee shop",
    thickness: "8 mm",
    slipResistance: "R10",
    bodyType: "Gốm nung men satin",
  },
  {
    id: "m5",
    code: "GT-05",
    name: "Gạch thẻ Gợn Nắng Chiều",
    type: "Gạch thẻ",
    size: "100 × 300 mm",
    finish: "Bề mặt gợn sóng",
    tone: "#9A634E",
    image: rippleAmberSurfaceImage,
    contextImage: courtyardCollectionImage,
    description: "Vân gợn ngẫu nhiên tái hiện cảm giác phù sa bồi lắng, tạo chiều sâu thị giác.",
    application: "Mặt tiền nhà phố, lối vào sân vườn, vách lounge",
    thickness: "11 mm",
    slipResistance: "R10",
    bodyType: "Đất nung porcelain",
  },
  {
    id: "m6",
    code: "MX-01",
    name: "Mosaic Thanh Que Xanh Mực",
    type: "Gạch mosaic",
    size: "30 × 145 mm (Vỉ 300×300)",
    finish: "Men mờ sâu",
    tone: "#1E3544",
    image: inkFingerMosaicSurface,
    contextImage: fnbCollectionImage,
    description: "Thanh que thanh mảnh tạo nhịp dọc kéo cao trần nhà, tone xanh mực bí ẩn và lịch lãm.",
    application: "Backsplash quầy bar, vách tắm đứng, mảng nhấn nhà hàng",
    thickness: "6 mm",
    slipResistance: "R10",
    bodyType: "Gốm mosaic gắn lưới",
  },
  {
    id: "m7",
    code: "MX-02",
    name: "Mosaic Vảy Cá Rêu Phong",
    type: "Gạch mosaic",
    size: "52 × 60 mm (Vỉ 290×310)",
    finish: "Men rạn bóng ngọc",
    tone: "#587250",
    image: fishScaleMosaicSurface,
    contextImage: hospitalityCollectionImage,
    description: "Tạo hình vảy cá uyển chuyển, men ngọc nung tạo hiệu ứng chuyển sắc tự nhiên.",
    application: "Tường nhấn phòng tắm resort, quầy bar cocktail, hồ bơi",
    thickness: "7 mm",
    slipResistance: "R9",
    bodyType: "Gốm thủ công tráng men",
  },
  {
    id: "m8",
    code: "MX-03",
    name: "Mosaic Vuông Men Rạn Tro Khói",
    type: "Gạch mosaic",
    size: "48 × 48 mm (Vỉ 300×300)",
    finish: "Men rạn cổ điển",
    tone: "#6B6760",
    image: crackleSquareMosaicSurface,
    contextImage: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=88",
    description: "Vân rạn vi mô tinh xảo ẩn dưới lớp men trong, phong cách wabi-sabi thanh tịnh.",
    application: "Không gian thiền, phòng trà đạo, vách vanity",
    thickness: "6.5 mm",
    slipResistance: "R10",
    bodyType: "Porcelain phủ men rạn",
  },
  {
    id: "m9",
    code: "MX-04",
    name: "Mosaic Lục Giác Cát Trắng",
    type: "Gạch mosaic",
    size: "51 × 59 mm (Vỉ 280×300)",
    finish: "Men mờ mộc",
    tone: "#C9BAA3",
    image: hexSandMosaicSurface,
    contextImage: hospitalityCollectionImage,
    description: "Khối lục giác hình học tối giản, màu cát ấm hài hòa với nội thất gỗ tự nhiên.",
    application: "Lát sàn phòng tắm, ốp tường hốc trang trí, quầy lễ tân",
    thickness: "7 mm",
    slipResistance: "R11",
    bodyType: "Porcelain chống trơn",
  },
  {
    id: "m10",
    code: "GB-01",
    name: "Gạch Bông Hoa Thị Ký Ức",
    type: "Gạch bông",
    size: "200 × 200 mm",
    finish: "Mờ xi măng",
    tone: "#2E4743",
    image: cementTilePatternSurface,
    contextImage: courtyardCollectionImage,
    description: "Họa tiết hoa thị kinh điển ép thủy lực thủ công, mang hoài niệm Đông Dương thanh lịch.",
    application: "Chiếu nghỉ cầu thang, sàn hiên nhà vườn, nhà hàng di sản",
    thickness: "16 mm",
    slipResistance: "R10",
    bodyType: "Bột đá & xi măng ép thủy lực",
  },
  {
    id: "m11",
    code: "OL-01",
    name: "Gạch Vân Đá Limestone Khói",
    type: "Gạch ốp lát",
    size: "600 × 1200 mm",
    finish: "Men mờ baby skin",
    tone: "#948E81",
    image: limestoneSurfaceImage,
    contextImage: hospitalityCollectionImage,
    description: "Khổ lớn 600×1200mm liền mạch, bề mặt mờ mịn như da em bé, vân đá vôi mềm mại.",
    application: "Lát nền toàn bộ biệt thự, ốp tường phòng khách sang trọng",
    thickness: "9.5 mm",
    slipResistance: "R10",
    bodyType: "Full-body Porcelain",
  },
  {
    id: "m12",
    code: "OL-02",
    name: "Gạch Vân Terrazzo Hạt Cát Mịn",
    type: "Gạch ốp lát",
    size: "600 × 600 mm",
    finish: "Nhám nhẹ vi mô",
    tone: "#8E7D6A",
    image: terrazzoSurfaceImage,
    contextImage: fnbCollectionImage,
    description: "Hạt đá khoáng tự nhiên kích thước nhỏ đồng đều, mang hơi thở kiến trúc đương đại.",
    application: "Sàn quán cà phê, khu vực sảnh sinh hoạt chung, ban công",
    thickness: "9 mm",
    slipResistance: "R10",
    bodyType: "Porcelain kỹ thuật số",
  },
];

export const deliverables = [
  {
    number: "01",
    title: "Shortlist có lý do",
    description: "Mẫu vật liệu được chọn lọc kỹ lưỡng theo đúng concept, công năng và bề mặt bạn đang tìm kiếm cho công trình.",
  },
  {
    number: "02",
    title: "Ảnh thực tế & Map vật liệu",
    description: "Cung cấp đầy đủ hình chụp thực tế bề mặt, khổ, màu và trọn bộ file ảnh map vật liệu để lên phối cảnh 3D.",
  },
  {
    number: "03",
    title: "Hộp Sample tận nơi",
    description: "Gửi hộp mẫu gạch thật đến tận văn phòng thiết kế hoặc công trình trong 24h để bạn cảm nhận xúc giác dưới ánh sáng thực tế.",
  },
  {
    number: "04",
    title: "Đề xuất & Báo giá trong 4h",
    description: "Dự toán chi phí tối ưu, tiến độ kiểm kho và bảng thông số kỹ thuật rõ ràng để kịp thời trao đổi với chủ đầu tư.",
  },
] as const;
