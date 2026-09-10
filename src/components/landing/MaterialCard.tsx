import { Check, Plus, Eye } from "lucide-react";
import type { Material } from "@/data/mockData";

type MaterialCardProps = {
  material: Material;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpenModal?: (material: Material) => void;
};

export function MaterialCard({ material, selected, onToggle, onOpenModal }: MaterialCardProps) {
  return (
    <article className={`material-card group ${selected ? "is-selected" : ""}`}>
      <div className={`material-image ${material.imageClass ?? ""}`}>
        <img
          src={material.image}
          alt={`${material.name}, ${material.finish}`}
          loading="lazy"
          onClick={() => onOpenModal?.(material)}
          className="cursor-pointer"
        />
        <div className="material-image-shade" />
        <span className="material-code">EBG / {material.code}</span>

        {/* Quick View Button on Hover */}
        {onOpenModal && (
          <button
            type="button"
            className="material-card-quick-view"
            onClick={() => onOpenModal(material)}
            title="Xem chi tiết & ảnh không gian"
            aria-label={`Xem chi tiết ${material.name}`}
          >
            <Eye size={15} />
            <span>Chi tiết</span>
          </button>
        )}

        <button
          type="button"
          className="material-select"
          onClick={() => onToggle(material.id)}
          aria-pressed={selected}
          aria-label={
            selected ? `Bỏ ${material.name} khỏi shortlist` : `Thêm ${material.name} vào shortlist`
          }
        >
          {selected ? <Check size={17} strokeWidth={2.4} /> : <Plus size={18} strokeWidth={2.2} />}
          <span>{selected ? "Đã chọn" : "Chọn mẫu"}</span>
        </button>
      </div>

      <div className="material-info">
        <div
          onClick={() => onOpenModal?.(material)}
          className={onOpenModal ? "cursor-pointer group-hover:text-[#B94A2E] transition-colors" : ""}
        >
          <p className="material-type">{material.type}</p>
          <h3>{material.name}</h3>
        </div>
        <span
          className="material-swatch"
          aria-label={`Tông ${material.tone}`}
          style={{ backgroundColor: material.tone }}
          title={`Tông màu: ${material.tone}`}
        />
      </div>

      <dl className="material-spec">
        <div>
          <dt>Khổ</dt>
          <dd>{material.size}</dd>
        </div>
        <div>
          <dt>Bề mặt</dt>
          <dd>{material.finish}</dd>
        </div>
      </dl>
    </article>
  );
}
