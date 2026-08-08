/**
 * Parse quy cách đóng gói từ tên HHDV / tên hàng file tồn kho.
 *
 * Ví dụ:
 *  "(25 viên/m2)"           → pcs=25, m2=1
 *  "(50 viên/1.125㎡)"      → pcs=50, m2=1.125
 *  "(8 viên/ 1.44m2)"       → pcs=8, m2=1.44
 *  "(17 vĩ/1.215㎡)"        → pcs=17, m2=1.215 (vỉ mosaic)
 */

export type PackingInfo = {
  packing_pcs: number | null;
  packing_m2: number | null;
  /** viên | vỉ */
  unit: "viên" | "vỉ" | "";
  /** Chuỗi hiển thị: "25 viên / 1 m²" */
  label: string;
};

export type PackingByCode = PackingInfo & {
  code: string;
  raw_name?: string;
};

function toNum(s: string): number | null {
  const n = parseFloat(String(s).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Trích packing từ 1 chuỗi tên (HHDV hoặc «Tên hàng» file tồn).
 */
export function parsePackingFromHhdvName(ten: string): PackingInfo {
  const t = String(ten || "");
  let packing_pcs: number | null = null;
  let packing_m2: number | null = null;
  let unit: "viên" | "vỉ" | "" = "";

  // m² unit: m2 | m² | ㎡
  const M2 = String.raw`(?:m\s*[2²]|㎡|m²)`;
  // đơn vị đóng gói: viên | vĩ | vỉ
  const UNIT = String.raw`(?:viên|vĩ|vỉ)`;

  const m1 = t.match(
    new RegExp(
      String.raw`(\d+(?:[.,]\d+)?)\s*(${UNIT})\s*/\s*(\d+(?:[.,]\d+)?)\s*${M2}`,
      "i",
    ),
  );
  if (m1) {
    packing_pcs = toNum(m1[1]);
    unit = /viên/i.test(m1[2]) ? "viên" : "vỉ";
    packing_m2 = toNum(m1[3]);
  } else {
    const m2 = t.match(
      new RegExp(
        String.raw`(\d+(?:[.,]\d+)?)\s*(${UNIT})\s*/\s*${M2}`,
        "i",
      ),
    );
    if (m2) {
      packing_pcs = toNum(m2[1]);
      unit = /viên/i.test(m2[2]) ? "viên" : "vỉ";
      packing_m2 = 1;
    }
  }

  return {
    packing_pcs,
    packing_m2,
    unit,
    label: formatPackingLabel(packing_pcs, packing_m2, unit),
  };
}

export function formatPackingLabel(
  pcs: number | null | undefined,
  m2: number | null | undefined,
  unit: "viên" | "vỉ" | "" = "viên",
): string {
  const u = unit || "viên";
  if (pcs != null && m2 != null) {
    const m2s =
      m2 === 1
        ? "1"
        : Number(m2).toLocaleString("vi-VN", { maximumFractionDigits: 4 });
    return `${pcs} ${u} / ${m2s} m²`;
  }
  if (pcs != null) return `${pcs} ${u}`;
  if (m2 != null) {
    const m2s = Number(m2).toLocaleString("vi-VN", {
      maximumFractionDigits: 4,
    });
    return `${m2s} m²`;
  }
  return "";
}

function packKey(p: PackingInfo): string {
  return `${p.packing_pcs ?? ""}|${p.packing_m2 ?? ""}|${p.unit || ""}`;
}

/**
 * Gộp packing từ nhiều mã (multi).
 * rows nên đã sort: non-HN / tồn cao trước.
 */
export function mergePackingVariants(rows: PackingByCode[]): {
  primary: PackingInfo;
  variants: PackingByCode[];
  hasConflict: boolean;
  packingText: string;
} {
  const withData = rows.filter(
    (r) => r.packing_pcs != null || r.packing_m2 != null,
  );
  if (!withData.length) {
    return {
      primary: { packing_pcs: null, packing_m2: null, unit: "", label: "" },
      variants: [],
      hasConflict: false,
      packingText: "",
    };
  }

  const primary = withData[0];
  const keys = new Set(withData.map(packKey));
  const hasConflict = keys.size > 1;

  let packingText = primary.label;
  if (hasConflict) {
    packingText =
      primary.label +
      " · multi: " +
      withData.map((r) => `${r.code}: ${r.label}`).join(" | ");
  }

  return {
    primary: {
      packing_pcs: primary.packing_pcs,
      packing_m2: primary.packing_m2,
      unit: primary.unit,
      label: primary.label,
    },
    variants: withData,
    hasConflict,
    packingText,
  };
}
