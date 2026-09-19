import { useEffect, useState, useCallback } from "react";

const SHORTLIST_STORAGE_KEY = "ebg_architect_shortlist_ids_v1";

/**
 * Hook lưu trữ Shortlist vật liệu an toàn cho SSR (TanStack Start / Vite).
 * - Khởi tạo state ban đầu là mảng rỗng [] trên server để chống mismatch hydration.
 * - Chỉ đọc và đồng bộ hóa với localStorage bên trong useEffect (client-mount).
 * - Cung cấp hàm toggle và clear.
 */
export function useShortlistStorage(initialIds: string[] = []): {
  shortlistIds: string[];
  toggleMaterial: (id: string) => void;
  clearShortlist: () => void;
} {
  const [shortlistIds, setShortlistIdsState] = useState<string[]>(initialIds);

  // 1. Client-mount: Đọc dữ liệu từ localStorage
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setShortlistIdsState(parsed);
        }
      }
    } catch {
      // localStorage không khả dụng hoặc lỗi parse JSON — giữ giá trị khởi tạo
    }
  }, []);

  // 2. Helper ghi vào localStorage an toàn
  const persistToStorage = useCallback((ids: string[]) => {
    try {
      window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Bỏ qua lỗi ghi storage (hết quota, chế độ ẩn danh...)
    }
  }, []);

  // 3. Toggle 1 mã gạch
  const toggleMaterial = useCallback(
    (id: string) => {
      setShortlistIdsState((current) => {
        const exists = current.includes(id);
        const next = exists ? current.filter((item) => item !== id) : [...current, id];
        persistToStorage(next);
        return next;
      });
    },
    [persistToStorage]
  );

  // 4. Xóa sạch danh sách
  const clearShortlist = useCallback(() => {
    setShortlistIdsState([]);
    persistToStorage([]);
  }, [persistToStorage]);

  return {
    shortlistIds,
    toggleMaterial,
    clearShortlist,
  };
}
