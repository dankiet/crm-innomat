import { useState, useMemo, useEffect } from "react";
import {
  Eye,
  Check,
  Plus,
  Compass,
  Layers,
  Sparkles,
  ArrowUpRight,
  LockKeyhole,
} from "lucide-react";
import {
  fetchPublicSpaceCollectionsFn,
  fetchPublicMeFn,
  authGoogleStart,
} from "@/api/lp";
import { COLOR_PALETTES, ALL_COLOR_SWATCH, matchColorPalette } from "@/lib/color-palette";
import { type SpaceLookbookItem, type Material } from "@/data/mockData";
import type { SpaceType } from "@/lib/types";
import { cn } from "@/lib/utils";
export type SpaceLookbookSectionProps = {
  shortlistIds: string[];
  onToggleShortlist: (id: string) => void;
  onOpenMaterialModal: (material: Material, tab?: "surface" | "context", list?: Material[]) => void;
};

type TabFilter = {
  key: "all" | SpaceType;
  label: string;
};

const SPACE_TABS: TabFilter[] = [
  { key: "all", label: "Toàn bộ" },
  { key: "living_room", label: "Phòng khách" },
  { key: "kitchen_dining", label: "Bếp" },
  { key: "bathroom_spa", label: "Phòng tắm" },
  { key: "bedroom", label: "Phòng ngủ" },
  { key: "outdoor_balcony", label: "Sân trong" },
  { key: "fnb_hospitality", label: "F&B" },
];

