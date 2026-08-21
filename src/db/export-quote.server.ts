import { getDb } from "./index.server";
import { VAT_RATE } from "@/lib/pricing";
import { readImageBytes } from "@/lib/storage";
import { logoDataUrl, stampDataUrl } from "@/lib/brand-assets.server";

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

/** Chạy fn trên từng phần tử với giới hạn concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Xuất báo giá thành file HTML in đẹp.
 *
 * Logic VAT nhất quán:
 * - Luôn có dòng "VAT 8%" riêng trong tài liệu.
 * - prices_include_vat = 0 (chưa VAT):
 *     đơn giá hiển thị = unit_price (gốc)
 *     thành tiền gốc   = unit_price × qty
 *     VAT              = (Σ thành tiền + phí VC) × 8%
 *     Tổng cộng        = Σ thành tiền + phí VC + VAT
 * - prices_include_vat = 1 (giá đã gồm VAT):
 *     đơn giá hiển thị = unit_price / 1.08  (tách VAT ra)
 *     thành tiền gốc   = (unit_price / 1.08) × qty
 *     VAT              = (Σ thành tiền gốc + phí VC) × 8%
 *     Tổng cộng        = Σ thành tiền gốc + phí VC + VAT
 *                      = (stored_total / 1.08 + phí VC) × 1.08
 * - Phí vận chuyển luôn được nhập chưa VAT → cộng VAT 8% cùng SP.
 */
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
      `SELECT qi.*, p.internal_code, p.material, p.packing, p.packing_pcs, p.packing_m2, p.note as p_note,
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
    packing_pcs: number;
    packing_m2: number;
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
    const numThung = item.packing_m2 ? (item.quantity_m2 / item.packing_m2).toFixed(1) : "";
    const finalNote = numThung ? `~${numThung} Thùng` : "—";
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


