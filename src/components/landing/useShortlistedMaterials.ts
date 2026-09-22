/**
 * Shared resolver shortlist: resolve material objects từ canonical ID set
 * (KHÔNG phụ thuộc vào 12 material curated của Home / limit bất kỳ).
 *
 * Flow:
 *   shortlistIds (localStorage, canonical string product-ids)
 *     → normalizeShortlistIds (numeric để query + invalid để báo missing)
 *     → fetchLpMaterialsByIdsFn (server query đúng các ID, không tăng limit)
 *     → map sang Material UI (cùng mapper dùng ở Home/Library)
 *
 * Missing/deleted IDs: KHÔNG crash, KHÔNG tự xoá khỏi storage, không tạo
 * object giả — chỉ không nằm trong `materials`, xuất hiện trong `missingIds`.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchLpMaterialsByIdsFn } from "@/api/lp";
import type { LpMaterial } from "@/lib/lp-types";
import type { Material } from "@/data/mockData";
import { normalizeShortlistIds } from "@/lib/shortlist";

/** Map LpMaterial (server) → Material (UI) — chuẩn chung cho toàn bộ landing. */
export function mapLpMaterialToUi(p: LpMaterial): Material {
  return {
    id: String(p.id),
    code: p.code,
    name: p.name,
    type: (p.category as Material["type"]) || "Gạch thẻ",
    size: p.size || "",
    finish: p.surface || "Men mờ",
    tone: p.color || "#B94A2E",
    image: p.image || "",
    description: `${p.name} (${p.size || ""})`,
    application: "Tường trang trí, sảnh, phòng tắm, villa",
  };
}

export function useShortlistedMaterials(shortlistIds: string[]): {
  materials: Material[];
  missingIds: string[];
  loading: boolean;
} {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = shortlistIds.join("|");
  const { numeric, invalid } = useMemo(
    () => normalizeShortlistIds(Array.isArray(shortlistIds) ? shortlistIds : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );

  useEffect(() => {
    if (numeric.length === 0) {
      setMaterials([]);
      setMissingIds(invalid);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchLpMaterialsByIdsFn({ data: { ids: numeric } })
      .then((res) => {
        if (cancelled) return;
        const found = res ?? [];
        const foundIds = new Set(found.map((m) => String(m.id)));
        setMaterials(found.map(mapLpMaterialToUi));
        // numeric đã query nhưng server không trả → material đã xoá/ẩn.
        setMissingIds([
          ...invalid,
          ...numeric.filter((id) => !foundIds.has(String(id))).map((id) => String(id)),
        ]);
      })
      .catch(() => {
        if (cancelled) return;
        setMaterials([]);
        setMissingIds([...invalid, ...numeric.map((id) => String(id))]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, numeric.join(",")]);

  return { materials, missingIds, loading };
}
