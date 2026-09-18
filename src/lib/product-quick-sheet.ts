/**
 * Sheet in nhanh sản phẩm đang soạn (đề xuất vật liệu / báo giá).
 *
 * Khác với xuất PDF đầy đủ (server render, có trang bìa/ảnh khu vực/chữ ký),
 * sheet này sinh ngay trên client từ dữ liệu draft trong dialog — không cần
 * lưu, không gọi server. Mục đích: cầm theo giấy/PDF khi đi soạn mẫu, đối chiếu
 * nhanh mã, tên, quy cách, tồn và giá của đúng những dòng đang soạn.
 *
 * Cột tự ẩn khi cả sheet không có dữ liệu cho cột đó (VD đề xuất vật liệu
 * không có số lượng nên không hiện cột SL / thành tiền).
 *
 * Hành vi: mở tab mới A4 NGANG, tự bật hộp thoại in (để "lưu thành PDF" nhanh),
 * kèm nút in cố định phòng trường hợp trình duyệt chặn print tự động.
 */

import { formatVND } from "@/lib/format";

export type ProductQuickSheetRow = {
  code: string;
  name: string;
  /** URL ảnh sản phẩm (dùng trực tiếp như `<img src>`) */
  image?: string;
  /** Khu vực thi công (đề xuất vật liệu / dòng báo giá) */
  area?: string;
  /** Quy cách, VD "300x600" */
  size?: string;
  /** Chất liệu / bề mặt */
  material?: string;
  color?: string;
  /** Mã nội bộ (in nhỏ dưới mã catalog) */
  internalCodes?: string;
  /** Tồn kho (tổng các kho) */
  stock?: number | null;
  /** Số lượng m² trên chứng từ */
  quantity?: number | null;
  /** Đơn giá bán đ/m² */
  price?: number | null;
  /** Thành tiền = số lượng × đơn giá */
  amount?: number | null;
};

