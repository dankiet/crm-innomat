/**
 * Xuất 1 CSV tổng hợp mọi thao tác rà soát hình Gạch Ốp Lát (2026-08-21).
 * Run: node scripts/export-gach-op-lat-actions-csv.mjs
 */
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const OUT = path.join(
  root,
  "docs",
  "audit-gach-op-lat",
  "TONG-HOP-XU-LY-HINH-GACH-OP-LAT.csv",
);

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}
loadDotEnvFile(path.join(root, ".env"));
loadDotEnvFile(path.join(root, ".env.local"));

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 13 mã 03 — giữ ảnh, không xóa */
const KEEP_CODES = [
  "6861LV",
  "N12X02",
  "N12X06",
  "N12X09",
  "N12X10B",
  "N12X16",
  "NHC802-5",
  "NHC804",
  "NHC806-1",
  "NHC809",
  "NHC812",
  "NHC816",
  "NHC822",
];

/** 60 mã đã xóa hết ảnh CRM */
const DELETED_CODES = [
  "IC61203",
  "IC61204",
  "IC61215",
  "IC61216",
  "IC61219",
  "IC61225",
  "IC6613",
  "IC6617",
  "IC6622",
  "IC6623",
  "IC6624",
  "IC6626",
  "IC6627",
  "IC6628",
  "IC6629",
  "IH61210",
  "IH61212",
  "IH61213",
  "IH61214",
  "IH61215",
  "IH6603",
  "IH6620",
  "IK61201",
  "IK61205",
  "IPK6610",
  "IPK6611",
  "IPK6612",
  "IPK6613",
  "IPK6614",
  "IPK6615",
  "IW61201",
  "IW61202",
  "IW61203",
  "IW61204",
  "IW61205",
  "IW61206",
  "IW61207",
  "IW61209",
  "IW61210",
  "IW6601",
  "IW6602",
  "IW6603",
  "IW6604",
  "IW6605",
  "IW6606",
  "IW6607",
  "IW6608",
  "IW6609",
  "IW6610",
  "IZA15901",
  "IZA15902",
  "IZA15903",
  "IZA15904",
  "IZA15905",
  "IZA15906",
  "IZA15907",
  "IZA15908",
  "IZA15909",
  "IZA15910",
  "IZA15911",
];

/** 3 mã 04 no-source — gộp 03, không xóa (đã trống) */
const MERGED_EMPTY_CODES = ["IC61217", "IC6625", "IW61208"];

/**
 * 26 mã 04 yes — đã upload (số ảnh + path nguồn chính)
 * path lấy từ lần upload 2026-08-21
 */
const UPLOADED = [
  ...[
    "IF3601",
    "IF3602",
    "IF3603",
    "IF3604",
    "IF3605",
    "IF3606",
    "IF3607",
    "IF3608",
    "IF3609",
    "IF61201",
    "IF61202",
    "IF61203",
    "IF61204",
    "IF61205",
    "IF61206",
    "IF61207",
    "IF61208",
    "IF61209",
    "IF61210",
    "IF61211",
    "IF61212",
    "IF6601",
    "IF6602",
    "IF6603",
  ].map((code) => ({
    code,
    images_uploaded: 2,
    source_folder: "Gạch Tesoro",
    source_files_note:
      code === "IF3608"
        ? "IF3608 (3).jpg || IF3608 (4).jpg"
        : `${code} (1).jpg || ${code} (2).jpg`,
  })),
  {
    code: "IG21209",
    images_uploaded: 1,
    source_folder: "Gạch Kiệt Anh",
    source_files_note: "IG21209.jpg",
  },
  {
    code: "IZA6618",
    images_uploaded: 4,
    source_folder: "Gạch Kim Hương",
    source_files_note:
      "IZA6618-01.jpg || IZA6618-02.jpg || IZA6618-03.jpg || IZA6618-04.jpg",
  },
];

const actionByCode = new Map();

for (const code of KEEP_CODES) {
  actionByCode.set(code.toUpperCase(), {
    nhom_goc: "03",
    hanh_dong: "GIU_ANH",
    mo_ta_xu_ly:
      "Nằm 03 (không có file folder khớp sau skip crawl/ko logo/thực tế/mã cũ) — theo chỉ định KHÔNG xóa ảnh CRM",
    so_anh_xu_ly: "",
    nguon_folder: "",
    file_nguon: "",
    chuan_anh: "",
  });
}

for (const code of DELETED_CODES) {
  actionByCode.set(code.toUpperCase(), {
    nhom_goc: "03",
    hanh_dong: "XOA_HET_ANH_CRM",
    mo_ta_xu_ly:
      "03 — không có file folder khớp; đã xóa toàn bộ product_images + clear image_path (2026-08-21)",
    so_anh_xu_ly: "1",
    nguon_folder: "",
    file_nguon: "",
    chuan_anh: "",
  });
}

