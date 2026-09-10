/**
 * Mapping Chủng loại từ Google Spreadsheet vào cột shape (Kiểu dáng)
 * của danh mục Gạch ốp lát trong CRM database.
 */
import xlsx from 'xlsx';
import pg from 'pg';

function normalizeChungLoai(val) {
  if (!val) return '';
  const s = val.trim();
  const lower = s.toLowerCase();

  if (lower.includes('wood') || lower.includes('giả gỗ') || lower.includes('gỗ')) return 'Vân gỗ (Wood)';
  if (lower.includes('terrazzo')) return 'Terrazzo';
  if (lower.includes('cement') || lower.includes('xi măng') || lower.includes('bê tông')) return 'Xi măng (Cement)';
  if (lower.includes('marble')) return 'Marble';
  if (lower.includes('sand stone') || lower.includes('sandstone') || lower.includes('sa thạch')) return 'Sa thạch (Sandstone)';
  if (lower.includes('stone') || lower.includes('vân đá') || lower.includes('đá')) return 'Vân đá (Stone)';
  if (lower.includes('thẻ') || lower.includes('vân nổi') || lower.includes('mosaic')) return 'Giả thẻ hiệu ứng';
  if (lower.includes('porcelain')) return 'Porcelain';

  return s;
}

async function main() {
  const wb = xlsx.readFile('tmp/catalog.xlsx');
  const sheetMap = new Map(); // CODE -> { chung_loai, sheet, raw }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
    
    let headerRowIdx = -1;
    let codeColIdx = -1;
    let chungLoaiColIdx = -1;
    
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i] || [];
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toLowerCase();
        if (val === 'mã hóa in' || val === 'mã in' || (val.includes('mã hóa') && val.includes('in'))) {
          codeColIdx = c;
          headerRowIdx = i;
        }
        if (val === 'chủng loại' || val.includes('chủng loại')) {
          chungLoaiColIdx = c;
        }
      }
      if (headerRowIdx !== -1) break;
    }

    if (codeColIdx !== -1) {
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row) continue;
        const rawCode = String(row[codeColIdx] || '').trim();
        if (!rawCode || rawCode === '#VALUE!' || rawCode === 'undefined') continue;
        
        let chungLoai = '';
        if (chungLoaiColIdx !== -1 && row[chungLoaiColIdx]) {
          chungLoai = String(row[chungLoaiColIdx]).trim();
        }
        
        if (!chungLoai || chungLoai === '#VALUE!') {
          for (let c = 0; c < row.length; c++) {
            const cellStr = String(row[c] || '').trim();
            if (/^(marble|stone|wood|cement|terrazzo|giả gỗ|bê tông|travertine|granite|ceramic|porcelain)$/i.test(cellStr)) {
              chungLoai = cellStr;
              break;
            }
          }
        }

        const norm = normalizeChungLoai(chungLoai);
        if (norm) {
          sheetMap.set(rawCode.toUpperCase(), {
            code: rawCode,
            sheet: sheetName,
            raw: chungLoai,
            normalized: norm
          });
        }
      }
    }
  }

  console.log(`[Google Sheet] Đã trích xuất ${sheetMap.size} mã có Chủng loại từ 11 nhà cung cấp.`);

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const products = await client.query(`
      SELECT id, code, name, category, size, collections, shape
      FROM products
      WHERE category = 'Gạch ốp lát'
      ORDER BY id
    `);

    console.log(`[Database] Tìm thấy ${products.rows.length} sản phẩm Gạch ốp lát.`);

    let fromSheetCount = 0;
    let fallbackCount = 0;

    await client.query('BEGIN');

    for (const p of products.rows) {
      const codeUpper = (p.code || '').trim().toUpperCase();
      let shapeValue = '';

      if (sheetMap.has(codeUpper)) {
        shapeValue = sheetMap.get(codeUpper).normalized;
        fromSheetCount++;
      } else {
        // Fallback suy luận thông minh từ tên, mã và bộ sưu tập
        const name = (p.name || '').toLowerCase();
        const coll = (p.collections || '').toLowerCase();
        const code = (p.code || '').toUpperCase();

        if (name.includes('thẻ') || name.includes('giả thẻ') || code.startsWith('MF36Y') || code.includes('6861')) {
          shapeValue = 'Giả thẻ hiệu ứng';
        } else if (name.includes('terrazzo') || code.startsWith('IN306') || coll.includes('terrazzo')) {
          shapeValue = 'Terrazzo';
        } else if (name.includes('vân gỗ') || code.startsWith('IG') || code.startsWith('IT') || coll.includes('gỗ')) {
          shapeValue = 'Vân gỗ (Wood)';
        } else if (code.startsWith('IF') || code.startsWith('IPK') || code.startsWith('IH') || code.startsWith('IZA')) {
          shapeValue = 'Vân đá (Stone)';
        } else if (code.startsWith('NHC') || code.startsWith('N12X') || code.startsWith('DS')) {
          shapeValue = 'Đơn sắc (Plain)';
        } else if (coll.includes('marble') || code.startsWith('IC')) {
          shapeValue = 'Marble';
        } else {
          shapeValue = 'Vân đá (Stone)';
        }
        fallbackCount++;
      }

      await client.query(`UPDATE products SET shape = $1 WHERE id = $2`, [shapeValue, p.id]);
    }

    await client.query('COMMIT');

    console.log('=====================================================');
    console.log(`CẬP NHẬT HOÀN TẤT!`);
    console.log(`- Khớp trực tiếp từ Google Sheet: ${fromSheetCount} sản phẩm.`);
    console.log(`- Suy luận quy chuẩn cho mã nội bộ: ${fallbackCount} sản phẩm.`);
    console.log('=====================================================');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Lỗi cập nhật:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
