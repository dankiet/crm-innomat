/**
 * Nội dung các biến thể landing page (ads).
 *
 * Mỗi slug = một bản LP riêng để chạy nhiều nhóm ads mà không nhân bản code.
 * `/lp/gach-the` nhắm nhóm quan tâm gạch thẻ, `/lp/mosaic` nhắm mosaic, v.v.
 * Thêm biến thể mới = thêm một entry ở đây, không cần thêm route.
 */
import type { LpVariant } from "./lp-types";

/**
 * Màu chữ tiếng Việt → hex, dùng cho swatch trên material card.
 * Spec yêu cầu card có swatch màu; CRM lưu màu dạng text nên cần map.
 */
const COLOR_TONE: Record<string, string> = {
  trắng: "#EFEAE0",
  đen: "#26292B",
  xám: "#8E9094",
  kem: "#E4D9C3",
  beige: "#D8C7AC",
  nâu: "#7A5641",
  vàng: "#D9A94C",
  cam: "#C9713C",
  đỏ: "#B94A2E",
  hồng: "#D9A6A0",
  xanh: "#4A6870",
  "xanh mint": "#A9C6BB",
  "xanh dương": "#3F6080",
  "xanh lá": "#657151",
  tím: "#7A6A88",
  gold: "#C4A268",
};

/** Tông đại diện cho một mã gạch; fallback về màu đất nung nhạt. */
export function toneForColor(color: string | undefined | null): string {
  const key = (color ?? "").trim().toLowerCase();
  if (!key) return "#C8B7A1";
  if (COLOR_TONE[key]) return COLOR_TONE[key];
  // Màu ghép kiểu "Xanh rêu", "Nâu nhạt" — lấy từ đầu tiên khớp.
  const hit = Object.keys(COLOR_TONE).find((k) => key.startsWith(k));
  return hit ? COLOR_TONE[hit] : "#C8B7A1";
}

const SHARED_FAQ: LpVariant["faq"] = [
  {
    q: "Giá bao nhiêu một mét vuông?",
    a: "Giá phụ thuộc dòng gạch, khổ và số lượng. Em gửi bảng giá đúng nhóm anh/chị cần ngay sau khi nắm được diện tích và hạng mục — không có giá chung cho mọi mã.",
  },
  {
    q: "Có cần đặt tối thiểu bao nhiêu?",
    a: "Không có mức tối thiểu để hỏi mẫu hoặc nhận báo giá. Với đơn thi công, em tư vấn số lượng theo diện tích thực và trừ hao cắt ghép.",
  },
  {
    q: "Em có gửi mẫu thật không?",
    a: "Có. Sau khi chốt được 2–3 mã phù hợp, em gửi mẫu thật để anh/chị so màu trong ánh sáng công trình trước khi quyết định.",
  },
  {
    q: "Giao hàng khu vực nào?",
    a: "Em giao toàn quốc. Nội thành TP.HCM thường trong 1–2 ngày, tỉnh tuỳ tuyến vận chuyển — em xác nhận lịch cụ thể khi báo giá.",
  },
  {
    q: "Chọn sai mẫu thì sao?",
    a: "Đây là lý do em luôn gửi mẫu thật trước khi chốt số lượng lớn. Hàng nguyên kiện chưa thi công, còn tem, em hỗ trợ đổi theo chính sách từng dòng.",
  },
];

export const LP_VARIANTS: LpVariant[] = [
  {
    slug: "gach-trang-tri",
    focusCategory: null,
    eyebrow: "Gạch trang trí — Innomat",
    headline: "Chọn đúng mã gạch\ncho công trình của bạn",
    sub: "Gạch thẻ, mosaic, gạch bông và gạch ốp lát. Để lại số điện thoại, em gửi bảng giá đúng nhóm anh/chị cần và tư vấn mã phù hợp với concept.",
    offer: [
      "Bảng giá đúng dòng gạch anh/chị đang cần",
      "Gợi ý 3–5 mã phù hợp với concept và công năng",
      "Mẫu thật gửi tận nơi khi đã rõ hướng",
      "Tư vấn số lượng theo diện tích, đã tính hao cắt ghép",
    ],
    formTitle: "Nhận bảng giá & mẫu gạch",
    formNote:
      "Em gọi lại trong giờ làm việc. Không spam, không chia sẻ số của anh/chị cho bên thứ ba.",
    faq: SHARED_FAQ,
  },
  {
    slug: "gach-the",
    focusCategory: "Gạch thẻ",
    eyebrow: "Gạch thẻ ốp tường — Innomat",
    headline: "Gạch thẻ cho mặt tường\ncó chiều sâu",
    sub: "Đủ màu, đủ khổ và bề mặt từ men mờ đến gợn sóng. Để lại số điện thoại, em gửi bảng giá gạch thẻ và gợi ý mã theo tông anh/chị đang tìm.",
    offer: [
      "Bảng giá gạch thẻ theo khổ 60×240, 75×300, 100×300 mm",
      "Gợi ý màu và bề mặt phù hợp tường điểm nhấn",
      "Mẫu thật để so màu trong ánh sáng công trình",
      "Tư vấn kiểu ghép và mạch gạch cho từng hạng mục",
    ],
    formTitle: "Nhận bảng giá gạch thẻ",
    formNote:
      "Em gọi lại trong giờ làm việc. Không spam, không chia sẻ số của anh/chị cho bên thứ ba.",
    faq: SHARED_FAQ,
  },
  {
    slug: "mosaic",
    focusCategory: "Gạch mosaic",
    eyebrow: "Gạch mosaic — Innomat",
    headline: "Mosaic cho bề mặt\ncó tính trang sức",
    sub: "Thanh que, vảy cá, lục giác, vuông nhỏ. Để lại số điện thoại, em gửi bảng giá mosaic và gợi ý kiểu dáng phù hợp quầy bar, bếp hoặc mặt nước.",
    offer: [
      "Bảng giá mosaic theo kiểu dáng và chất liệu",
      "Gợi ý nhịp ghép cho quầy, bếp, hồ và mặt nước",
      "Mẫu thật để xem độ bóng và phản sáng thực tế",
      "Tư vấn keo, mạch và thi công cho từng vị trí",
    ],
    formTitle: "Nhận bảng giá mosaic",
    formNote:
      "Em gọi lại trong giờ làm việc. Không spam, không chia sẻ số của anh/chị cho bên thứ ba.",
    faq: SHARED_FAQ,
  },
];

export const DEFAULT_LP_SLUG = "gach-trang-tri";
export const PUBLIC_LANDING_PATH = `/lp/${DEFAULT_LP_SLUG}`;

export function findLpVariant(slug: string | undefined): LpVariant | null {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return null;
  return LP_VARIANTS.find((v) => v.slug === s) ?? null;
}
