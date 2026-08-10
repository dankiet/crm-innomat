/**
 * Chuẩn hoá SĐT VN để so trùng:
 * - bỏ khoảng trắng / dấu chấm / gạch
 * - 84xxxxxxxxx / +84… → 0xxxxxxxxx
 * - 9 số (911084668) → 0911084668 (thiếu số 0 đầu)
 */
function normalizePhone(raw: string): string {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "";

  // +84 / 84…
  if (d.startsWith("840") && d.length >= 12) {
    d = "0" + d.slice(3);
  } else if (d.startsWith("84") && d.length >= 11) {
    d = "0" + d.slice(2);
  }

  // Di động VN thường 10 số: 0 + 9 số (03/05/07/08/09…)
  // Sales hay gõ thiếu 0: 911084668 → 0911084668
  if (d.length === 9 && /^[35789]/.test(d)) {
    d = "0" + d;
  }

  // 00xxxxxxxxx (double zero typo) → 0xxxxxxxxx
  if (d.startsWith("00") && d.length === 11) {
    d = d.slice(1);
  }

  return d;
}

/** 9 số cuối (bỏ 0 đầu) — dùng so khớp phụ. */
function phoneCore(raw: string): string {
  const n = normalizePhone(raw);
  if (!n) return "";
  return n.replace(/^0+/, "").slice(-9);
}

/** SĐT đủ dài để coi là có thể so trùng. */
export function isPhoneMatchable(raw: string): boolean {
  const n = normalizePhone(raw);
  return n.length >= 9;
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb || na.length < 9 || nb.length < 9) return false;
  if (na === nb) return true;
  // Fallback: cùng 9 số thuê bao (0911… vs 911… đã normalize; case lạ còn sót)
  const ca = phoneCore(a);
  const cb = phoneCore(b);
  return ca.length >= 9 && ca === cb;
}