type ProductQuickSheetOptions = {
  /** Tiêu đề trang, VD "ĐỀ XUẤT VẬT LIỆU · MÃ & TÊN SẢN PHẨM" */
  title: string;
  /** Dòng phụ, VD mã chứng từ. */
  subtitle?: string;
  rows: ProductQuickSheetRow[];
  /** Ghi chú in dưới bảng (đơn vị giá, phạm vi tồn kho…). */
  notes?: string[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Số lượng: tối đa 2 chữ số thập phân, dấu kiểu VN. */
function formatQty(value: number): string {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function hasValue<T>(rows: ProductQuickSheetRow[], pick: (row: ProductQuickSheetRow) => T | null | undefined): boolean {
  return rows.some((row) => {
    const value = pick(row);
    return value != null && value !== "";
  });
}

export function openProductQuickSheet(options: ProductQuickSheetOptions): boolean {
  const rows = options.rows.filter((row) => row.code.trim() || row.name.trim());

  const show = {
    image: hasValue(rows, (r) => r.image),
    area: hasValue(rows, (r) => r.area),
    size: hasValue(rows, (r) => r.size),
    material: hasValue(rows, (r) => r.material),
    color: hasValue(rows, (r) => r.color),
    stock: hasValue(rows, (r) => r.stock),
    quantity: hasValue(rows, (r) => r.quantity),
    price: hasValue(rows, (r) => r.price),
    amount: hasValue(rows, (r) => r.amount),
  };

  const headCells = [
    '<th class="check">CHỌN</th>',
    '<th class="stt">STT</th>',
    show.image ? '<th class="photo">ẢNH</th>' : "",
    '<th class="code">MÃ</th>',
    "<th>TÊN</th>",
    show.area ? "<th>KHU VỰC</th>" : "",
    show.size ? "<th>KÍCH THƯỚC</th>" : "",
    show.material ? "<th>CHẤT LIỆU / BỀ MẶT</th>" : "",
    show.color ? "<th>MÀU</th>" : "",
    show.stock ? '<th class="num">TỒN KHO</th>' : "",
    show.quantity ? '<th class="num">SL (M²)</th>' : "",
    show.price ? '<th class="num">ĐƠN GIÁ (Đ/M²)</th>' : "",
    show.amount ? '<th class="num">THÀNH TIỀN</th>' : "",
  ]
    .filter(Boolean)
    .join("");

  const bodyHtml = rows.length
    ? rows
        .map((row, index) => {
          const cells = [
            '<td class="check"><span class="box"></span></td>',
            `<td class="stt">${index + 1}</td>`,
            show.image
              ? `<td class="photo">${row.image ? `<img src="${escapeHtml(row.image)}" alt="" onerror="this.remove()" />` : ""}</td>`
              : "",
            `<td class="code">${escapeHtml(row.code)}${row.internalCodes ? `<span class="sub">${escapeHtml(row.internalCodes)}</span>` : ""}</td>`,
            `<td>${escapeHtml(row.name)}</td>`,
            show.area ? `<td>${escapeHtml(row.area || "")}</td>` : "",
            show.size ? `<td>${escapeHtml(row.size || "")}</td>` : "",
            show.material ? `<td>${escapeHtml(row.material || "")}</td>` : "",
            show.color ? `<td>${escapeHtml(row.color || "")}</td>` : "",
            show.stock ? `<td class="num">${row.stock == null ? "—" : formatQty(row.stock)}</td>` : "",
            show.quantity
              ? `<td class="num">${row.quantity == null ? "—" : formatQty(row.quantity)}</td>`
              : "",
            show.price ? `<td class="num">${row.price == null ? "—" : formatVND(row.price)}</td>` : "",
            show.amount
              ? `<td class="num strong">${row.amount == null ? "—" : formatVND(row.amount)}</td>`
              : "",
          ]
            .filter(Boolean)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td colspan="13">Chưa có sản phẩm.</td></tr>`;

  const notesHtml = (options.notes ?? [])
    .filter(Boolean)
    .map((note) => `<p>${escapeHtml(note)}</p>`)
    .join("");

  const dateText = new Date().toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(options.title)}</title><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Segoe UI",Arial,sans-serif;color:#17202a;background:#dfe4e8}
  .sheet{position:relative;width:1123px;min-height:794px;margin:20px auto;padding:30px 34px;background:#fff;box-shadow:0 4px 24px #0002}
  .btn-print{position:fixed;right:24px;bottom:24px;z-index:10;padding:12px 22px;border:0;border-radius:8px;color:#fff;background:#1e4b86;box-shadow:0 4px 12px #0003;font:600 13px inherit;cursor:pointer}
  .head{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid #1e4b86}
  .head h1{color:#1e4b86;font-size:16px;letter-spacing:.05em}
  .head p{margin-top:5px;color:#64717b;font-size:11px}
  .head .meta{color:#8a949c;font-size:10px;text-align:right;white-space:nowrap}
  table{width:100%;margin-top:14px;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #d5dde3;padding:5px 8px;text-align:left;vertical-align:middle}
  th{background:#f3f6f8;color:#53616c;font-size:8px;font-weight:700;letter-spacing:.08em;white-space:nowrap}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  td.check,th.check{width:34px;text-align:center}
  .box{display:inline-block;width:12px;height:12px;border:1px solid #8a949c;border-radius:2px}
  td.stt,th.stt{width:30px;text-align:center;color:#8a949c}
  td.photo,th.photo{width:58px;text-align:center}
  td.photo img{width:48px;height:48px;object-fit:contain;background:#f3f1ed;border-radius:3px}
  td.code{font-weight:600;white-space:nowrap}
  td.code .sub{display:block;margin-top:2px;color:#8a949c;font-size:9px;font-weight:400;white-space:normal}
  td.num,th.num{text-align:right;white-space:nowrap}
  td.num.strong{font-weight:700}
  .notes{margin-top:14px;color:#64717b;font-size:10px}
  .notes p{position:relative;margin-top:4px;padding-left:12px}
  .notes p:before{position:absolute;left:0;content:"–"}
  @page{size:A4 landscape;margin:9mm}
  @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff}.btn-print{display:none!important}.sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}}
  </style></head><body><button class="btn-print" onclick="window.print()">In / Lưu PDF</button>
  <div class="sheet">
    <div class="head">
      <div><h1>${escapeHtml(options.title)}</h1>${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}</div>
      <div class="meta">${rows.length} sản phẩm · ${dateText}</div>
    </div>
    <table>
      <thead><tr>${headCells}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
    ${notesHtml ? `<div class="notes">${notesHtml}</div>` : ""}
  </div>
  <script>window.addEventListener("load", function(){setTimeout(function(){window.print();},250);});</script>
  </body></html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html; charset=utf-8" }));
  const opened = Boolean(window.open(url, "_blank"));
  if (opened) window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return opened;
}