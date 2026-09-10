import { useEffect, useState, useCallback } from "react";

const SHORTLIST_STORAGE_KEY = "ebg_architect_shortlist_ids_v1";

/**
 * Hook lưu trữ Shortlist vật liệu an toàn tuyệt đối cho SSR (TanStack Start / Next.js / Vite).
 * - Khởi tạo state ban đầu là mảng rỗng [] trên server để chống mismatch hydration.
 * - Chỉ đọc và đồng bộ hóa với localStorage bên trong useEffect (client-mount).
 * - Cung cấp đầy đủ hàm toggle, add nhiều mã, set toàn bộ và clear.
 */
export function useShortlistStorage(initialIds: string[] = []): {
  shortlistIds: string[];
  toggleMaterial: (id: string) => void;
  addMaterials: (ids: string[]) => void;
  setShortlistIds: (ids: string[]) => void;
  clearShortlist: () => void;
  isHydrated: boolean;
} {
  const [shortlistIds, setShortlistIdsState] = useState<string[]>(initialIds);
  const [isHydrated, setIsHydrated] = useState(false);

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
    } finally {
      setIsHydrated(true);
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

  // 4. Thêm danh sách mã gạch (gộp không trùng lặp)
  const addMaterials = useCallback(
    (ids: string[]) => {
      setShortlistIdsState((current) => {
        const next = Array.from(new Set([...current, ...ids]));
        persistToStorage(next);
        return next;
      });
    },
    [persistToStorage]
  );

  // 5. Cập nhật đè toàn bộ danh sách
  const setShortlistIds = useCallback(
    (ids: string[]) => {
      setShortlistIdsState(ids);
      persistToStorage(ids);
    },
    [persistToStorage]
  );

  // 6. Xóa sạch danh sách
  const clearShortlist = useCallback(() => {
    setShortlistIdsState([]);
    persistToStorage([]);
  }, [persistToStorage]);

  return {
    shortlistIds,
    toggleMaterial,
    addMaterials,
    setShortlistIds,
    clearShortlist,
    isHydrated,
  };
}
