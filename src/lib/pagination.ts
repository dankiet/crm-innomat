/** Tiện ích phân trang dùng chung cho các trang có danh sách dài. */

/**
 * Sinh dãy số trang hiển thị quanh trang hiện tại, có dấu `"..."` ở chỗ rút gọn.
 * Luôn giữ trang đầu và trang cuối.
 */
export function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (currentPage > 3) {
    pages.push("...");
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) {
    pages.push("...");
  }
  pages.push(totalPages);
  return pages;
}
