import { getDb } from "../db/index.server";
import XLSX from "xlsx-js-style";
import { VAT_RATE } from "@/lib/pricing";
import { readImageBytes } from "@/lib/storage.server";
import { logoDataUrl, stampDataUrl } from "@/lib/brand-assets.server";
import { mapLimit } from "@/lib/image-export.server";

type QuoteExportResult = {
  filename: string;
  base64: string;
  mimeType: string;
};

function vnd(n: number): string {
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}

async function imageRefToDataUrl(ref: string): Promise<string> {
  if (!ref) return "";
  const buf = await readImageBytes(ref);
  if (!buf) return "";
  const mime =
    ref.match(/\.png$/i)
      ? "image/png"
      : ref.match(/\.webp$/i)
        ? "image/webp"
        : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}


/**
 * Load báo giá + tính mọi con số (VAT, chiết khấu, phí VC) — NGUỒN DUY NHẤT.
 *
 * Cả bản HTML (in A4) và bản Excel đều gọi hàm này, nên hai định dạng không bao
 * giờ lệch số. Mọi chi tiết trình bày (cột xuất xứ, độ lệch màu) nằm ở tầng render.
 */
async function loadQuoteForExport(quoteId: number, hideVat: boolean) {
  const db = getDb();

  // ── Load quote ──────────────────────────────────────────────
  const quote = (await db.prepare(
      `SELECT q.*, c.name AS customer_name, c.phone AS customer_phone,
              c.company AS customer_company, c.short_name AS customer_short_name, c.region AS customer_region,
              u.display_name AS owner_name, u.phone AS owner_phone
       FROM quotes q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE q.id = ?`,
    )
    .get(quoteId)) as
    | {
        id: number;
        code: string;
        notes: string;
        prices_include_vat: number;
        shipping_fee: number;
        discount_type: string;
        created_at: string;
        customer_name: string;
        customer_phone: string;
        customer_company: string;
        customer_short_name?: string;
        customer_region: string;
        owner_name: string;
        owner_phone: string;
      }
    | undefined;

  if (!quote) throw new Error("Không tìm thấy báo giá");

  // 1 nguồn sự thật: mã BG trong DB (QT-YYMMDD-INM-CODE). BG cũ fallback sanitize code.
  const generatedFilename = String(quote.code || "QT")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim() || "QT";

  const items = (await db.prepare(
      `SELECT qi.id, qi.product_code, qi.product_name, qi.size, qi.quantity_m2,
       qi.retail_price, qi.discount_pct, qi.unit_price, qi.area, qi.line_total,
       p.internal_code, p.area_per_tile_m2, p.note as p_note,
       COALESCE(NULLIF(qi.material, ''), p.material, '') AS material,
       NULLIF(qi.packing, '') AS packing,
       COALESCE(
         (SELECT path FROM product_images pi
          WHERE pi.product_id = qi.product_id
          ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
          LIMIT 1),
         p.image_path,
         ''
       ) AS image_path
       FROM quote_items qi
       LEFT JOIN products p ON p.id = qi.product_id
       WHERE qi.quote_id = ?
       ORDER BY qi.id`,
    )
    .all(quoteId)) as Array<{
    id: number;
    product_code: string;
    product_name: string;
    size: string;
    quantity_m2: number;
    retail_price: number;
    discount_pct: number;
    unit_price: number;
    area: string;
    line_total: number;
    internal_code: string;
    material: string;
    packing: string;
    area_per_tile_m2: number;
    p_note: string;
    image_path: string;
  }>;

  const includeVat = Boolean(quote.prices_include_vat);
  const shippingFeeInput = Number(quote.shipping_fee) || 0;
  const shippingFeePreVat = (includeVat && !hideVat)
    ? shippingFeeInput / (1 + VAT_RATE)
    : shippingFeeInput;

// Pre-VAT unit prices and subtotals, plus image base64 (async, giới hạn concurrency)
  const unitRows = items.map((item) => {
    const unitPreVat = (includeVat && !hideVat)
      ? item.unit_price / (1 + VAT_RATE)
      : item.unit_price;
    const subtotal = unitPreVat * item.quantity_m2;
    const thung = Number(item.packing) > 0 ? `${Number(item.packing)} thùng` : "";
    const tiles = item.area_per_tile_m2
      ? Math.ceil(item.quantity_m2 / item.area_per_tile_m2 - 1e-9)
      : null;
    const finalNote = thung || (tiles ? `~${tiles} viên` : "—");
    return { ...item, unitPreVat, subtotal, finalNote };
  });

  const imageDataUrls = await mapLimit(unitRows, 6, (r) =>
    imageRefToDataUrl(r.image_path),
  );
  const rows = unitRows.map((item, i) => ({
    ...item,
    imgBase64: imageDataUrls[i] ?? "",
  }));

  const productSubtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const vatBase = productSubtotal + shippingFeePreVat;
  const vatAmount = vatBase * VAT_RATE;
  const grandTotal = vatBase + vatAmount;

  // Format date
  const dateStr = (() => {
    const d = new Date(quote.created_at.replace(" ", "T"));
    if (isNaN(d.getTime())) return quote.created_at;
    return `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  })();
  return {
    quote,
    rows,
    generatedFilename,
    dateStr,
    includeVat,
    shippingFeeInput,
    shippingFeePreVat,
    productSubtotal,
    vatBase,
    vatAmount,
    grandTotal,
  };
}

export async function exportQuoteToHtml(
  quoteId: number,
  paymentTerms: string = "",
  deliveryTerms: string = "",
  hideVat: boolean = false,
  showOrigin: boolean = false,
  showColorVariance: boolean = false,
  projectName: string = "",
  deliveryLocation: string = "",
): Promise<QuoteExportResult> {
  const {
    quote,
    rows,
    generatedFilename,
    dateStr,
    includeVat,
    shippingFeeInput,
    shippingFeePreVat,
    productSubtotal,
    vatBase,
    vatAmount,
    grandTotal,
  } = await loadQuoteForExport(quoteId, hideVat);

  // Hai cột tuỳ chọn mặc định được ẩn để ưu tiên không gian cho ảnh và tên hàng.
  const trailingColumnCount = 2 + Number(showOrigin) + Number(showColorVariance);

  // ── Build row HTML ──────────────────────────────────────────
  const rowsHtml = rows
    .map(
      (r, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td class="center">${r.imgBase64 ? `<img src="${r.imgBase64}" class="thumb" />` : ""}</td>
        <td class="center"><strong>${r.product_code}</strong></td>
        <td>${r.product_name}</td>
        <td class="center">${r.size || "—"}</td>
        <td class="center">${r.material || "—"}</td>
        <td class="center">${Number(r.quantity_m2).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}</td>
        <td class="center">m2</td>
        <td class="center">${vnd(r.unitPreVat)}</td>
        <td class="center bold">${vnd(r.subtotal)}</td>
        ${showOrigin ? `<td class="center">Trung Quốc</td>` : ""}
        ${showColorVariance ? `<td class="center">V2</td>` : ""}
        <td class="center">${r.finalNote}</td>
        <td class="center">${r.area || "—"}</td>
      </tr>`,
    )
    .join("\n");

  const shippingRowHtml =
    shippingFeeInput > 0
      ? `
      <tr class="totals-row shipping-row">
        <td colspan="9" class="center bold">PHÍ VẬN CHUYỂN</td>
        <td class="center bold">${vnd(shippingFeePreVat)}</td>
        <td colspan="${trailingColumnCount}"></td>
      </tr>`
      : "";

  const vatNote = "";

  const logoBase64 = logoDataUrl;
  const stampBase64 = stampDataUrl;

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${generatedFilename}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      background: #fff;
      padding: 32px 40px;
      max-width: 960px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 24px; }
    .logo-container { position: relative; width: 220px; flex-shrink: 0; }
    .logo-container .main-logo { width: 100%; height: auto; object-fit: contain; }
    .logo-container .stamp { position: absolute; top: -15px; left: 10px; width: 140px; opacity: 0.95; z-index: 10; mix-blend-mode: multiply; }
    .brand { flex: 1; display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
    .brand-name { font-size: 16px; font-weight: 700; color: #1e4b86; text-transform: uppercase; }
    .brand-sub { font-size: 11px; color: #333; }
    .doc-title { text-align: center; font-size: 26px; font-weight: 700; color: #1e4b86; margin-top: 12px; margin-bottom: 24px; text-transform: uppercase; }

    /* ── Info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      margin-bottom: 16px;
      background: #f2f2f2;
      border: 1px solid #fff;
    }
    .info-grid p { display: flex; padding: 6px 12px; font-size: 11.5px; border-bottom: 1px solid #fff; }
    .info-grid .label { font-weight: 700; width: 120px; flex-shrink: 0; }
    .info-grid .val { flex: 1; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 0; font-size: 11px; }
    thead tr { background: #6a9ad0; color: #111; }
    thead th { padding: 8px 4px; font-weight: 700; text-align: center; border: 1px solid #333; overflow-wrap: anywhere; }
    tbody td { padding: 6px 4px; border: 1px solid #333; vertical-align: middle; overflow-wrap: anywhere; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }

    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .thumb { max-width: 55px; max-height: 45px; object-fit: contain; display: block; margin: 0 auto; }

    /* ── Subtotal section ── */
    .totals-row td, .grand-row td { background: #ffff00; font-size: 12px; font-weight: 700; color: #111; border: 1px solid #333; }
    .shipping-row td { background: #e0f0ff; }
    .vat-note { font-size: 10px; color: #aaa; text-align: right; padding: 6px 0; font-style: italic; }

    /* ── Notes ── */
    .static-notes { margin-top: 24px; }
    .static-notes .notes-title { font-size: 12px; font-weight: 700; color: #1e4b86; text-transform: uppercase; text-decoration: underline; margin-bottom: 8px; }
    .static-notes .note-group { margin-bottom: 8px; }
    .static-notes .note-group h5 { font-size: 11px; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
    .static-notes .note-group p { font-size: 10.5px; color: #222; line-height: 1.5; margin-bottom: 2px; }
    .static-notes .note-group p.dash::before { content: "- "; }
    .static-notes .closing { font-style: italic; margin-top: 12px; font-size: 11px; }

    /* ── Signature ── */
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 36px; padding: 0 40px; }
    .sig-box { text-align: center; }
    .sig-box .title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111; margin-bottom: 4px; }
    .sig-space { height: 70px; }

    /* ── Footer ── */
    .footer { display: none; }

    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      body { padding: 0; max-width: 100%; font-size: 11px; }
      .no-print { display: none !important; }
    }
    
    /* ── Floating Print Button ── */
    .btn-print {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1e4b86;
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      font-family: inherit;
    }
    .btn-print:hover { background: #153661; }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">🖨️ In Báo Giá / Lưu PDF</button>

  <!-- HEADER -->
  <div class="header">
    <div class="logo-container">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="main-logo" />` : ""}
      ${stampBase64 ? `<img src="${stampBase64}" alt="Stamp" class="stamp" />` : ""}
    </div>
    <div class="brand">
      <div class="brand-name">CÔNG TY TNHH THƯƠNG MẠI QUỐC TẾ INNOMAT</div>
      <div class="brand-sub">Địa chỉ: 36 đường 25, Phường Tân Quy, TP. Hồ Chí Minh</div>
      <div class="brand-sub">Hotline: 090 988 4429 - 093 115 4449 - 0901 378 391</div>
      <div class="brand-sub">Email: info@innomat.vn</div>
    </div>
  </div>

  <div class="doc-title">BẢNG BÁO GIÁ</div>

  <!-- INFO GRID -->
  <div class="info-grid">
    <div>
      <p><span class="label">Công ty:</span> <span class="val">${quote.customer_company || "—"}</span></p>
      <p><span class="label">Người liên hệ:</span> <span class="val">${quote.customer_name || "—"}</span></p>
      <p><span class="label">Công trình:</span> <span class="val">${projectName || "—"}</span></p>
      <p><span class="label">Địa điểm giao:</span> <span class="val">${deliveryLocation || "—"}</span></p>
    </div>
    <div>
      <p><span class="label">Ngày báo giá:</span> <span class="val">${dateStr}</span></p>
      <p><span class="label">Số báo giá:</span> <span class="val">${generatedFilename}</span></p>
      <p><span class="label">Người phụ trách:</span> <span class="val">${quote.owner_name || "—"}${quote.owner_phone ? ` - ${quote.owner_phone}` : ""}</span></p>
      <p><span class="label">Hiệu lực báo giá:</span> <span class="val">Báo giá có hiệu lực 30 ngày kể từ ngày báo giá</span></p>
    </div>
  </div>

  <p style="margin-bottom:8px; font-size:11.5px; font-style:italic">Chân thành cảm ơn quý khách hàng đã quan tâm và tin tưởng sản phẩm của Innomat. Chúng tôi xin gửi đến Quý Công Ty báo giá chi tiết như sau:</p>

  <!-- PRODUCT TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:30px">STT</th>
        <th style="width:65px">Hình ảnh</th>
        <th style="width:80px">Mã hàng</th>
        <th>Tên hàng</th>
        <th style="width:80px">Kích thước<br/>(mm)</th>
        <th style="width:60px">Chất liệu</th>
        <th style="width:55px">Số lượng</th>
        <th style="width:40px">ĐVT</th>
        <th style="width:80px">Đơn giá<br/>(VNĐ)</th>
        <th style="width:100px">Thành tiền<br/>(VNĐ)</th>
        ${showOrigin ? '<th style="width:75px">Xuất xứ</th>' : ""}
        ${showColorVariance ? '<th style="width:60px">Độ khác<br/>biệt màu<br/>sắc</th>' : ""}
        <th style="width:80px">Ghi chú</th>
        <th style="width:80px">Khu vực</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      ${shippingRowHtml}
      <tr class="totals-row">
        <td colspan="9" class="center bold">TỔNG CỘNG</td>
        <td class="center bold">${vnd(vatBase)}</td>
        <td colspan="${trailingColumnCount}"></td>
      </tr>
      ${hideVat ? "" : `
      <tr class="totals-row">
        <td colspan="9" class="center bold">THUẾ VAT (8%)</td>
        <td class="center bold">${vnd(vatAmount)}</td>
        <td colspan="${trailingColumnCount}"></td>
      </tr>
      <tr class="grand-row">
        <td colspan="9" class="center bold">TỔNG THANH TOÁN</td>
        <td class="center bold">${vnd(grandTotal)}</td>
        <td colspan="${trailingColumnCount}"></td>
      </tr>`}
    </tbody>
  </table>
  <div class="vat-note">${vatNote}</div>

  <!-- STATIC NOTES -->
  <div class="static-notes">
    <div class="notes-title">CÁC LƯU Ý VÀ HƯỚNG DẪN / THÔNG TIN GIAO HÀNG &amp; THANH TOÁN:</div>
    
    <div class="note-group">
      <h5>1. Phương thức thanh toán:</h5>
      ${
        paymentTerms
          ? paymentTerms.split('\n').map(line => `<p class="dash">${line}</p>`).join('\n      ')
          : `<p class="dash">Tạm ứng 40% giá trị đơn hàng.</p>
             <p class="dash">Thanh toán số tiền còn lại trong vòng 10 ngày kể từ ngày nhận đủ hàng.</p>`
      }
      <div style="margin-top: 4px">
        <p style="font-weight: 700; margin-bottom: 2px;">CÔNG TY TNHH THƯƠNG MẠI QUỐC TẾ INNOMAT</p>
        <p>STK: 045704070016665 – Ngân hàng HD Bank – Chi nhánh Sài Gòn</p>
      </div>
    </div>
    
    <div class="note-group">
      <h5>2. Phương thức giao nhận:</h5>
      <p class="dash">Giao hàng miễn phí trong nội thành TP. HCM.</p>
      <p class="dash">Giao hàng đến chân công trình, bốc xếp trong vòng 5m (năm mét), không bốc xếp lên lầu hoặc xuống tầng hầm. Trong điều kiện cấm tải, đường khó đi, xe tải không vào được chân công trình hoặc vận chuyển ngoài giờ hành chính, nếu phát sinh chi phí, Quý Khách hàng chịu chi phí phát sinh.</p>
    </div>

    <div class="note-group">
      <h5>3. Thời gian giao hàng:</h5>
      ${
        deliveryTerms
          ? deliveryTerms.split('\n').map(line => `<p class="dash">${line}</p>`).join('\n      ')
          : `<p class="dash">Trong vòng 3-5 ngày kể từ ngày xác nhận đặt hàng và tạm ứng.</p>`
      }
    </div>

    <div class="note-group">
      <h5>4. Quy định về đổi trả hàng:</h5>
      <p class="dash">Đổi hàng: Trong vòng 3 ngày kể từ lúc 2 bên ký vào chứng từ giao nhận hàng, nếu Bên Mua phát hiện sản phẩm không đúng với chất lượng cam kết, hàng bị lỗi, sai sót trong giao nhận do Bên Bán hoặc nhà sản xuất mà 2 bên không có khả năng nhận biết tại thời điểm giao nhận hàng, Trong trường hợp này Bên Bán sẽ thay thế số hàng bị lỗi, hư hỏng này cho Bên Mua với điều kiện hàng còn nguyên vẹn vỏ thùng và chưa qua sử dụng, bể vỡ.</p>
      <p class="dash">Trả hàng:</p>
      <p style="padding-left:12px"> - Số lượng hàng trả không quá 5% tổng giá trị đơn hàng.</p>
      <p style="padding-left:12px"> - Thời gian trả hàng không quá 15 ngày kể từ ngày nhận hàng, phí trả hàng 10%.</p>
      <p style="padding-left:12px"> - Trả hàng tại kho, nguyên thùng, hàng trả về phải còn nguyên vẹn vỏ thùng và chưa qua sử dụng (chưa ngâm nước, trét vữa, cắt hoặc ốp) và không bể vỡ. Nếu trường hợp hàng bị bể vỡ do nhà sản xuất, quý khách vui lòng cung cấp hình ảnh, video ghi nhận khi khui thùng.</p>
    </div>

    <div class="note-group">
      <h5>5. Giao nhận và bảo quản gạch:</h5>
      <p class="dash">Chuẩn bị mặt bằng khu vực bằng phẳng, khô ráo, không ẩm ướt, có nước hay ướt mưa để đảm bảo gạch không bị bể vỡ, bao bì nguyên vẹn.</p>
      <p class="dash">Đặc biệt đối với gạch mosaic (nếu có) phải bảo quản nơi khô ráo, không để thấm nước, nếu thấm nước các viên nhỏ sẽ bị bong ra khỏi vỉ gạch.</p>
    </div>

    <div class="note-group">
      <h5>6. Hướng dẫn thi công:</h5>
      <p class="dash">Kiểm tra mã lô / mã màu trên vỏ thùng trước khi thi công. Mỗi khu vực chỉ nên ốp 1 mã lô, không ốp nhiều mã lô trên cùng 1 khu vực. Khuyến nghị nhà thầu trước khi trét keo ốp gạch nên kiểm tra tình trạng gạch bằng cách xếp từng mảng gạch để so sánh độ chênh lệch màu sắc hoặc kích thước hoặc độ nguyên vẹn của gạch. Khi phát hiện sự cố về gạch, bên Mua phải thông báo ngay cho Bên Bán để kiểm tra xử lý trước khi thi công.</p>
      <p class="dash">Chừa ron 2mm - 3mm giữa các viên gạch khi thi công. Yêu cầu sử dụng nẹp cân bằng và ke ron khi ốp lát.</p>
      <p class="dash">Ốp gạch thẳng hàng, không nên ốp so le nửa viên gạch, có thể ốp so le 1/3 viên gạch.</p>
      <p class="dash">Ốp gạch theo chiều mũi tên hoặc chiều logo trên lưng viên gạch.</p>
      <p class="dash">Lau bề mặt gạch thật sạch trước khi chà ron. Để 30 phút cho khô, sau đó dùng cao su mềm hoặc giẻ khô lau sạch đường ron.</p>
      <p class="dash">Sử dụng keo dán gạch và bột chà ron phù hợp cho từng loại gạch để dán.</p>
    </div>

    <p class="closing">Rất mong nhận được sự hợp tác của Quý công ty!</p>
  </div>

  <!-- SIGNATURE -->
  <div class="signature-grid">
    <div class="sig-box">
      <div class="title">CÔNG TY TNHH TM QUỐC TẾ INNOMAT</div>
      <div class="sig-space"></div>
    </div>
    <div class="sig-box">
      <div class="title">XÁC NHẬN BÁO GIÁ</div>
      <div class="sig-space"></div>
      <div class="name-hint">${quote.customer_name || ""}</div>
    </div>
  </div>

  <div class="footer">
    Tài liệu được tạo tự động từ hệ thống Innomat CRM · ${generatedFilename}
  </div>

</body>
</html>`;

  return {
    filename: `${generatedFilename}.html`,
    base64: Buffer.from(html, "utf-8").toString("base64"),
    mimeType: "text/html; charset=utf-8",
  };
}

/**
 * Xuất báo giá thành file Excel (.xlsx) — cùng số liệu với bản HTML.
 *
 * Dùng chung `loadQuoteForExport` nên VAT / chiết khấu / phí vận chuyển khớp
 * tuyệt đối với bản in A4. Khác biệt duy nhất là cách trình bày: Excel không
 * nhúng ảnh sản phẩm (đường dẫn ảnh là URL, không phải bytes) và không có
 * phần lưu ý / chữ ký — bảng tính chỉ để đối chiếu số.
 */
export async function exportQuoteToXlsx(
  quoteId: number,
  paymentTerms: string = "",
  deliveryTerms: string = "",
  hideVat: boolean = false,
  showOrigin: boolean = false,
  showColorVariance: boolean = false,
  projectName: string = "",
  deliveryLocation: string = "",
): Promise<QuoteExportResult> {
  const {
    quote,
    rows,
    generatedFilename,
    dateStr,
    shippingFeeInput,
    shippingFeePreVat,
    vatBase,
    vatAmount,
    grandTotal,
  } = await loadQuoteForExport(quoteId, hideVat);

  const header = [
    "STT",
    "Mã hàng",
    "Tên hàng",
    "Kích thước",
    "Chất liệu",
    "Số lượng (m2)",
    "ĐVT",
    "Đơn giá",
    "Thành tiền",
    ...(showOrigin ? ["Xuất xứ"] : []),
    ...(showColorVariance ? ["Độ lệch màu"] : []),
    "Quy cách",
    "Khu vực",
  ];

  const body = rows.map((r, i) => [
    i + 1,
    r.product_code,
    r.product_name,
    r.size || "",
    r.material || "",
    Number(r.quantity_m2),
    "m2",
    Math.round(r.unitPreVat),
    Math.round(r.subtotal),
    ...(showOrigin ? ["Trung Quốc"] : []),
    ...(showColorVariance ? ["V2"] : []),
    r.finalNote,
    r.area || "",
  ]);

  // Dòng tổng: đặt nhãn ở cột "Tên hàng" cho dễ đọc, số ở cột "Thành tiền".
  const totalLabelCol = 2;
  const totalValueCol = header.indexOf("Thành tiền");
  const blank = (n: number) => Array(n).fill("");
  const totalRow = (label: string, value: number) => {
    const row = blank(header.length);
    row[totalLabelCol] = label;
    row[totalValueCol] = Math.round(value);
    return row;
  };

  const aoa: (string | number)[][] = [
    [`${generatedFilename}`],
    ["BÁO GIÁ"],
    [],
    ["Khách hàng:", quote.customer_name || "", "", "Ngày:", dateStr],
    ["Điện thoại:", quote.customer_phone || "", "", "Công trình:", projectName || ""],
    ["Địa điểm giao:", deliveryLocation || ""],
    [],
    header,
    ...body,
  ];

  if (shippingFeeInput > 0) {
    aoa.push(totalRow("PHÍ VẬN CHUYỂN", shippingFeePreVat));
  }
  aoa.push(totalRow("TỔNG CỘNG", vatBase));
  if (!hideVat) {
    aoa.push(totalRow("THUẾ VAT (8%)", vatAmount));
    aoa.push(totalRow("TỔNG THANH TOÁN", grandTotal));
  }

  // Ghi chú dạng văn bản ở cuối sheet — giữ nội dung đã nhập trong dialog.
  if (paymentTerms.trim() || deliveryTerms.trim()) {
    aoa.push([]);
    if (paymentTerms.trim()) {
      aoa.push(["Phương thức thanh toán:"]);
      for (const line of paymentTerms.split("\n")) aoa.push(["", line]);
    }
    if (deliveryTerms.trim()) {
      aoa.push(["Thời gian giao hàng:"]);
      for (const line of deliveryTerms.split("\n")) aoa.push(["", line]);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((h) =>
    h === "Tên hàng" ? { wch: 42 } : h === "Mã hàng" ? { wch: 14 } : { wch: 16 },
  );

  // ── Style ────────────────────────────────────────────────────
  // Màu lấy đúng từ bản HTML để hai định dạng trông cùng một hệ.
  // Dùng `xlsx-js-style` (fork của SheetJS) vì bản community bỏ hẳn cell style.
  const BORDER = {
    top: { style: "thin", color: { rgb: "333333" } },
    bottom: { style: "thin", color: { rgb: "333333" } },
    left: { style: "thin", color: { rgb: "333333" } },
    right: { style: "thin", color: { rgb: "333333" } },
  } as const;
  const cell = (r: number, c: number) =>
    ws[XLSX.utils.encode_cell({ r, c })] as
      | { s?: Record<string, unknown>; v?: unknown }
      | undefined;
  const styleRow = (r: number, style: Record<string, unknown>, cols = header.length) => {
    for (let c = 0; c < cols; c++) {
      const x = cell(r, c);
      if (x) x.s = style;
    }
  };

  const headerRowIdx = aoa.findIndex((row) => row[0] === "STT");
  if (headerRowIdx >= 0) {
    styleRow(
      headerRowIdx,
      {
        font: { bold: true, color: { rgb: "111111" } },
        fill: { fgColor: { rgb: "6A9AD0" } },
        border: BORDER,
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      },
    );
  }

  // Thân bảng: viền + căn giữa cho cột số, căn trái cho tên hàng.
  const bodyStart = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  const totalLabels = new Set([
    "PHÍ VẬN CHUYỂN",
    "TỔNG CỘNG",
    "THUẾ VAT (8%)",
    "TỔNG THANH TOÁN",
  ]);
  let firstTotalRow = -1;
  for (let r = bodyStart; r < aoa.length; r++) {
    const label = aoa[r]?.[totalLabelCol];
    const isTotal = typeof label === "string" && totalLabels.has(label);
    if (isTotal && firstTotalRow < 0) firstTotalRow = r;
    if (isTotal) continue; // style riêng ở dưới
    const isBody = headerRowIdx >= 0 && r > headerRowIdx && aoa[r]?.length === header.length;
    if (!isBody) continue;
    styleRow(r, { border: BORDER, alignment: { vertical: "center" } });
    const nameCell = cell(r, header.indexOf("Tên hàng"));
    if (nameCell) nameCell.s = { border: BORDER, alignment: { vertical: "center", wrapText: true } };
    for (const colName of ["Số lượng (m2)", "ĐVT", "Đơn giá", "Thành tiền", "STT"]) {
      const c = header.indexOf(colName);
      if (c < 0) continue;
      const x = cell(r, c);
      if (x) x.s = { border: BORDER, alignment: { horizontal: "center", vertical: "center" } };
    }
  }

  // Dòng tổng: nền vàng cho TỔNG CỘNG / VAT / THANH TOÁN, xanh nhạt cho phí VC.
  if (firstTotalRow >= 0) {
    for (let r = firstTotalRow; r < aoa.length; r++) {
      const label = aoa[r]?.[totalLabelCol];
      if (typeof label !== "string" || !totalLabels.has(label)) break;
      const isShipping = label === "PHÍ VẬN CHUYỂN";
      styleRow(r, {
        font: { bold: true },
        fill: { fgColor: { rgb: isShipping ? "E0F0FF" : "FFFF00" } },
        border: BORDER,
      });
      const labelCell = cell(r, totalLabelCol);
      if (labelCell) {
        labelCell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: isShipping ? "E0F0FF" : "FFFF00" } },
          border: BORDER,
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
      const valueCell = cell(r, totalValueCol);
      if (valueCell) {
        valueCell.s = {
          font: { bold: true },
          fill: { fgColor: { rgb: isShipping ? "E0F0FF" : "FFFF00" } },
          border: BORDER,
          alignment: { horizontal: "center", vertical: "center" },
        };
      }
    }
  }

  // Tiêu đề tài liệu: gộp ô + cỡ chữ lớn, giống dòng "BÁO GIÁ" của bản in.
  if (aoa[1]?.[0] === "BÁO GIÁ") {
    ws["!merges"] = [
      ...(ws["!merges"] ?? []),
      { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(header.length - 1, 3) } },
    ];
    const titleCell = cell(1, 0);
    if (titleCell) {
      titleCell.s = {
        font: { bold: true, sz: 16, color: { rgb: "1E4B86" } },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
    const codeCell = cell(0, 0);
    if (codeCell) codeCell.s = { font: { bold: true, sz: 11 } };
  }

  XLSX.utils.book_append_sheet(wb, ws, "BaoGia");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return {
    filename: `${generatedFilename}.xlsx`,
    base64: buf.toString("base64"),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
