import { useState, useEffect, useRef } from "react";
import {
  X,
  Check,
  Plus,
  Eye,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Material } from "@/data/mockData";
import { COLOR_PALETTES, matchColorPalette } from "@/lib/color-palette";

function getToneDisplay(rawTone: string | null | undefined): { label: string; hex: string; border: string } {
  if (!rawTone) return { label: "Đa sắc", hex: "#B94A2E", border: "rgba(0,0,0,0.15)" };
  if (rawTone.startsWith("#")) {
    return { label: rawTone, hex: rawTone, border: "rgba(0,0,0,0.15)" };
  }
  const pid = matchColorPalette(rawTone);
  const found = COLOR_PALETTES.find((p) => p.id === pid);
  if (found) {
    return { label: rawTone, hex: found.hex, border: found.dotBorder || "rgba(0,0,0,0.15)" };
  }
  return { label: rawTone, hex: "#B94A2E", border: "rgba(0,0,0,0.15)" };
}
type MaterialModalProps = {
  material: Material | null;
  selected: boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
  onGoToBrief: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  initialTab?: "surface" | "context";
};

export function MaterialModal({
  material,
  selected,
  onToggle,
  onClose,
  onGoToBrief,
  onNext,
  onPrev,
  initialTab = "surface",
}: MaterialModalProps) {
  const [activeTab, setActiveTab] = useState<"surface" | "context">(initialTab);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

  // Khi đổi mã gạch (qua Next/Prev): giữ nguyên tab đang chọn nếu mã mới có hỗ trợ; ngược lại thì auto-fallback về "surface"
  useEffect(() => {
    if (activeTab === "context" && material?.contextImage) {
      return;
    }
    setActiveTab(initialTab);
  }, [material?.id, initialTab]);

  // Keyboard navigation: Escape to close, ArrowLeft for Prev, ArrowRight for Next
  useEffect(() => {
    if (!material) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [material, onClose, onPrev, onNext]);

  if (!material) return null;

  const displayImage =
    activeTab === "context" && material.contextImage
      ? material.contextImage
      : material.image;

  const showContextCorner =
    activeTab === "context" && !!material.image;
  const showSurfaceCorner =
    activeTab === "surface" && !!material.contextImage;

  return (
    <div className="material-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="material-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="material-modal-close"
          onClick={onClose}
          aria-label="Đóng cửa sổ (Esc)"
          title="Đóng (Esc)"
        >
          <X size={20} />
        </button>

        <div className="material-modal-grid">
          {/* Visual Column */}
          <div className="material-modal-visual">
            <div className="material-modal-image-wrapper">
              <img
                key={displayImage}
                src={displayImage}
                alt={`${material.name} - ${activeTab === "surface" ? "Bề mặt macro" : "Không gian thực tế"}`}
                className="material-modal-image"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                    setImgNatural({ w: el.naturalWidth, h: el.naturalHeight });
                  }
                }}
              />
              <div className="material-modal-tag">
                <span>EBG / {material.code}</span>
              </div>

              {/* Góc nhỏ phía trên bên phải: Preview ảnh Map / Bối cảnh để click đổi nhanh */}
              {showContextCorner && (
                <button
                  type="button"
                  className="modal-corner-preview"
                  onClick={() => setActiveTab("surface")}
                  title="Nhấp để xem bề mặt Map chi tiết"
                >
                  <img
                    src={material.image}
                    alt={`Bề mặt Map ${material.name}`}
                    className="corner-thumb-img"
                    draggable={false}
                  />
                  <span className="corner-thumb-label">
                    <Layers size={10} />
                    <span>Ảnh MAP</span>
                  </span>
                </button>
              )}
              {showSurfaceCorner && (
                <button
                  type="button"
                  className="modal-corner-preview"
                  onClick={() => setActiveTab("context")}
                  title="Nhấp để xem trong không gian thực tế"
                >
                  <img
                    src={material.contextImage}
                    alt={`Bối cảnh ${material.name}`}
                    className="corner-thumb-img"
                    draggable={false}
                  />
                  <span className="corner-thumb-label">
                    <Eye size={10} />
                    <span>Không gian</span>
                  </span>
                </button>
              )}

              {/* Prev / Next floating arrow buttons */}
              {onPrev && (
                <button
                  type="button"
                  onClick={onPrev}
                  className="modal-nav-arrow is-prev"
                  aria-label="Mã trước đó (Phím mũi tên trái)"
                  title="Mã trước (←)"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              {onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="modal-nav-arrow is-next"
                  aria-label="Mã tiếp theo (Phím mũi tên phải)"
                  title="Mã kế tiếp (→)"
                >
                  <ChevronRight size={20} />
                </button>
              )}
            </div>

            {/* View Switcher Tabs */}
            {material.contextImage && (
              <div className="material-modal-tabs">
                <button
                  type="button"
                  className={`modal-tab-btn ${activeTab === "surface" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("surface")}
                >
                  <Layers size={14} />
                  <span>Bề mặt chi tiết (Map)</span>
                </button>
                <button
                  type="button"
                  className={`modal-tab-btn ${activeTab === "context" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("context")}
                >
                  <Eye size={14} />
                  <span>Xem trong không gian</span>
                </button>
              </div>
            )}
          </div>

          {/* Details & Specs Column */}
          <div className="material-modal-content">
            <div>
              <div className="modal-header-meta">
                <span className="material-modal-category">{material.type}</span>
                <span className="material-modal-dot">·</span>
                <span className="modal-header-code">{material.code}</span>
              </div>

              <h3 className="material-modal-title">{material.name}</h3>
              <p className="material-modal-desc">{material.description}</p>
            </div>

            {/* Color Swatch Tone */}
            {(() => {
              const toneInfo = getToneDisplay(material.tone);
              return (
                <div className="material-modal-tone-row flex items-center gap-3 p-3 bg-[#f5f0e6] border border-[#e5decfa0] rounded-sm mb-4">
                  <div
                    className="tone-circle-indicator size-6 rounded-full shrink-0 shadow-xs"
                    style={{
                      backgroundColor: toneInfo.hex,
                      border: `1.5px solid ${toneInfo.border}`,
                    }}
                    aria-label={`Tông màu ${toneInfo.label}`}
                  />
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[#788075] block">Tông màu chủ đạo</span>
                    <span className="text-sm font-semibold text-[#1F2B33]">{toneInfo.label}</span>
                  </div>
                </div>
              );
            })()}

            {/* Architectural Specifications Table */}
            <div className="material-modal-specs-table">
              <h4 className="specs-table-title">THÔNG SỐ KỸ THUẬT &amp; ỨNG DỤNG</h4>
              <dl className="specs-grid">
                <div className="spec-row">
                  <dt>Khổ kích thước:</dt>
                  <dd className="font-semibold text-[#1F2B33]">{material.size}</dd>
                </div>
                <div className="spec-row">
                  <dt>Bề mặt hoàn thiện:</dt>
                  <dd>{material.finish || "Men mờ"}</dd>
                </div>
                <div className="spec-row">
                  <dt>Gam màu sắc thái:</dt>
                  <dd className="flex items-center gap-2 font-semibold text-[#1F2B33]">
                    {(() => {
                      const t = getToneDisplay(material.tone);
                      return (
                        <>
                          <span
                            className="size-3 rounded-full shrink-0 inline-block border border-black/15 shadow-2xs"
                            style={{ backgroundColor: t.hex }}
                          />
                          <span>{t.label}</span>
                        </>
                      );
                    })()}
                  </dd>
                </div>
                {material.bodyType && (
                  <div className="spec-row">
                    <dt>Chất liệu xương:</dt>
                    <dd>{material.bodyType}</dd>
                  </div>
                )}
                {material.thickness && (
                  <div className="spec-row">
                    <dt>Độ dày:</dt>
                    <dd>{material.thickness}</dd>
                  </div>
                )}
                {material.slipResistance && (
                  <div className="spec-row">
                    <dt>Hệ số chống trượt:</dt>
                    <dd>{material.slipResistance}</dd>
                  </div>
                )}
                <div className="spec-row spec-full">
                  <dt className="flex items-center gap-1.5 text-[#B94A2E] font-bold">
                    <Sparkles size={12} />
                    <span>Ứng dụng tối ưu cho công trình:</span>
                  </dt>
                  <dd className="text-[#1F2B33] font-medium leading-relaxed mt-1 bg-[#FAF6F0] p-2.5 rounded-sm border border-[#E8E0D2]">
                    {material.application || "Ốp lát mảng tường điểm nhấn, phòng tắm, vách sảnh, mặt tiền & không gian thương mại"}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Deliverables Assurance */}
            <div className="modal-assurance-box">
              <ShieldCheck size={16} className="text-[#657151] shrink-0" />
              <span className="text-xs text-[#697176]">
                Sẵn sàng gửi mẫu thực tế đến văn phòng &amp; cung cấp bộ ảnh Map vật liệu cho concept này.
              </span>
            </div>

            {/* Actions */}
            <div className="material-modal-actions">
              <button
                type="button"
                className={`modal-select-btn ${selected ? "is-selected" : ""}`}
                onClick={() => onToggle(material.id)}
              >
                {selected ? (
                  <>
                    <Check size={18} strokeWidth={2.5} />
                    <span>Đã lưu vào Moodboard</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} strokeWidth={2.2} />
                    <span>+ Lưu vào Moodboard</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="modal-brief-btn"
                onClick={() => {
                  if (!selected) onToggle(material.id);
                  onClose();
                  onGoToBrief();
                }}
              >
                <span>Hỏi mẫu mã này</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
