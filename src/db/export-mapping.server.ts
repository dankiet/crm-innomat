import fs from "node:fs";
import path from "node:path";
import { getDb } from "./index.server";
import { readImageBytes } from "@/lib/storage";

export type MappingExportResult = {
  filename: string;
  base64: string;
  mimeType: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value: number | null | undefined): string {
  const amount = Number(value) || 0;
  return amount > 0
    ? `${Math.round(amount).toLocaleString("vi-VN")} đ/m²`
    : "Liên hệ";
}

async function imageDataUrl(publicPath: string): Promise<string> {
  if (!publicPath) return "";
  const buf = await readImageBytes(publicPath);
  if (!buf) return "";
  const mime = publicPath.match(/\.png$/i)
    ? "image/png"
    : publicPath.match(/\.webp$/i)
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function staticImage(filename: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), "public", filename),
    path.join(process.cwd(), ".output", "public", filename),
  ];
  for (const fullPath of candidates) {
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        return `data:image/png;base64,${fs.readFileSync(fullPath).toString("base64")}`;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

export async function getMappingCustomerId(mappingId: number): Promise<number | null> {
  const row = await getDb()
    .prepare("SELECT customer_id FROM customer_mappings WHERE id = ?")
    .get<{ customer_id: number }>(mappingId);
  return row?.customer_id ?? null;
}

export async function exportMappingToHtml(mappingId: number): Promise<MappingExportResult> {
  const db = getDb();
  const mapping = (await db.prepare(
      `SELECT m.*, c.name AS customer_name, c.company AS customer_company,
              u.display_name AS owner_name, u.phone AS owner_phone
       FROM customer_mappings m
       JOIN customers c ON c.id = m.customer_id
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE m.id = ?`,
    )
    .get(mappingId)) as
    | {
        id: number;
        code: string;
        name: string;
        version: string;
        note: string;
        updated_at: string;
        customer_name: string;
        customer_company: string;
        owner_name: string;
        owner_phone: string;
      }
    | undefined;
  if (!mapping) throw new Error("Không tìm thấy đề xuất vật liệu");

  const items = (await db.prepare(
      `SELECT mi.*, p.code AS product_code, p.name AS product_name,
              p.size AS product_size, p.material AS product_material,
              p.surface AS product_surface, p.retail_price AS product_retail_price,
              COALESCE(
                (SELECT path FROM product_images pi WHERE pi.product_id = mi.product_id
                 ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1),
                p.image_path, ''
              ) AS product_image_path
       FROM customer_mapping_items mi
       LEFT JOIN products p ON p.id = mi.product_id
       WHERE mi.mapping_id = ?
       ORDER BY mi.sort_order, mi.id`,
    )
    .all(mappingId)) as Array<{
    id: number;
    area_group_key: string;
    description: string;
    size: string;
    product_id: number | null;
    image_path: string;
    product_code: string | null;
    product_name: string | null;
    product_size: string | null;
    product_material: string | null;
    product_surface: string | null;
    product_retail_price: number | null;
    product_image_path: string;
    custom_product_code: string;
    custom_product_name: string;
    custom_product_size: string;
    custom_product_surface: string;
    custom_product_retail_price: number;
    custom_product_image_path: string;
  }>;

  const groups = Array.from(
    items.reduce((map, item) => {
      const groupKey = item.area_group_key || `area-${item.id}`;
      const group = map.get(groupKey);
      if (group) group.push(item);
      else map.set(groupKey, [item]);
      return map;
    }, new Map<string, typeof items>()),
  ).map(([, groupItems]) => groupItems);

  const OPTIONS_PER_PAGE = 4;
  const materialPages: string[] = [];
  let totalOptions = 0;
  for (const [areaIndex, group] of groups.entries()) {
    const area = group[0];
    const areaImagePath = group.find((item) => item.image_path)?.image_path || "";
    const areaImage = await imageDataUrl(areaImagePath);
    const areaName = area.description
      ? `Khu vực ${areaIndex + 1}: ${area.description}`
      : `Khu vực ${areaIndex + 1}`;
    const optionItems = group.filter(
      (item) => item.product_id || item.custom_product_name.trim() || item.size.trim(),
    );
    totalOptions += optionItems.length;
    const chunks = optionItems.length
      ? Array.from({ length: Math.ceil(optionItems.length / OPTIONS_PER_PAGE) }, (_, index) =>
          optionItems.slice(
            index * OPTIONS_PER_PAGE,
            index * OPTIONS_PER_PAGE + OPTIONS_PER_PAGE,
          ),
        )
      : [[]];

    for (const [chunkIndex, chunk] of chunks.entries()) {
      const firstOption = chunkIndex * OPTIONS_PER_PAGE + 1;
      const lastOption = firstOption + chunk.length - 1;
      let optionsHtml: string;
      if (chunk.length) {
        const parts: string[] = [];
        for (const [index, item] of chunk.entries()) {
          const optionIndex = chunkIndex * OPTIONS_PER_PAGE + index;
          const custom = !item.product_id && Boolean(item.custom_product_name.trim());
          const name = custom
            ? item.custom_product_name
            : item.product_name || "Chưa chọn vật liệu";
          const size = custom ? item.custom_product_size : item.product_size;
          const material = custom
            ? item.custom_product_surface
            : [item.product_material, item.product_surface].filter(Boolean).join(" · ");
          const price = custom
            ? item.custom_product_retail_price
            : item.product_retail_price;
          const productImage = await imageDataUrl(
            custom ? item.custom_product_image_path : item.product_image_path,
          );
          parts.push(`<article class="option-card">
                <div class="option-head"><span class="option-number">PHƯƠNG ÁN ${String(optionIndex + 1).padStart(2, "0")}</span><h3 class="option-name">${escapeHtml(name)}</h3><div class="option-actions">${custom ? '<em>NGOÀI DANH MỤC</em>' : ""}<span class="choose-box"></span><b>CHỌN</b></div></div>
                <div class="product-visual">${productImage ? `<img src="${productImage}" alt="${escapeHtml(name)}" />` : '<span class="empty-image">Chưa có ảnh vật liệu</span>'}</div>
                <div class="specs-wrap"><div class="specs">
                  <div class="spec-row"><div class="spec-label">Kích thước</div><div class="spec-value">${escapeHtml(size || "—")}</div></div>
                  <div class="spec-row"><div class="spec-label">Chất liệu / Bề mặt</div><div class="spec-value">${escapeHtml(material || "—")}</div></div>
                  <div class="spec-row"><div class="spec-label">Khu vực</div><div class="spec-value">${escapeHtml(item.size || "—")}</div></div>
                  <div class="spec-row"><div class="spec-label">Giá bán lẻ</div><div class="spec-value price">${escapeHtml(formatPrice(price))}</div></div>
                </div></div>
              </article>`);
        }
        optionsHtml = parts.join("");
      } else {
        optionsHtml = '<div class="no-options">Khu vực này chưa có phương án vật liệu phù hợp.</div>';
      }
      const range = chunk.length
        ? `PHƯƠNG ÁN ${String(firstOption).padStart(2, "0")}–${String(lastOption).padStart(2, "0")}`
        : "CHƯA CÓ PHƯƠNG ÁN";
      materialPages.push(`<main class="sheet area-page">
        <header class="area-header"><div><div class="eyebrow">KHU VỰC ${String(areaIndex + 1).padStart(2, "0")}${chunkIndex ? " · TIẾP THEO" : ""}</div><h1>${escapeHtml(areaName)}</h1></div><div class="page-count">${range} · TRANG ${chunkIndex + 1}/${chunks.length}</div></header>
        <div class="area-layout">
          <section class="area-column"><div class="section-label">HÌNH ẢNH KHU VỰC${chunkIndex ? " · LẶP LẠI ĐỂ ĐỐI CHIẾU" : ""}</div><div class="area-visual">${areaImage ? `<img src="${areaImage}" alt="${escapeHtml(areaName)}" />` : '<span class="empty-image">Chưa có ảnh khu vực</span>'}</div></section>
          <section class="options-column"><div class="section-label">VẬT LIỆU ĐỀ XUẤT · ${chunk.length} PHƯƠNG ÁN${chunkIndex ? " CÒN LẠI" : ""}</div><div class="option-grid${chunk.length < OPTIONS_PER_PAGE ? " partial" : ""}">${optionsHtml}</div></section>
        </div>
      </main>`);
    }
  }

  const date = new Date(mapping.updated_at.replace(" ", "T"));
  const dateText = Number.isNaN(date.getTime())
    ? mapping.updated_at
    : `Ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
  const [logo, stamp] = await Promise.all([
    staticImage("logo.png"),
    staticImage("dau_do.png"),
  ]);
  const noteLines = mapping.note
    ? mapping.note.split("\n").filter(Boolean)
    : ["Các phương án được lập theo thông tin và hình ảnh hiện có."];
  noteLines.push("Giá bán lẻ tham khảo đã bao gồm VAT.");
  noteLines.push("Có thể tùy chỉnh hoa văn theo số lượng đặt hàng tối thiểu (MOQ).");
  noteLines.push("Thông số kỹ thuật và màu sắc thực tế có thể chênh lệch nhẹ theo từng lô sản xuất.");
  const noteHtml = noteLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  const filename = (mapping.code || `DXVL-${mapping.id}`).replace(/[\\/:*?"<>|]+/g, "-");
  const totalPages = materialPages.length + 2;
  const totalPagesText = String(totalPages).padStart(2, "0");
  const materialPagesHtml = materialPages
    .map((page, index) =>
      page.replace(
        "</main>",
        `<div class="page-no">TRANG ${String(index + 2).padStart(2, "0")} / ${totalPagesText}</div></main>`,
      ),
    )
    .join("");
  const owner = [mapping.owner_name, mapping.owner_phone].filter(Boolean).join(" · ");

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(filename)}</title><style>
  :root{--blue:#1e4b86;--ink:#17202a;--muted:#64717b;--line:#d5dde3;--soft:#f3f6f8;--price:#c34432}
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:"Segoe UI",Arial,sans-serif;color:var(--ink);background:#dfe4e8}.sheet{position:relative;display:flex;flex-direction:column;width:1122px;min-height:793px;margin:20px auto;padding:38px;overflow:hidden;background:#fff;box-shadow:0 4px 24px #0002}.page-no{position:absolute;right:38px;bottom:20px;color:#8a949c;font-size:8px;letter-spacing:.08em}.btn-print{position:fixed;right:24px;bottom:24px;z-index:10;padding:12px 22px;border:0;border-radius:8px;color:#fff;background:var(--blue);box-shadow:0 4px 12px #0003;font:600 13px inherit;cursor:pointer}
  .brand-header{display:flex;align-items:flex-start;gap:28px;padding-bottom:18px;border-bottom:2px solid var(--blue)}.logo-wrap{position:relative;width:220px;flex-shrink:0}.logo{width:100%;object-fit:contain}.stamp{position:absolute;top:-18px;left:7px;width:135px;mix-blend-mode:multiply}.brand-copy{flex:1;padding-top:7px}.brand-copy h2{color:var(--blue);font-size:16px}.brand-copy p{margin-top:5px;color:#39434a;font-size:10px}
  .cover-title{margin:34px 0 24px;text-align:center}.eyebrow{color:var(--blue);font-size:8px;font-weight:700;letter-spacing:.14em}.cover-title .eyebrow{color:#74808a;font-size:9px;letter-spacing:.2em}.cover-title h1{margin-top:7px;color:var(--blue);font-size:31px;letter-spacing:.03em}.cover-title p{margin-top:8px;color:var(--muted);font-size:11px}.info-panel{display:grid;grid-template-columns:1fr 1fr;overflow:hidden;border:1px solid var(--line);border-radius:4px}.info-column+.info-column{border-left:1px solid var(--line)}.info-row{display:grid;grid-template-columns:132px 1fr;min-height:36px;font-size:11px}.info-row+.info-row{border-top:1px solid #e5e9ec}.info-row dt{padding:10px 12px;color:var(--muted);background:#f7f9fa;font-weight:600}.info-row dd{padding:10px 14px;font-weight:600}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.summary-card{padding:13px 15px;border:1px solid var(--line);border-top:3px solid var(--blue);border-radius:3px}.summary-card span{display:block;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.1em}.summary-card strong{display:block;margin-top:5px;font-size:17px}.cover-message{margin-top:18px;padding:17px 20px;border-left:4px solid var(--blue);background:#eef4f8;color:#34414b;font-size:11px;line-height:1.65}.selection-guide{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:18px;color:var(--blue);font-size:10px;font-weight:700;letter-spacing:.03em}.selection-guide .choose-box{width:19px;height:19px}
  .area-header{display:flex;align-items:center;justify-content:space-between;min-height:52px;padding:10px 14px;border:1px solid #cbd5dc;background:#edf3f7}.area-header .eyebrow{color:var(--blue);font-size:8px;font-weight:700;letter-spacing:.14em}.area-header h1{margin-top:3px;font-size:16px;line-height:1.25}.page-count{color:#65717a;font-size:9px;font-weight:700;letter-spacing:.1em}.area-layout{display:grid;grid-template-columns:49% 51%;flex:1;min-height:0;border:1px solid #cbd5dc;border-top:0}.area-column,.options-column{min-width:0;padding:12px}.area-column{display:flex;flex-direction:column;border-right:1px solid #d6dde2}.section-label{height:25px;padding-bottom:8px;border-bottom:1px solid #cbd5dc;color:#53616c;font-size:8px;font-weight:700;letter-spacing:.12em}.area-visual{display:flex;flex:1;align-items:center;justify-content:center;min-height:0;padding:20px}.area-visual img{display:block;width:100%;max-width:470px;max-height:540px;object-fit:contain}.empty-image{color:#7b8794;font-size:9px;font-style:italic}.option-grid{display:grid;grid-template-rows:repeat(4,minmax(0,1fr));gap:9px;height:calc(100% - 25px);padding-top:10px}.option-grid.partial{grid-template-rows:none;grid-auto-rows:145px;align-content:start}.no-options{padding:28px 12px;border:1px dashed #cfd6dc;border-radius:2px;color:#7b8794;font-size:9px;font-style:italic;text-align:center}
  .option-card{display:grid;grid-template-columns:104px minmax(0,1fr);grid-template-rows:auto 1fr;min-height:0;overflow:hidden;border:1px solid var(--line);border-radius:3px;background:#fff}.option-head{grid-column:1/-1;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;min-height:31px;padding:6px 9px;border-bottom:1px solid var(--line);background:var(--soft)}.option-number{color:var(--blue);font-size:9px;font-weight:700;letter-spacing:.08em;white-space:nowrap}.option-head h3{overflow:hidden;font-size:11px;font-weight:700;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}.option-actions{display:flex;align-items:center;gap:5px;color:var(--blue);font-size:8px;letter-spacing:.08em}.option-actions em{margin-right:4px;color:#7b6755;font-size:6px;font-style:normal;font-weight:700}.choose-box{display:block;width:17px;height:17px;border:1.5px solid var(--blue);border-radius:2px;background:#fff}.option-actions b{font-size:8px}.product-visual{display:flex;align-items:center;justify-content:center;min-height:0;padding:8px;border-right:1px solid #e0e5e9;background:#f7f6f3}.product-visual img{width:100%;height:100%;max-height:108px;object-fit:contain}.specs-wrap{display:flex;align-items:center;min-width:0;padding:7px 9px}.specs{width:100%;overflow:hidden;border:1px solid #e1e6ea;border-radius:2px}.spec-row{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:25px;font-size:10px;line-height:1.25}.spec-row+.spec-row{border-top:1px solid #e1e6ea}.spec-label{display:flex;align-items:center;padding:5px 9px;border-right:1px solid #e1e6ea;color:var(--muted);background:#f8f9fa;white-space:nowrap}.spec-value{display:flex;align-items:center;min-width:0;padding:5px 12px;font-weight:600}.specs .price .spec-value{color:var(--price);font-weight:700}
  .final-page{justify-content:space-between}.final-title{padding-bottom:12px;border-bottom:2px solid var(--blue);color:var(--blue);font-size:20px}.notes-box{margin-top:22px;padding:20px 22px;border:1px solid var(--line);background:#fafbfc}.notes-box h2{color:var(--blue);font-size:12px}.notes-box p{position:relative;margin-top:12px;padding-left:15px;font-size:11px;line-height:1.5}.notes-box p:before{position:absolute;left:0;content:"–"}.customer-note{min-height:82px;margin-top:18px;padding:15px;border:1px solid var(--line)}.customer-note span{color:var(--muted);font-size:8px;font-weight:700;letter-spacing:.1em}.customer-note p{margin-top:14px;color:#7b858d;font-size:11px;letter-spacing:.05em}.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin:45px 55px 0}.signature{text-align:center}.signature h3{font-size:11px}.signature p{margin-top:5px;color:var(--muted);font-size:9px}.sign-space{height:105px}.sign-line{padding-top:8px;border-top:1px solid #929ba2;font-size:10px;font-weight:600}
  @page{size:A4 landscape;margin:5mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff}.no-print{display:none!important}.sheet{width:auto;height:198mm;min-height:198mm;margin:0;padding:0;box-shadow:none;overflow:hidden;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}.sheet:last-child{break-after:auto;page-break-after:auto}.area-layout,.area-column,.options-column,.option-grid,.option-card{min-height:0;break-inside:avoid;page-break-inside:avoid}.page-no{right:0;bottom:0}}
  </style></head><body><button class="btn-print no-print" onclick="window.print()">In Đề Xuất / Lưu PDF</button>
  <main class="sheet cover-page"><header class="brand-header"><div class="logo-wrap">${logo ? `<img src="${logo}" class="logo" alt="Innomat" />` : ""}${stamp ? `<img src="${stamp}" class="stamp" alt="" />` : ""}</div><div class="brand-copy"><h2>CÔNG TY TNHH THƯƠNG MẠI QUỐC TẾ INNOMAT</h2><p>36 đường 25, Phường Tân Quy, TP. Hồ Chí Minh</p><p>Hotline: 090 988 4429 · 093 115 4449 · 0901 378 391</p><p>Email: info@innomat.vn</p></div></header>
  <section class="cover-title"><div class="eyebrow">HỒ SƠ TRÌNH DUYỆT VẬT LIỆU</div><h1>ĐỀ XUẤT VẬT LIỆU</h1><p>${escapeHtml(mapping.code || filename)}</p></section>
  <section class="info-panel"><dl class="info-column"><div class="info-row"><dt>Công ty</dt><dd>${escapeHtml(mapping.customer_company || "—")}</dd></div><div class="info-row"><dt>Người liên hệ</dt><dd>${escapeHtml(mapping.customer_name || "—")}</dd></div><div class="info-row"><dt>Tên công trình</dt><dd>${escapeHtml(mapping.name || "—")}</dd></div></dl><dl class="info-column"><div class="info-row"><dt>Ngày đề xuất</dt><dd>${escapeHtml(dateText)}</dd></div><div class="info-row"><dt>Người phụ trách</dt><dd>${escapeHtml(owner || "—")}</dd></div><div class="info-row"><dt>Phiên bản</dt><dd>${escapeHtml(mapping.version || "01")}</dd></div></dl></section>
  <section class="summary-grid"><div class="summary-card"><span>KHU VỰC</span><strong>${groups.length}</strong></div><div class="summary-card"><span>TỔNG PHƯƠNG ÁN</span><strong>${totalOptions}</strong></div><div class="summary-card"><span>TRANG VẬT LIỆU</span><strong>${materialPages.length}</strong></div></section>
  <div class="cover-message">Chân thành cảm ơn Quý khách hàng đã quan tâm và tin tưởng sản phẩm của Innomat. Hồ sơ này tổng hợp hình ảnh hiện trạng và các phương án vật liệu đề xuất theo từng khu vực để thuận tiện đối chiếu, trao đổi và xác nhận.</div><div class="selection-guide"><span class="choose-box"></span>QUÝ KHÁCH VUI LÒNG ĐÁNH DẤU VÀO Ô “CHỌN” TẠI PHƯƠNG ÁN PHÙ HỢP</div><div class="page-no">TRANG 01 / ${totalPagesText}</div></main>
  ${materialPagesHtml}
  <main class="sheet final-page"><div><h1 class="final-title">GHI CHÚ &amp; XÁC NHẬN</h1><section class="notes-box"><h2>GHI CHÚ CHUNG</h2>${noteHtml}</section><section class="customer-note"><span>Ý KIẾN KHÁCH HÀNG (NẾU CÓ)</span><p>........................................................................................................................................................................................................................................</p></section><section class="signature-grid"><div class="signature"><h3>CÔNG TY TNHH TM QUỐC TẾ INNOMAT</h3><p>Người lập đề xuất</p><div class="sign-space"></div><div class="sign-line">${escapeHtml(mapping.owner_name || "")}</div></div><div class="signature"><h3>XÁC NHẬN CỦA KHÁCH HÀNG</h3><p>Ký, ghi rõ họ tên</p><div class="sign-space"></div><div class="sign-line">${escapeHtml(mapping.customer_name || "")}</div></div></section></div><div class="page-no">TRANG ${totalPagesText} / ${totalPagesText}</div></main>
  </body></html>`;

  return {
    filename: `${filename}.html`,
    base64: Buffer.from(html, "utf-8").toString("base64"),
    mimeType: "text/html; charset=utf-8",
  };
}
