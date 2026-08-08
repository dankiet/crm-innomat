import { useEffect, useState } from "react";

/**
 * State đồng bộ với localStorage — "nhớ" lựa chọn của người dùng (filter, view mode…)
 * qua F5 / chuyển trang. Chạy an toàn ở SSR (TanStack Start): trong lần render đầu
 * trên server luôn dùng `initialValue`, chỉ đọc localStorage sau khi mount ở client
 * để tránh mismatch hydration.
 */
export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);

  // Đọc giá trị đã lưu ngay sau mount (chỉ chạy ở client).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        setState(JSON.parse(raw) as T);
      }
    } catch {
      // localStorage không khả dụng hoặc dữ liệu hỏng — bỏ qua, giữ initialValue.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(value: T | ((prev: T) => T)) {
    setState((prev) => {
      const next =
        typeof value === "function" ? (value as (p: T) => T)(prev) : value;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Bỏ qua lỗi ghi (vd. quota, chế độ riêng tư).
      }
      return next;
    });
  }

  return [state, update];
}