export function SpaceLookbookSection({
  shortlistIds,
  onToggleShortlist,
  onOpenMaterialModal,
}: SpaceLookbookSectionProps) {
  const [activeTab, setActiveTab] = useState<"all" | SpaceType>("all");
  const [activeColor, setActiveColor] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(9);
  const [lookbookExpanded, setLookbookExpanded] = useState(false);
  const [liveItems, setLiveItems] = useState<SpaceLookbookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleTabChange = (key: "all" | SpaceType) => {
    setActiveTab(key);
    setVisibleCount(isLoggedIn ? 36 : 9);
  };

  const handleColorChange = (colorId: string) => {
    setActiveColor(colorId);
    setVisibleCount(isLoggedIn ? 36 : 9);
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const returnAnchor = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}#khong-gian`
        : "/lp/gach-the#khong-gian";
      const res = await authGoogleStart({
        data: {
          returnTo: returnAnchor,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        },
      });
      if (res && res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      console.error("Google login error:", err);
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    fetchPublicMeFn()
      .then((user) => {
        const logged = !!user;
        setIsLoggedIn(logged);
        if (logged) setVisibleCount(36);
        return fetchPublicSpaceCollectionsFn();
      })
      .then((spaces) => {
        if (spaces && spaces.length > 0) {
          const mapped: SpaceLookbookItem[] = [];
          for (const s of spaces) {
            for (const mat of s.materials) {
              mapped.push({
                id: `space-${s.id}-${mat.product_id}`,
                projectId: `proj-${s.id}`,
                projectName: s.title,
                photoIndex: 1,
                totalPhotosInAlbum: 1,
                conceptImageId: `concept-${s.id}`,
                conceptImagePath: s.image_path,
                spaceType: (s.space_type as SpaceType) || "living_room",
                spaceTypeName: s.title,
                spaceTag: s.tag || "01 · LOOKBOOK",
                applicationPosition: mat.application_position,
                spaceCaption: s.description || mat.note || "",
                product: {
                  id: String(mat.product_id),
                  code: mat.code,
                  name: mat.name,
                  type: (mat.category as Material["type"]) || "Gạch thẻ",
                  size: mat.size,
                  finish: mat.surface,
                  tone: mat.color || "#B94A2E",
                  image: mat.image,
                  contextImage: s.image_path,
                  description: mat.note || s.description,
                  application: mat.application_position,
                },
              });
            }
          }
          setLiveItems(mapped);
        } else {
          setLiveItems([]);
        }
      })
      .catch(() => {
        setLiveItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredItems = useMemo(() => {
    let pool = liveItems;

    // 1. Lọc theo không gian
    if (activeTab !== "all") {
      pool = pool.filter((item) => item.spaceType === activeTab);
    }

    // 2. Lọc theo gam màu
    if (activeColor !== "all") {
      pool = pool.filter((item) => {
        const paletteId = matchColorPalette(item.product.tone);
        return paletteId === activeColor;
      });
    }

    // 3. Quy tắc 1-to-1 trên tab "Tất cả": mỗi mã gạch chỉ xuất hiện đúng 1 ảnh concept đại diện
    if (activeTab === "all") {
      const seen = new Set<string>();
      const result: SpaceLookbookItem[] = [];
      for (const item of pool) {
        if (!seen.has(item.product.id)) {
          seen.add(item.product.id);
          result.push(item);
        }
      }
      return result;
    }

    return pool;
  }, [activeTab, activeColor, liveItems]);


  // Tab counts for quick visual feedback
  const tabCounts = useMemo(() => {
    const uniqueProds = new Set<string>();
    const counts: Record<string, number> = { all: 0 };
    liveItems.forEach((item) => {
      uniqueProds.add(item.product.id);
      counts[item.spaceType] = (counts[item.spaceType] || 0) + 1;
    });
    counts.all = uniqueProds.size;
    return counts;
  }, [liveItems]);

  const displayedItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );

  const lookbookMaterials = useMemo(
    () => displayedItems.map((it) => it.product),
    [displayedItems],
  );
  return (
    <section
      id="khong-gian"
      className="space-lookbook-section"
      aria-labelledby="space-lookbook-title"
    >
      {/* 1. Section Header */}
      <div className="space-lookbook-header">
        <p className="section-kicker">
          <Compass size={13} className="inline-block text-terracotta" />
          <span>LOOKBOOK BỐI CẢNH · 1 ẢNH / 1 MÃ GẠCH ỨNG DỤNG</span>
        </p>
        <div className="space-lookbook-topline">
          <h2 id="space-lookbook-title">
            Vật liệu trong<br />
            không gian thực tế.
          </h2>
          <p className="space-lookbook-desc">
            Mỗi bức ảnh là một bối cảnh thực tế thể hiện đúng <strong>01 mã gạch định danh</strong>.
            Khám phá cách đất nung, men rạn và mosaic phản hồi với ánh sáng tự nhiên và phối hợp với các vật liệu gỗ, đá, kim loại trong công trình.
          </p>
        </div>
      </div>

      {/* 2. Space Filter Tabs Bar */}
      <div className="space-tabs-bar" role="tablist" aria-label="Bộ lọc không gian">
        <div className="space-tabs-scroll">
          {SPACE_TABS.map((tab) => {
            const count = tabCounts[tab.key] || 0;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                type="button"
                className={`space-tab-pill ${isActive ? "is-active" : ""}`}
                onClick={() => handleTabChange(tab.key)}
              >
                <span>{tab.label}</span>
                {/* Tab "Toàn bộ" KHÔNG mang badge đếm: con số 441 rộng ~30px, không
                    thêm thông tin (tổng số đã nằm ngay dưới ở dòng "Đã mở khóa…"),
                    và chính nó đẩy pill thứ 7 xuống hàng mồ côi trên mobile. Các
                    phòng cụ thể vẫn giữ badge vì số đó là thông tin thật. */}
                {tab.key !== "all" && <span className="space-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2.1 Color Palette Swatch Dots — 11 gam màu hiện đủ, xuống dòng thay vì
          cuộn ngang (cuộn ngang giấu 8/11 màu sau mép phải màn hình). */}
      <div className="space-color-bar" role="group" aria-label="Lọc theo gam màu">
        <span className="space-color-label">Gam màu:</span>
        {/* 12 chấm nằm trong MỘT khối riêng để nhãn "Gam màu:" đứng thẳng hàng với
            chúng thay vì chiếm trọn một dòng phía trên. Khối này là `grid` cố định
            (6 cột ở mobile) chứ không phải `flex-wrap` — bản cũ từng bọc chấm trong
            flex container và bị chia 10 + 1 vì bề rộng `max-content` của container
            vượt chỗ còn lại; grid khai cột tường minh nên luôn đúng 6 + 6. */}
        <div className="space-color-swatches">
          {/* Chấm "Đa sắc" = chọn TẤT CẢ gam màu. Cùng class `.space-color-dot` với
              11 chấm kia nên dùng chung kích thước, ring active và hover. */}
          <button
            type="button"
            onClick={() => handleColorChange("all")}
            aria-label={ALL_COLOR_SWATCH.label}
            title={ALL_COLOR_SWATCH.label}
            className={cn("space-color-dot", activeColor === "all" && "is-active")}
            style={{
              background: ALL_COLOR_SWATCH.background,
              border: `1.5px solid ${ALL_COLOR_SWATCH.dotBorder}`,
            }}
          />
          {COLOR_PALETTES.map((palette) => {
            const isActive = activeColor === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => handleColorChange(isActive ? "all" : palette.id)}
                aria-label={palette.label}
                title={palette.label}
                className={cn("space-color-dot", isActive && "is-active")}
                style={{
                  backgroundColor: palette.hex,
                  border: `1.5px solid ${palette.dotBorder || "rgba(0,0,0,0.15)"}`,
                }}
              />
            );
          })}
        </div>
      </div>
      {isLoggedIn && !loading && (
        <div className="flex items-center justify-between mb-6 px-4 py-3 bg-[#FAF8F5] border border-[#E7E2DA] rounded-xl text-xs text-[#1D1917]">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">✓</span>
            <span><strong>Đã mở khóa toàn bộ Lookbook</strong> ({filteredItems.length} bối cảnh thực tế sẵn sàng)</span>
          </div>
          <span className="text-[#78716C]">Tài khoản Google đã kết nối</span>
        </div>
      )}

      {/* Guest weekly curation notice */}
      {!isLoggedIn && !loading && (
        <div className="flex items-center gap-2 mb-4 text-xs text-[#78716C]">
          <Sparkles size={14} className="text-[#B94A2E]" />
          <span>Bộ bối cảnh tuyển chọn trong tuần · Tự động làm mới mỗi 7 ngày</span>
        </div>
      )}

      <div
        id="lookbook-grid"
        className={`space-gallery-grid ${lookbookExpanded ? "is-expanded" : "is-collapsed"}`}
      >
        {displayedItems.map((item) => {
          const isShortlisted = shortlistIds.includes(item.product.id);

          return (
            <article
              key={item.id}
              className="space-lookbook-card"
              aria-label={`Không gian ${item.spaceTypeName} ứng dụng gạch ${item.product.code}`}
            >
              {/* Visual Concept Image Container */}
              <div
                className="space-card-visual"
                onClick={() => onOpenMaterialModal(item.product, "context", lookbookMaterials)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenMaterialModal(item.product, "context", lookbookMaterials);
                  }
                }}
                title="Nhấp để soi chi tiết bề mặt và thông số kỹ thuật"
              >
                <img
                  src={item.conceptImagePath}
                  alt={`${item.spaceTypeName} - ${item.applicationPosition} dùng ${item.product.name}`}
                  loading="lazy"
                  className="space-visual-img"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />

                {/* Badges Overlay */}
                <div className="space-visual-badges">
                  <span className="space-tag-chip">{item.spaceTag}</span>
                </div>

                {/* Hover Inspector Prompt */}
                <div className="space-visual-overlay">
                  <div className="space-overlay-glass">
                    <Eye size={17} />
                    <span>Soi chi tiết &amp; ảnh Map</span>
                  </div>
                </div>
              </div>

              {/* Material Anchor Footer (1-to-1 Mapping) */}
              <div className="space-material-footer">
                {/* Macro Texture Swatch */}
                <button
                  type="button"
                  className="space-swatch-anchor"
                  onClick={() => onOpenMaterialModal(item.product, "surface", lookbookMaterials)}
                  title={`Xem cận cảnh mẫu ${item.product.code} - ${item.product.name}`}
                >
                  <img
                    src={item.product.image}
                    alt={`Texture ${item.product.name}`}
                    className="space-swatch-img"
                  />
                  <div className="space-swatch-badge">
                    <Layers size={10} />
                  </div>
                </button>

                {/* Material Info & Application */}
                <div className="space-material-info">
                  <div className="space-code-row">
                    <span className="space-code-tag">EBG / {item.product.code}</span>
                    <span className="space-type-label">{item.product.type}</span>
                  </div>

                  <button
                    type="button"
                    className="space-material-name text-left"
                    onClick={() => onOpenMaterialModal(item.product, "context", lookbookMaterials)}
                  >
                    {item.product.name}
                  </button>

                  <div className="space-meta-specs">
                    <span>{item.product.size}</span>
                    <span className="bullet">·</span>
                    <span>{item.product.finish}</span>
                  </div>

                  {/* Application Callout */}
                  <div className="space-application-callout">
                    <span className="app-label">Vị trí:</span>
                    <span className="app-value">{item.applicationPosition}</span>
                  </div>

                  {/* Curated Concept Note */}
                  <p className="space-caption-text">
                    &ldquo;{item.spaceCaption}&rdquo;
                  </p>
                </div>

                {/* Actions: 1-Click Shortlist & Full Detail Modal */}
                <div className="space-material-actions">
                  <button
                    type="button"
                    className={`btn-space-shortlist ${isShortlisted ? "is-selected" : ""}`}
                    onClick={() => onToggleShortlist(item.product.id)}
                    aria-pressed={isShortlisted}
                    title={isShortlisted ? "Bỏ lưu khỏi Moodboard" : "Lưu mã gạch này vào Moodboard"}
                  >
                    {isShortlisted ? (
                      <>
                        <Check size={14} className="icon-check" />
                        <span>Đã lưu</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} className="icon-plus" />
                        <span>+ Lưu Moodboard</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="btn-space-detail"
                    onClick={() => onOpenMaterialModal(item.product, "context", lookbookMaterials)}
                    title="Xem thông số kỹ thuật và ảnh map"
                  >
                    <span>Chi tiết</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {/* MỘT hàng điều khiển duy nhất — không bao giờ có hai nút xếp chồng (lỗi cũ
          ở ảnh người dùng gửi). Gồm tối đa hai nút, CSS quyết định nút nào hiện:
          - Desktop: thu gọn → chỉ nút "Xem tiếp" (nút tải thêm ẩn vì 6 bối cảnh
            trong trang còn chưa xem hết); bung mở → nút tải thêm (nếu kho còn mẫu)
            đứng CẠNH nút thu gọn.
          - Mobile: ẩn nút bung/thu (carousel cuộn ngang, không có "hàng bị ẩn"),
            chỉ còn nút tải thêm khi kho còn mẫu.
          Số bối cảnh còn ẩn khác nhau theo số cột (6 ở 3 cột, 4 ở 2 cột) nên nhãn
          nút bung có hai biến thể, CSS chọn đúng nhãn — không đo bề rộng trong JS. */}
      <div className="lookbook-controls">
        {isLoggedIn && !loading && filteredItems.length > visibleCount && (
          <button
            type="button"
            className="lookbook-load-more"
            onClick={() => setVisibleCount((prev) => prev + 24)}
          >
            <span>
              Tải thêm 24 bối cảnh khác ({filteredItems.length - visibleCount} mẫu còn lại)
            </span>
            <ArrowUpRight size={15} className="is-down" aria-hidden="true" />
          </button>
        )}
        {displayedItems.length > 3 &&
          (lookbookExpanded ? (
            <button
              type="button"
              className="lookbook-collapse-toggle"
              onClick={() => setLookbookExpanded(false)}
              aria-expanded={true}
              aria-controls="lookbook-grid"
            >
              <span>Thu gọn bối cảnh</span>
              <ArrowUpRight size={15} className="is-up" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="lookbook-expand-toggle"
              onClick={() => setLookbookExpanded(true)}
              aria-expanded={false}
              aria-controls="lookbook-grid"
            >
              <span className="label-wide">
                Xem tiếp {displayedItems.length - 6} bối cảnh khác ({displayedItems.length} bối cảnh)
              </span>
              <span className="label-tablet">
                Xem tiếp {displayedItems.length - 4} bối cảnh khác ({displayedItems.length} bối cảnh)
              </span>
              <ArrowUpRight size={15} className="is-down" aria-hidden="true" />
            </button>
          ))}
      </div>

      {/* Google Login Gate for Guests (Hiển thị khi chưa đăng nhập) */}
      {!isLoggedIn && !loading && (
        <div className="mt-12 p-8 rounded-2xl border border-[#E7E2DA] bg-[#FDFBF7] text-center max-w-xl mx-auto shadow-sm">
          <div className="inline-flex size-12 items-center justify-center rounded-full bg-[#FAF0EB] text-[#B94A2E] mb-4">
            <LockKeyhole size={24} />
          </div>
          <h3 className="font-serif text-xl font-medium text-[#1D1917] mb-2">
            Khám phá trọn bộ Lookbook Không gian
          </h3>
          <p className="text-sm text-[#78716C] mb-6 leading-relaxed">
            Bộ bối cảnh tuyển chọn trong tuần, tự động làm mới mỗi 7 ngày. Đăng nhập Google để mở
            khóa toàn bộ hơn 100+ bối cảnh thực tế và mã gạch chỉ định.
          </p>
          <button
            type="button"
            disabled={isLoggingIn}
            onClick={handleGoogleLogin}
            className="inline-flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white border border-[#DCD5C9] text-[#1D1917] font-medium text-sm hover:bg-[#F7F4EE] hover:border-[#B94A2E] transition-all shadow-sm cursor-pointer disabled:opacity-60"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{isLoggingIn ? "Đang kết nối Google..." : "Đăng nhập Google để khám phá thêm"}</span>
          </button>
        </div>
      )}

      {/* Loading & Empty State */}
      {loading && (
        <div className="py-16 text-center text-sm text-[#788075]">
          <span>Đang tải các bối cảnh kiến trúc thực tế...</span>
        </div>
      )}
      {!loading && filteredItems.length === 0 && (
        <div className="py-16 text-center text-sm text-[#788075]">
          <span>Chưa có bối cảnh cho không gian này.</span>
        </div>
      )}

      {/* 4. Section Bottom Prompt */}
      <div className="space-lookbook-footer-note">
        <div className="note-left">
          <Sparkles size={16} className="text-terracotta flex-shrink-0" />
          <span>
            Cần tìm thêm các góc ứng dụng khác hoặc yêu cầu ảnh map riêng cho dự án của bạn?
          </span>
        </div>
        <a href="#brief" className="note-cta-link">
          <span>Gửi yêu cầu không gian</span>
          <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
