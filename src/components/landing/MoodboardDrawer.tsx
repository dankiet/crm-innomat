import { useState, useEffect } from "react";
import {
  X,
  Trash2,
  ArrowRight,
  Download,
  BookOpen,
  Sparkles,
  Check,
  Copy,
  FileText,
} from "lucide-react";
import type { Material } from "@/data/mockData";

type MoodboardDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  shortlistedMaterials: Material[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onGoToBrief: () => void;
  onSelectMaterial: (material: Material) => void;
};

export function MoodboardDrawer({
  isOpen,
  onClose,
  shortlistedMaterials,
  onRemove,
  onClearAll,
  onGoToBrief,
  onSelectMaterial,
}: MoodboardDrawerProps) {
  const [copied, setCopied] = useState(false);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const count = shortlistedMaterials.length;

  const handleCopySpecList = async () => {
    if (count === 0) return;
    const lines = [
      "📋 [DANH SÁCH MÃ VẬT LIỆU SHORTLIST — EM BÁN GẠCH]",
      ...shortlistedMaterials.map(
        (m, i) =>
          `${i + 1}. [${m.code}] ${m.name} — ${m.type} (Khổ: ${m.size} | Bề mặt: ${m.finish})`
      ),
      "\nLiên hệ nhận mẫu thực tế & File ảnh Map: Hotline / Zalo 0909 xxx xxx",
    ];
    const text = lines.join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="moodboard-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="moodboard-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="moodboard-header">
          <div className="flex items-center gap-3">
            <div className="moodboard-icon-box">
              <BookOpen size={18} className="text-[#B94A2E]" />
            </div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.16em] text-[#B94A2E] uppercase m-0">
                BẢNG PHỐI VẬT LIỆU
              </p>
              <h3 className="moodboard-title">Moodboard Shortlist ({count})</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {count > 0 && (
              <button
                type="button"
                className="moodboard-clear-btn"
                onClick={onClearAll}
                title="Xóa toàn bộ shortlist"
              >
                <Trash2 size={15} />
                <span>Xóa hết</span>
              </button>
            )}
            <button
              type="button"
              className="moodboard-close-btn"
              onClick={onClose}
              aria-label="Đóng bảng moodboard (Esc)"
              title="Đóng (Esc)"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Color Palette Harmony Strip */}
        {count > 0 && (
          <div className="moodboard-palette-strip">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-[#788075] uppercase tracking-wider block">
                DẢI MÀU CONCEPT CỦA BẠN:
              </span>
              <button
                type="button"
                onClick={handleCopySpecList}
                className="moodboard-copy-btn"
                title="Sao chép danh sách mã để dán vào CAD/Revit/Zalo"
              >
                {copied ? (
                  <>
                    <Check size={12} className="text-[#2e6b4e]" />
                    <span className="text-[#2e6b4e] font-bold">Đã sao chép!</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Sao chép mã</span>
                  </>
                )}
              </button>
            </div>
            <div className="palette-bars">
              {shortlistedMaterials.map((mat) => (
                <div
                  key={mat.id}
                  className="palette-bar-item group"
                  style={{ backgroundColor: mat.tone }}
                  title={`${mat.name} (${mat.code})`}
                  onClick={() => onSelectMaterial(mat)}
                >
                  <span className="palette-tooltip">{mat.code}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drawer Body */}
        <div className="moodboard-body">
          {count === 0 ? (
            <div className="moodboard-empty">
              <Sparkles size={36} className="text-[#B9B4A9] mb-3" />
              <h4>Chưa có mã nào trong Shortlist</h4>
              <p>
                Hãy lướt danh mục <b>Vật liệu tuyển chọn</b> hoặc <b>Thư viện mã gạch</b> và bấm <b>"+ Lưu vào Moodboard"</b> để gom bảng vật liệu cho công trình.
              </p>
            </div>
          ) : (
            <div className="moodboard-grid">
              {shortlistedMaterials.map((material) => (
                <div key={material.id} className="moodboard-item-card">
                  <div
                    className="moodboard-item-img-box"
                    onClick={() => {
                      onSelectMaterial(material);
                    }}
                    title="Bấm để xem chi tiết mẫu gạch"
                  >
                    <img src={material.image} alt={material.name} />
                    <span className="moodboard-item-code">EBG / {material.code}</span>
                  </div>

                  <div className="moodboard-item-details">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <span className="text-[10px] text-[#788075] uppercase font-bold">
                          {material.type}
                        </span>
                        <h5
                          className="moodboard-item-name"
                          onClick={() => {
                            onSelectMaterial(material);
                          }}
                        >
                          {material.name}
                        </h5>
                      </div>
                      <button
                        type="button"
                        className="moodboard-item-remove"
                        onClick={() => onRemove(material.id)}
                        aria-label={`Bỏ mã ${material.code}`}
                        title="Bỏ khỏi shortlist"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="moodboard-item-specs">
                      <span>{material.size}</span>
                      <span>•</span>
                      <span>{material.finish}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        {count > 0 && (
          <div className="moodboard-footer">
            <div className="moodboard-summary-row">
              <span className="text-xs text-[#697176]">
                Đã chọn <b>{count} mã</b> vật liệu
              </span>
              <button
                type="button"
                onClick={handleCopySpecList}
                className="text-xs text-[#b94a2e] font-semibold hover:underline inline-flex items-center gap-1"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? "Đã copy spec" : "Copy spec sheet"}</span>
              </button>
            </div>

            <div className="moodboard-footer-actions">
              <button
                type="button"
                className="moodboard-brief-cta"
                onClick={() => {
                  onClose();
                  onGoToBrief();
                }}
              >
                <span>Gửi Brief kèm {count} mã này</span>
                <ArrowRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
