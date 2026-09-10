import { useState, useMemo, useEffect, FormEvent } from "react";
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  Download,
  Box,
  FileText,
  Layers3,
  Check,
  Plus,
  Eye,
  LockKeyhole,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import {
  fetchPublicCatalogFn,
  authGoogleStart,
  fetchPublicMeFn,
} from "@/api/lp";
import {
  tileLines,
  type LineId,
  type Material,
} from "@/data/mockData";

type MaterialLibraryPageProps = {
  shortlistIds: string[];
  onToggleShortlist: (id: string) => void;
  onOpenMaterialModal: (material: Material) => void;
  onGoToHome: () => void;
  onOpenMoodboard: () => void;
};

const UNLOCKED_STORAGE_KEY = "ebg_library_unlocked";

export function MaterialLibraryPage({
  shortlistIds,
  onToggleShortlist,
  onOpenMaterialModal,
  onGoToHome,
  onOpenMoodboard,
}: MaterialLibraryPageProps) {
  const [selectedCategory, setSelectedCategory] = useState<LineId | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTone, setSelectedTone] = useState<string>("all");
  const [selectedFinish, setSelectedFinish] = useState<string>("all");
  const [selectedSize, setSelectedSize] = useState<string>("all");

  // Unlock Gate State (Up to 12 items demo preview)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [gateSuccessToast, setGateSuccessToast] = useState(false);

  const [liveMaterials, setLiveMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await authGoogleStart({
        data: {
          returnTo: typeof window !== "undefined" ? window.location.href : "/",
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
    // Kiểm tra phiên đăng nhập public
    fetchPublicMeFn()
      .then((user) => {
        if (user) {
          setIsUnlocked(true);
        }
      })
      .catch(() => {});

    fetchPublicCatalogFn({ data: { limit: 300 } })
      .then((res) => {
        if (res && res.items && res.items.length > 0) {
          const mapped: Material[] = res.items.map((p) => ({
            id: String(p.id),
            code: p.code,
            name: p.name,
            type: (p.category as Material["type"]) || "Gạch thẻ",
            size: p.size || "",
            finish: p.surface || "Men mờ",
            tone: p.color || "#B94A2E",
            image: p.image,
            description: `${p.name} (${p.size || ""})`,
            application: "Tường trang trí, phòng tắm, vách sảnh, mặt tiền",
          }));
          setLiveMaterials(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allLibraryMaterials = liveMaterials;

  // Filter options derived from data
  const toneOptions = useMemo(() => {
    return [
      { id: "all", label: "Tất cả tông màu" },
      { id: "#B94A2E", label: "Đất nung / Terracotta" },
      { id: "#2E4E52", label: "Xanh khoáng / Rêu" },
      { id: "#C8B7A1", label: "Be cát / Kem" },
      { id: "#1E3544", label: "Mực xanh / Đen tro" },
      { id: "#9A634E", label: "Hổ phách / Nâu" },
      { id: "#948E81", label: "Ghi xám / Xi măng" },
    ];
  }, []);

  const finishOptions = useMemo(() => {
    const set = new Set<string>();
    allLibraryMaterials.forEach((m) => {
      if (m.finish) set.add(m.finish);
    });
    return ["all", ...Array.from(set)];
  }, [allLibraryMaterials]);

  const sizeOptions = useMemo(() => {
    const set = new Set<string>();
    allLibraryMaterials.forEach((m) => {
      if (m.size) set.add(m.size);
    });
    return ["all", ...Array.from(set)];
  }, [allLibraryMaterials]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return allLibraryMaterials.filter((m) => {
      if (selectedCategory !== "all") {
        const typeMap: Record<LineId, string> = {
          "gach-the": "Gạch thẻ",
          mosaic: "Gạch mosaic",
          "gach-bong": "Gạch bông",
          "gach-op-lat": "Gạch ốp lát",
        };
        if (m.type !== typeMap[selectedCategory]) return false;
      }

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const match =
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          m.finish.toLowerCase().includes(q) ||
          m.size.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (selectedTone !== "all" && m.tone !== selectedTone) return false;
      if (selectedFinish !== "all" && m.finish !== selectedFinish) return false;
      if (selectedSize !== "all" && m.size !== selectedSize) return false;

      return true;
    });
  }, [allLibraryMaterials, selectedCategory, searchQuery, selectedTone, selectedFinish, selectedSize]);

  // Ngưỡng xem trước: hiển thị 12 mã demo khi chưa đăng nhập
  const DEMO_LIMIT = 12;
  const visibleMaterials = isUnlocked
    ? filteredMaterials
    : filteredMaterials.slice(0, DEMO_LIMIT);

  const showUnlockGate = !isUnlocked;


  return (
    <div className="material-library-page">
      {/* Top Bar Header */}
      <header className="library-topbar">
        <div className="library-topbar-left">
          <button
            type="button"
            onClick={onGoToHome}
            className="library-back-btn"
            aria-label="Quay lại trang chủ"
          >
            <ArrowLeft size={16} />
            <span>Trang chủ</span>
          </button>
          <div className="library-divider-v" />
          <BrandMark size={28} />
          <span className="library-brand-name">THƯ VIỆN MÃ VẬT LIỆU</span>
        </div>

        <div className="library-topbar-right">
          {isUnlocked && (
            <span className="library-unlocked-badge">
              <ShieldCheck size={14} className="text-[#2e6b4e]" />
              <span>Đã mở khóa toàn bộ</span>
            </span>
          )}
          <button
            type="button"
            onClick={onOpenMoodboard}
            className="library-moodboard-pill"
          >
            <Layers3 size={16} />
            <span>Moodboard ({shortlistIds.length})</span>
          </button>
        </div>
      </header>

      {/* Hero Section — Clean, open, no aggressive email capture boxes */}
      <section className="library-hero-banner-clean">
        <div className="library-hero-container">
          <div className="library-hero-badge">
            <Sparkles size={14} />
            <span>PUBLIC ARCHITECTURAL CATALOG · 2026 EDITION</span>
          </div>
          <h1 className="library-hero-title">Thư viện mã gạch nguyên bản</h1>
          <p className="library-hero-subtitle">
            Khám phá trực tiếp các bề mặt đất nung, gốm men rạn thủ công, mosaic và gạch ốp lát. Bạn có thể xem trước 12 mã tuyển chọn và lọc tự do theo từng dòng concept.
          </p>

          {/* Value Highlights Pill Bar */}
          <div className="library-highlights-bar">
            <div className="highlight-pill">
              <span className="highlight-dot" />
              <span>300+ Mã gạch lưu trữ theo catalogue</span>
            </div>
            <div className="highlight-pill">
              <span className="highlight-dot" />
              <span>100% Ảnh chụp Macro &amp; Phối cảnh thật</span>
            </div>
            <div className="highlight-pill">
              <span className="highlight-dot" />
              <span>Hỗ trợ trọn bộ ảnh Map vật liệu</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog View Container */}
      <main className="library-main-container">
        {/* Search & Category Filter Bar */}
        <div className="library-filter-control-panel">
          {/* Search Box */}
          <div className="library-search-wrapper">
            <Search size={18} className="search-icon-fixed" />
            <input
              type="text"
              placeholder="Tìm theo mã (GT-01, MS-02...), tên vật liệu hoặc bề mặt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="library-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="search-clear-btn"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="library-category-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
              className={`lib-cat-tab ${selectedCategory === "all" ? "is-active" : ""}`}
            >
              Tất cả dòng gạch ({allLibraryMaterials.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "gach-the"}
              onClick={() => setSelectedCategory("gach-the")}
              className={`lib-cat-tab ${selectedCategory === "gach-the" ? "is-active" : ""}`}
            >
              Gạch thẻ (GT)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "mosaic"}
              onClick={() => setSelectedCategory("mosaic")}
              className={`lib-cat-tab ${selectedCategory === "mosaic" ? "is-active" : ""}`}
            >
              Gạch mosaic (MS)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "gach-bong"}
              onClick={() => setSelectedCategory("gach-bong")}
              className={`lib-cat-tab ${selectedCategory === "gach-bong" ? "is-active" : ""}`}
            >
              Gạch bông (GB)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "gach-op-lat"}
              onClick={() => setSelectedCategory("gach-op-lat")}
              className={`lib-cat-tab ${selectedCategory === "gach-op-lat" ? "is-active" : ""}`}
            >
              Gạch ốp lát (OL)
            </button>
          </div>

          {/* Contextual Facet Dropdowns */}
          <div className="library-facet-row">
            <div className="facet-group">
              <span className="facet-label">Tông màu:</span>
              <select
                value={selectedTone}
                onChange={(e) => setSelectedTone(e.target.value)}
                className="facet-select"
              >
                {toneOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="facet-group">
              <span className="facet-label">Bề mặt:</span>
              <select
                value={selectedFinish}
                onChange={(e) => setSelectedFinish(e.target.value)}
                className="facet-select"
              >
                <option value="all">Tất cả bề mặt</option>
                {finishOptions
                  .filter((f) => f !== "all")
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>

            <div className="facet-group">
              <span className="facet-label">Kích thước:</span>
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                className="facet-select"
              >
                <option value="all">Tất cả kích thước</option>
                {sizeOptions
                  .filter((s) => s !== "all")
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </div>

            {(selectedCategory !== "all" ||
              selectedTone !== "all" ||
              selectedFinish !== "all" ||
              selectedSize !== "all" ||
              searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedTone("all");
                  setSelectedFinish("all");
                  setSelectedSize("all");
                  setSearchQuery("");
                }}
                className="facet-reset-btn"
              >
                ✕ Xóa bộ lọc
              </button>
            )}

            <div className="library-results-count">
              Đang hiển thị <strong>{visibleMaterials.length}</strong> / {filteredMaterials.length} mã vật liệu
              {!isUnlocked && " (Bản xem trước)"}
            </div>
          </div>
        </div>

        {/* Unlocked Toast Banner */}
        {gateSuccessToast && (
          <div className="unlocked-notification-bar">
            <div className="flex items-center gap-2">
              <Check size={18} className="text-[#2e6b4e]" />
              <span>
                <strong>Đã mở khóa thành công!</strong> Toàn bộ catalog vật liệu và link tải ảnh Map vật liệu đã sẵn sàng bên dưới.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGateSuccessToast(false)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Materials Masonry Grid */}
        <div className="library-grid-display">
          {filteredMaterials.length === 0 ? (
            <div className="library-empty-state">
              <SlidersHorizontal size={40} className="text-muted-foreground" />
              <h3>Không tìm thấy mã vật liệu phù hợp</h3>
              <p>Thử xóa bộ lọc hoặc tìm kiếm với từ khóa khác (ví dụ: gạch thẻ, đất nung, xanh khoáng, mosaic).</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedTone("all");
                  setSelectedFinish("all");
                  setSelectedSize("all");
                  setSearchQuery("");
                }}
                className="btn-clear-empty-filter"
              >
                Đặt lại toàn bộ bộ lọc
              </button>
            </div>
          ) : (
            visibleMaterials.map((mat) => {
              const isSelected = shortlistIds.includes(mat.id);
              return (
                <div key={mat.id} className="library-material-card">
                  {/* Macro Texture Image */}
                  <div
                    className="lib-card-media"
                    onClick={() => onOpenMaterialModal(mat)}
                    role="button"
                    tabIndex={0}
                  >
                    <img
                      src={mat.image}
                      alt={mat.name}
                      className="lib-card-img"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                    />
                    <span className="lib-card-code-badge">{mat.code}</span>
                    <button
                      type="button"
                      className="lib-card-view-overlay"
                      aria-label="Xem chi tiết và Map 3D"
                    >
                      <Eye size={16} />
                      <span>Xem mẫu &amp; Map 3D</span>
                    </button>
                  </div>

                  {/* Card Content */}
                  <div className="lib-card-body">
                    <div className="lib-card-meta-line">
                      <span className="lib-card-type">{mat.type}</span>
                      <span className="lib-card-size">{mat.size}</span>
                    </div>

                    <h3
                      className="lib-card-title"
                      onClick={() => onOpenMaterialModal(mat)}
                    >
                      {mat.name}
                    </h3>

                    <p className="lib-card-finish">{mat.finish}</p>
                    <p className="lib-card-desc">{mat.description}</p>

                    <div className="lib-card-actions">
                      <button
                        type="button"
                        onClick={() => onToggleShortlist(mat.id)}
                        className={`lib-btn-shortlist ${
                          isSelected ? "is-selected" : ""
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check size={14} strokeWidth={2.5} />
                            <span>Đã lưu</span>
                          </>
                        ) : (
                          <>
                            <Plus size={14} strokeWidth={2.5} />
                            <span>Lưu vào Moodboard</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenMaterialModal(mat)}
                        className="lib-btn-detail"
                      >
                        Chi tiết
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* UNLOCK GATE SECTION (Hiển thị khi khách xem hết 12 mã xem trước và muốn xem thêm) */}
        {/* UNLOCK GATE SECTION (Hiển thị khi khách chưa đăng nhập) */}
        {showUnlockGate && (
          <div className="library-progressive-unlock-gate">
            <div className="gate-card-inner">
              <div className="gate-visual-accent">
                <LockKeyhole size={28} className="text-[var(--terracotta)]" />
              </div>

              <div className="gate-text-content">
                <span className="gate-badge-label">MỞ KHÓA THƯ VIỆN</span>
                <h3 className="gate-title">Mở khóa toàn bộ Thư viện mã gạch</h3>
                <p className="gate-description">
                  Bạn đang ở chế độ xem trước ({visibleMaterials.length} mã). Đăng nhập bằng tài khoản Google để mở khóa toàn bộ <strong>300+ mã gạch</strong> cùng trọn bộ <strong>ảnh Map vật liệu</strong> (SketchUp / 3dsMax) và Bảng Spec vật liệu dự án.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3 pt-3">
                <button
                  type="button"
                  disabled={isLoggingIn}
                  onClick={handleGoogleLogin}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl bg-white border border-[#DCD5C9] text-[#1D1917] font-semibold text-sm hover:bg-[#FAF8F5] hover:border-[#B94A2E] transition-all shadow-md cursor-pointer disabled:opacity-60 hover:shadow-lg"
                >
                  <svg className="size-5" viewBox="0 0 24 24">
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
                  <span>{isLoggingIn ? "Đang kết nối Google..." : "Đăng nhập bằng Google"}</span>
                  <ArrowRight size={16} className="text-[#B94A2E]" />
                </button>
                <p className="text-xs text-[#78716C]">
                  🔒 Xác thực bảo mật qua Google. Không cần mật khẩu, mở khóa ngay lập tức.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
