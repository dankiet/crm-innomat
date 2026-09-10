/**
 * Material card cho LP — theo "Design specification — Em bán gạch" §4.4.
 *
 * Anatomy bắt buộc (đúng thứ tự spec):
 *   1. Ảnh surface, aspect-ratio ~1.17, object-fit cover
 *   2. Gradient overlay để mã `EBG / code` đọc được
 *   3. Action `Chọn mẫu` / `Đã chọn` ở bottom-right ảnh, có aria-pressed
 *   4. Information block: category uppercase, tên serif, swatch màu
 *   5. Spec row: Khổ và Bề mặt
 *
 * Spec §4.4: "Nếu Product không có `map` image, không render card" — route
 * đã lọc ở loader (chỉ product có ảnh), nên ở đây không cần guard lại.
 */
import { Check, Plus } from "lucide-react";
import { toneForColor } from "@/lib/lp-content";
import type { LpMaterial } from "@/lib/lp-types";

type Props = {
  material: LpMaterial;
  selected: boolean;
  onToggle: (code: string) => void;
};

export function LpMaterialCard({ material: m, selected, onToggle }: Props) {
  const finish = m.surface || m.shape || "—";

  return (
    <article className={`lp-material${selected ? " is-selected" : ""}`}>
      <div className="lp-material-img">
        <img src={m.image} alt={`${m.name}${finish !== "—" ? `, ${finish}` : ""}`} loading="lazy" />
        <div className="lp-material-shade" />
        <span className="lp-material-code">EBG / {m.code}</span>
        <button
          type="button"
          className="lp-material-select"
          onClick={() => onToggle(m.code)}
          aria-pressed={selected}
          aria-label={selected ? `Bỏ ${m.name} khỏi shortlist` : `Thêm ${m.name} vào shortlist`}
        >
          {selected ? <Check size={16} strokeWidth={2.4} /> : <Plus size={17} strokeWidth={2.2} />}
          <span>{selected ? "Đã chọn" : "Chọn mẫu"}</span>
        </button>
      </div>

      <div className="lp-material-info">
        <div>
          {m.category ? <p className="lp-material-type">{m.category}</p> : null}
          <h3>{m.name}</h3>
        </div>
        {m.color ? (
          <span
            className="lp-material-swatch"
            aria-label={`Tông ${m.color}`}
            style={{ backgroundColor: toneForColor(m.color) }}
          />
        ) : null}
      </div>

      <dl className="lp-material-spec">
        <div>
          <dt>Khổ</dt>
          <dd>{m.size || "—"}</dd>
        </div>
        <div>
          <dt>Bề mặt</dt>
          <dd>{finish}</dd>
        </div>
      </dl>
    </article>
  );
}
