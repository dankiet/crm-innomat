/**
 * Shortlist LP — state + persistence trong browser.
 *
 * Plan triển khai §7 (P0): "Lưu shortlist trong browser — refresh không mất
 * danh sách trong cùng browser". Không có tài khoản khách trong MVP nên
 * localStorage là đủ; spec §4.5 nói rõ KHÔNG giả định sync đa thiết bị.
 *
 * Key tách theo slug: mỗi biến thể ads là một ngữ cảnh chọn mã riêng.
 */
import { useCallback, useEffect, useState } from "react";

const PREFIX = "lp-shortlist:";

/** Đọc shortlist đã lưu. SSR / storage bị chặn → mảng rỗng. */
function read(slug: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + slug);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export function useLpShortlist(slug: string) {
  // Bắt đầu rỗng để HTML server và client khớp nhau; hydrate ở effect.
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    setCodes(read(slug));
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PREFIX + slug, JSON.stringify(codes));
    } catch {
      // Safari private mode / storage full — shortlist vẫn chạy trong session.
    }
  }, [slug, codes]);

  const toggle = useCallback((code: string) => {
    setCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);

  const clear = useCallback(() => setCodes([]), []);

  return { codes, toggle, clear };
}