for (const code of MERGED_EMPTY_CODES) {
  actionByCode.set(code.toUpperCase(), {
    nhom_goc: "04→03",
    hanh_dong: "GOP_03_DA_TRONG",
    mo_ta_xu_ly:
      "04 has_y_source=no — tab trống, không có file folder; gộp vào nhóm 03 (không upload, không xóa)",
    so_anh_xu_ly: "0",
    nguon_folder: "",
    file_nguon: "",
    chuan_anh: "",
  });
}

for (const u of UPLOADED) {
  actionByCode.set(u.code.toUpperCase(), {
    nhom_goc: "04",
    hanh_dong: "UPLOAD_ANH",
    mo_ta_xu_ly:
      "04 has_y_source=yes — tab trống, có file folder; upload lên CRM (primary + ảnh phụ nếu có)",
    so_anh_xu_ly: String(u.images_uploaded),
    nguon_folder: u.source_folder,
    file_nguon: u.source_files_note,
    chuan_anh: "webp q82, max side 1600, sharp rotate",
  });
}

async function main() {
  const url =
    process.env.DATABASE_URL_UNPOOLED?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.PG_SSL_DISABLE === "1" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const codes = [...actionByCode.keys()];
    const { rows } = await client.query(
      `SELECT p.id, p.code, p.name, p.supplier, p.category,
              COALESCE(p.image_path,'') AS image_path_hien_tai,
              COALESCE(c.n,0)::int AS image_count_hien_tai
       FROM products p
       LEFT JOIN (
         SELECT product_id, COUNT(*)::int AS n FROM product_images GROUP BY product_id
       ) c ON c.product_id = p.id
       WHERE UPPER(TRIM(p.code)) = ANY($1::text[])
       ORDER BY p.code`,
      [codes],
    );

    const byCode = new Map(rows.map((r) => [String(r.code).toUpperCase(), r]));

    const headers = [
      "stt",
      "id",
      "code",
      "name",
      "supplier",
      "category",
      "nhom_goc_audit",
      "hanh_dong",
      "mo_ta_xu_ly",
      "so_anh_da_xu_ly",
      "nguon_folder",
      "file_nguon",
      "chuan_anh_upload",
      "image_count_hien_tai",
      "image_path_hien_tai",
      "trang_thai_tab_hien_tai",
      "ngay_xu_ly",
    ];

    const sortedCodes = [...actionByCode.keys()].sort((a, b) => a.localeCompare(b, "en"));
    const outRows = [];
    let stt = 0;
    const missing = [];

    for (const key of sortedCodes) {
      const act = actionByCode.get(key);
      const p = byCode.get(key);
      if (!p) {
        missing.push(key);
        stt += 1;
        outRows.push({
          stt,
          id: "",
          code: key,
          name: "",
          supplier: "",
          category: "",
          nhom_goc_audit: act.nhom_goc,
          hanh_dong: act.hanh_dong,
          mo_ta_xu_ly: act.mo_ta_xu_ly + " | CẢNH BÁO: không tìm thấy SP trên DB",
          so_anh_da_xu_ly: act.so_anh_xu_ly,
          nguon_folder: act.nguon_folder,
          file_nguon: act.file_nguon,
          chuan_anh_upload: act.chuan_anh,
          image_count_hien_tai: "",
          image_path_hien_tai: "",
          trang_thai_tab_hien_tai: "KHONG_TIM_THAY_SP",
          ngay_xu_ly: "2026-08-21",
        });
        continue;
      }
      stt += 1;
      const hasImg =
        Number(p.image_count_hien_tai) > 0 || String(p.image_path_hien_tai).trim() !== "";
      outRows.push({
        stt,
        id: p.id,
        code: p.code,
        name: p.name,
        supplier: p.supplier,
        category: p.category,
        nhom_goc_audit: act.nhom_goc,
        hanh_dong: act.hanh_dong,
        mo_ta_xu_ly: act.mo_ta_xu_ly,
        so_anh_da_xu_ly: act.so_anh_xu_ly,
        nguon_folder: act.nguon_folder,
        file_nguon: act.file_nguon,
        chuan_anh_upload: act.chuan_anh,
        image_count_hien_tai: p.image_count_hien_tai,
        image_path_hien_tai: p.image_path_hien_tai,
        trang_thai_tab_hien_tai: hasImg ? "CO_ANH" : "TRONG_ANH",
        ngay_xu_ly: "2026-08-21",
      });
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const lines = [headers.join(",")];
    for (const row of outRows) {
      lines.push(headers.map((h) => csvEscape(row[h])).join(","));
    }
    fs.writeFileSync(OUT, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");

    const counts = {};
    for (const r of outRows) {
      counts[r.hanh_dong] = (counts[r.hanh_dong] || 0) + 1;
    }
    console.log("Wrote", OUT);
    console.log("Total rows:", outRows.length);
    console.log("By action:", counts);
    if (missing.length) console.warn("Missing on DB:", missing.join(", "));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
