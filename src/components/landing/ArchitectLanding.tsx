import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Facebook,
  Layers3,
  MapPin,
  Menu,
  MoveUpRight,
  Phone,
  Send,
  Sparkles,
  X,
  Eye,
} from "lucide-react";
import { MaterialCard } from "./MaterialCard";
import { ProjectBriefForm } from "./ProjectBriefForm";
import { BrandMark } from "./BrandMark";
import { ChatWidget } from "./ChatWidget";
import { ConsentBanner } from "./ConsentBanner";
import { MoodboardDrawer } from "./MoodboardDrawer";
import { MaterialModal } from "./MaterialModal";
import { SpaceLookbookSection } from "./SpaceLookbookSection";
import { MaterialLibraryPage } from "./MaterialLibraryPage";
import { useShortlistStorage } from "./useShortlistStorage";
import { clearConsent, stopGtm } from "@/lib/lp-consent";
import { useShortlistedMaterials } from "./useShortlistedMaterials";
import { trackEvent } from "@/lib/lp-tracking";
import {
  tileLines,
  deliverables,
  heroImage,
  fnbCollectionImage,
  type Material,
  type TileLine,
} from "@/data/mockData";
import { fetchLpMaterialsFn } from "@/api/lp";

/** TikTok không có trong lucide-react nên vẽ tay. */
function TikTokIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ArchitectLanding({ heroImage: customHeroImage }: { heroImage?: string } = {}) {
  const activeHeroImage = customHeroImage || heroImage;
  const [currentView, setCurrentView] = useState<"home" | "library">("home");
  const {
    shortlistIds: selectedIds,
    toggleMaterial: toggleStorageMaterial,
    clearShortlist,
  } = useShortlistStorage([]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [moodboardOpen, setMoodboardOpen] = useState(false);
  const [activeModalMaterial, setActiveModalMaterial] = useState<Material | null>(null);
  const [modalInitialTab, setModalInitialTab] = useState<"surface" | "context">("surface");
  const [modalItems, setModalItems] = useState<Material[]>([]);

  const handleOpenMaterialModal = (
    mat: Material,
    tab: "surface" | "context" = "surface",
    list?: Material[],
  ) => {
    setActiveModalMaterial(mat);
    setModalInitialTab(tab);
    setModalItems(list && list.length > 0 ? list : liveMaterials);
  };
  const [liveMaterials, setLiveMaterials] = useState<Material[]>([]);

  // Initial page view tracking & fetch live materials
  useEffect(() => {
    trackEvent("ViewContent", { content_name: "em-ban-gach-landing", page: currentView });
    fetchLpMaterialsFn({ data: { limit: 12 } })
      .then((mats) => {
        if (mats && mats.length > 0) {
          const mapped: Material[] = mats.map((m) => ({
            id: String(m.id),
            code: m.code,
            name: m.name,
            type: (m.category as Material["type"]) || "Gạch thẻ",
            size: m.size,
            finish: m.surface || "Men mờ",
            tone: m.color || "#B94A2E",
            image: m.image,
            description: `${m.name} (${m.size || ""})`,
            application: "Tường trang trí, sảnh, phòng tắm, villa",
          }));
          setLiveMaterials(mapped);
        } else {
          setLiveMaterials([]);
        }
      })
      .catch(() => {
        setLiveMaterials([]);
      });
  }, [currentView]);

  // Scroll to top when switching views
  const handleSwitchView = (view: "home" | "library") => {
    setCurrentView(view);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleMaterial = (id: string) => {
    const isAdding = !selectedIds.includes(id);
    toggleStorageMaterial(id);
    if (isAdding) {
      trackEvent("AddToCart", { material_id: id });
    }
  };

  // Xoá lựa chọn cookie để banner hiện lại, khách đổi ý được bất cứ lúc nào.
  // `stopGtm` nạp lại trang nếu GTM đang chạy — không reload thì container vẫn
  // sống trong RAM và tiếp tục bắn dù đã rút đồng thuận.
  const reopenConsent = () => {
    clearConsent();
    stopGtm();
  };

  // Shortlist = resolve theo canonical ID (KHÔNG filter trên 12 material của Home).
  const {
    materials: shortlistedMaterials,
    missingIds: shortlistMissingIds,
    loading: shortlistLoading,
  } = useShortlistedMaterials(selectedIds);

  const handleNextMaterial = () => {
    if (!activeModalMaterial) return;
    const list = modalItems.length > 0 ? modalItems : liveMaterials;
    const index = list.findIndex((m) => m.id === activeModalMaterial.id);
    if (index !== -1) {
      const nextIndex = (index + 1) % list.length;
      setActiveModalMaterial(list[nextIndex]!);
    }
  };

  const handlePrevMaterial = () => {
    if (!activeModalMaterial) return;
    const list = modalItems.length > 0 ? modalItems : liveMaterials;
    const index = list.findIndex((m) => m.id === activeModalMaterial.id);
    if (index !== -1) {
      const prevIndex = (index - 1 + list.length) % list.length;
      setActiveModalMaterial(list[prevIndex]!);
    }
  };

  return (
    <div className="architect-landing-wrapper">
      {/* VIEW 1: DEDICATED CATALOG PAGE */}
      {currentView === "library" ? (
        <MaterialLibraryPage
          shortlistIds={selectedIds}
          onToggleShortlist={toggleMaterial}
          onOpenMaterialModal={(mat) => handleOpenMaterialModal(mat, "surface")}
          onGoToHome={() => handleSwitchView("home")}
          onOpenMoodboard={() => setMoodboardOpen(true)}
        />
      ) : (
        /* VIEW 2: MAIN EDITORIAL LANDING PAGE */
        <div className="architect-landing">
          {/* 1. Header */}
          <header className="landing-header">
            <a
              className="brand-lockup cursor-pointer"
              onClick={() => handleSwitchView("home")}
              aria-label="em bán gạch — về đầu trang"
            >
              <BrandMark size={28} />
              <span>em bán gạch</span>
            </a>

            <nav
              className={menuOpen ? "nav-links is-open" : "nav-links"}
              aria-label="Điều hướng chính"
            >
              <a href="#dong-gach" onClick={() => setMenuOpen(false)}>
                Chọn dòng gạch
              </a>
              <a href="#vat-lieu-tuyen-chon" onClick={() => setMenuOpen(false)}>
                Vật liệu tuyển chọn
              </a>
              <a href="#khong-gian" onClick={() => setMenuOpen(false)}>
                Không gian
              </a>
              <a
                href="#thu-vien"
                onClick={(e) => {
                  e.preventDefault();
                  handleSwitchView("library");
                }}
                className="nav-link-highlight"
              >
                Thư viện mã gạch
              </a>
              <a href="#quy-trinh" onClick={() => setMenuOpen(false)}>
                Quy trình &amp; Cam kết
              </a>
            </nav>

            <div className="header-actions">
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  className="header-moodboard-btn"
                  onClick={() => setMoodboardOpen(true)}
                  title="Mở bảng Moodboard"
                >
                  <BookOpen size={15} />
                  <span>Moodboard ({selectedIds.length})</span>
                </button>
              )}

              <button
                className="header-brief"
                type="button"
                onClick={() => scrollToSection("brief")}
              >
                <span>Gửi brief</span>
                <ArrowDownRight size={16} />
              </button>

              <button
                className="menu-toggle"
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Mở menu"
                aria-expanded={menuOpen}
              >
                {menuOpen ? <X size={21} /> : <Menu size={21} />}
              </button>
            </div>
          </header>

          <main id="top">
            {/* 2. Hero Section */}
            <section className="hero-section">
              <div className="hero-copy">
                <p className="section-kicker hero-kicker">
                  <span /> DÀNH CHO KIẾN TRÚC SƯ &amp; STUDIO THIẾT KẾ
                </p>
                <h1>
                  Bắt đầu từ
                  <br />
                  <em>một mã</em> gạch
                  <br />
                  phù hợp.
                </h1>
                <p className="hero-intro">
                  Một tài liệu vật liệu theo chiều dọc dành cho concept: bắt đầu từ màu sắc, bề mặt
                  và nhịp gạch trước khi bạn cần tới thông số kỹ thuật. Em chọn trước các mã tiêu
                  biểu để bạn khởi đầu nhanh cho công trình.
                </p>
                <div className="hero-buttons">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => scrollToSection("vat-lieu-tuyen-chon")}
                  >
                    Xem vật liệu tuyển chọn <ArrowRight size={18} />
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleSwitchView("library")}
                  >
                    Mở Thư viện mã gạch <MoveUpRight size={17} />
                  </button>
                </div>
                <div className="hero-footnote">
                  <span className="footnote-line" /> Vật liệu tuyển chọn → Lookbook Không gian → Thư
                  viện gạch → Shortlist &amp; Brief
                </div>
              </div>

              <div className="hero-media">
                <img
                  src={activeHeroImage}
                  alt="Không gian villa với sàn gạch tông đất nung dưới ánh nắng chiều"
                />
                <div className="hero-media-caption">
                  <span>EBG / MATERIAL STUDY</span>
                  <span>2026 EDITION</span>
                </div>
                <div className="hero-mark">
                  <BrandMark size={32} />
                </div>
              </div>

              <aside className="hero-index" aria-label="Thông tin trang">
                <span>SCROLL TO EXPLORE</span>
                <i />
              </aside>
            </section>

            {/* 3. Section 01: Chọn Dòng Gạch (Intent / Tile Lines) */}
            <section id="dong-gach" className="intent-section" aria-labelledby="intent-title">
              <div className="intent-heading">
                <p className="section-kicker">CHỌN DÒNG GẠCH THEO CONCEPT</p>
                <h2 id="intent-title">
                  Chọn dòng trước,
                  <br />
                  rồi chọn <em>mã</em>.
                </h2>
              </div>
              <div className="intent-grid">
                {tileLines.map((item: TileLine) => (
                  <button
                    key={item.id}
                    type="button"
                    className="intent-card text-left cursor-pointer group transition-all"
                    onClick={() => handleSwitchView("library")}
                  >
                    <span className="intent-number">{item.number}</span>
                    <span className="intent-title group-hover:text-[#B94A2E] transition-colors">
                      {item.title}
                    </span>
                    <span className="intent-description">{item.description}</span>
                    <span className="intent-action">
                      Mở catalog dòng này <ChevronRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {/* 4. Section 02: Vật Liệu Tuyển Chọn (Curated Picks) */}
            <section
              id="vat-lieu-tuyen-chon"
              className="library-section"
              aria-labelledby="library-title"
            >
              <div className="library-topline">
                <div>
                  <p className="section-kicker">CURATED SELECTION · 2026 EDITION</p>
                  <h2 id="library-title">
                    Vật liệu
                    <br />
                    tuyển chọn.
                  </h2>
                </div>
                <p className="library-lede">
                  Những bề mặt đất nung, gốm men rạn, mosaic và gạch ốp lát tiêu biểu. Đây là lớp mở
                  đầu cô đọng để bạn chạm vào cảm xúc bề mặt trước khi đi sâu vào Thư viện mã gạch.
                </p>
              </div>
              {/* Ledger */}
              <div className="featured-ledger">
                <span>FEATURED SELECTION / 2026 · {liveMaterials.length} MÃ TIÊU BIỂU</span>
                <span>CLICK CARD ĐỂ SOI CẬN CẢNH VÂN &amp; ẢNH PHỐI CẢNH</span>
              </div>

              {/* Materials Grid */}
              {liveMaterials.length > 0 ? (
                <div className="materials-grid">
                  {liveMaterials.map((material) => (
                    <MaterialCard
                      key={material.id}
                      material={material}
                      selected={selectedIds.includes(material.id)}
                      onToggle={toggleMaterial}
                      onOpenModal={(mat) => handleOpenMaterialModal(mat, "surface")}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/80 bg-surface-strong/30 p-8 text-center my-6">
                  <p className="text-sm font-semibold text-foreground">
                    Bộ tuyển chọn đang được cập nhật
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vui lòng quay lại sau để xem các mẫu vật liệu mới nhất.
                  </p>
                </div>
              )}
              {/* Inline Shortlist Notification */}
              {selectedIds.length > 0 && (
                <aside className="shortlist-inline" aria-live="polite">
                  <BookOpen size={20} className="text-[#B94A2E] shrink-0" />
                  <div>
                    <strong>{selectedIds.length} mã đang nằm trong shortlist của bạn</strong>
                    <span>
                      Em sẽ dùng danh sách này làm điểm khởi đầu khi đọc brief dự án và chuẩn bị
                      mẫu.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="shortlist-inline-moodboard-btn"
                      onClick={() => setMoodboardOpen(true)}
                    >
                      <Eye size={15} />
                      <span>Xem Moodboard</span>
                    </button>
                    <button
                      type="button"
                      className="shortlist-inline-brief-btn"
                      onClick={() => scrollToSection("brief")}
                    >
                      <span>Đi tới brief</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </aside>
              )}

              <div className="library-foot">
                <div>
                  <Layers3 size={18} />
                  <span>
                    Cần tra cứu toàn bộ danh mục và tải file ảnh Map vật liệu? Mời bạn ghé trang Thư
                    viện mã gạch chuyên sâu.
                  </span>
                </div>
                <button
                  type="button"
                  className="text-action"
                  onClick={() => handleSwitchView("library")}
                >
                  Mở trang Thư viện mã gạch <ArrowRight size={17} />
                </button>
              </div>
            </section>

            {/* 5. Section 03: Lookbook Không Gian Thực Tế & Bộ Sưu Tập Dự Án (1 Ảnh = 1 Mã Gạch) */}
            <SpaceLookbookSection
              shortlistIds={selectedIds}
              onToggleShortlist={toggleMaterial}
              onOpenMaterialModal={(mat, tab, list) =>
                handleOpenMaterialModal(mat, tab || "context", list)
              }
            />

            {/* 6. Section 04: Quy Trình & Cam Kết (Deliverables) */}
            <section
              id="quy-trinh"
              className="deliverables-section"
              aria-labelledby="deliverables-title"
            >
              <div className="deliverables-visual">
                <img
                  src={fnbCollectionImage}
                  alt="Bề mặt gạch trong không gian F&B có ánh sáng tự nhiên"
                />
                <span className="visual-note">
                  VẬT LIỆU CẦN ĐƯỢC
                  <br />
                  ĐẶT ĐÚNG BỐI CẢNH
                </span>
              </div>
              <div className="deliverables-copy">
                <p className="section-kicker">KHI BẠN ĐÃ CÓ SHORTLIST</p>
                <h2 id="deliverables-title">
                  Thứ bạn nhận lại
                  <br />
                  không chỉ là mã gạch.
                </h2>
                <div className="deliverable-list">
                  {deliverables.map((item) => (
                    <article key={item.number}>
                      <span>{item.number}</span>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* 7. Section 05: Hồ Sơ Dự Án (Project Brief Form) */}
            <section id="brief" className="brief-section" aria-labelledby="brief-title">
              <div className="brief-heading">
                <p className="section-kicker">BẮT ĐẦU TỪ ĐÂY</p>
                <h2 id="brief-title">
                  Bạn đang có dự án
                  <br />
                  cần tìm vật liệu?
                </h2>
                <p>
                  Điền những gì bạn đã có. Nếu concept còn đang ở dạng vài ghi chú hoặc moodboard sơ
                  phác, cũng hoàn toàn đủ để bắt đầu một cuộc trao đổi chuyên sâu.
                </p>
                <div className="brief-promise">
                  <Sparkles size={18} />
                  <span>
                    Ưu tiên tư vấn theo context dự án,
                    <br />
                    không gửi một bảng giá chung chung.
                  </span>
                </div>
              </div>

              <div className="brief-panel">
                <div className="brief-folder-label">
                  <span>EBG / HỒ SƠ VẬT LIỆU DỰ ÁN</span>
                  <span>BRIEF — 01</span>
                </div>
                <ProjectBriefForm
                  intent="new-project"
                  shortlistMaterialIds={selectedIds}
                  onRemoveShortlistId={toggleMaterial}
                />
              </div>
            </section>
          </main>

          {/* 8. Footer */}
          <footer className="landing-footer">
            <div className="footer-brand">
              <BrandMark size={36} />
              <span>em bán gạch</span>
            </div>
            <p className="footer-tagline">
              Những viên gạch nhỏ cho những không gian
              <br />
              có chuyện để kể...
            </p>
            <div className="footer-contact">
              <a
                className="footer-contact-link"
                href="https://maps.app.goo.gl/3Hqo3fNFhF2B3UrY8"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin size={12} />
                <span>Showroom &amp; Kho mẫu: TP. Hồ Chí Minh</span>
                <ArrowUpRight size={11} className="footer-ext-arrow" />
              </a>
              <a className="footer-contact-link" href="tel:0909888951">
                <Phone size={12} />
                <span>0909 888 951</span>
              </a>
              <div className="footer-socials">
                <a
                  className="footer-social-link"
                  href="https://fb.com/embangach"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook em bán gạch"
                >
                  <Facebook size={12} />
                  <span>fb.com/embangach</span>
                </a>
                <span className="footer-divider" aria-hidden="true">
                  /
                </span>
                <a
                  className="footer-social-link"
                  href="https://tiktok.com/embangach"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok em bán gạch"
                >
                  <TikTokIcon size={12} />
                  <span>@embangach</span>
                </a>
              </div>
              <a className="footer-cta" href="#brief">
                Gửi brief ngay <Send size={13} />
              </a>
            </div>
            <div className="footer-copyright">
              <span className="footer-copyright-line">
                © 2026 em bán gạch · &ldquo;Material Journal for Architects&rdquo;
              </span>
              <button type="button" className="footer-consent-btn" onClick={reopenConsent}>
                Đổi lựa chọn cookie
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* Floating Bottom Shortlist Bar */}
      {selectedIds.length > 0 && (
        <aside className="shortlist-tray is-visible" aria-live="polite">
          <div className="tray-count" onClick={() => setMoodboardOpen(true)}>
            <BookOpen size={16} />
            <span>
              <strong>{selectedIds.length}</strong> mã gạch đã lưu
            </span>
          </div>
          <div className="tray-materials">
            {selectedIds.slice(0, 4).map((id: string) => {
              const mat = liveMaterials.find((m) => m.id === id);
              if (!mat) return null;
              return (
                <div
                  key={id}
                  className="tray-thumb-item"
                  title={`${mat.code} — ${mat.name}`}
                  onClick={() => setActiveModalMaterial(mat)}
                >
                  <img src={mat.image} alt={mat.name} />
                  <span>{mat.code}</span>
                </div>
              );
            })}
            {selectedIds.length > 4 && (
              <span className="tray-more-badge">+{selectedIds.length - 4}</span>
            )}
          </div>
          <div className="tray-actions">
            <button
              type="button"
              className="tray-btn-moodboard"
              onClick={() => setMoodboardOpen(true)}
            >
              <Eye size={15} />
              <span>Moodboard</span>
            </button>
            <button
              type="button"
              className="tray-btn-send"
              onClick={() => {
                if (currentView === "library") handleSwitchView("home");
                setTimeout(() => scrollToSection("brief"), 100);
              }}
            >
              <span>Gửi brief</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      )}

      {/* Slide-out Moodboard Drawer */}
      <MoodboardDrawer
        isOpen={moodboardOpen}
        onClose={() => setMoodboardOpen(false)}
        shortlistedMaterials={shortlistedMaterials}
        selectedCount={selectedIds.length}
        missingIds={shortlistMissingIds}
        loading={shortlistLoading}
        onRemove={toggleMaterial}
        onClearAll={clearShortlist}
        onGoToBrief={() => {
          setMoodboardOpen(false);
          if (currentView === "library") handleSwitchView("home");
          setTimeout(() => scrollToSection("brief"), 100);
        }}
        onSelectMaterial={(mat) => setActiveModalMaterial(mat)}
      />

      {/* Dual-View Material Detail Modal */}
      {activeModalMaterial && (
        <MaterialModal
          material={activeModalMaterial}
          initialTab={modalInitialTab}
          selected={selectedIds.includes(activeModalMaterial.id)}
          onToggle={(id) => toggleMaterial(id)}
          onClose={() => setActiveModalMaterial(null)}
          onNext={handleNextMaterial}
          onPrev={handlePrevMaterial}
          onGoToBrief={() => {
            setActiveModalMaterial(null);
            if (currentView === "library") handleSwitchView("home");
            setTimeout(() => scrollToSection("brief"), 100);
          }}
        />
      )}

      {/* Floating Chat / Consultation Widget */}
      <ChatWidget />

      {/* Cookie consent cho GTM — chỉ hiện khi khách chưa chọn */}
      <ConsentBanner raised={selectedIds.length > 0} />
    </div>
  );
}
