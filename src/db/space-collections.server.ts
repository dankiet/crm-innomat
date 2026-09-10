/**
 * Bộ sưu tập Không gian (Architectural Space Lookbooks) — Server logic.
 *
 * Phân lập hoàn toàn khỏi `gallery_collections` (bộ sưu tập sản phẩm/series).
 * Quản lý bối cảnh kiến trúc thực tế (render 3D/ảnh thực) và các điểm ghim
 * vật liệu (hotspots) liên kết trực tiếp với bảng `products`.
 */
import { getDb, type SqlValue } from "./index.server";
import { COLOR_PALETTES } from "@/lib/color-palette";
import type { LpMaterial } from "@/lib/lp-types";

function nowLocal(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function clip(raw: string | undefined | null, max: number): string {
  return (raw ?? "").trim().slice(0, max);
}

export type PublicSpaceCollection = {
  id: number;
  slug: string;
  title: string;
  space_type: string;
  tag: string;
  description: string;
  image_path: string;
  materials: {
    product_id: number;
    code: string;
    name: string;
    category: string;
    size: string;
    surface: string;
    color: string;
    image: string;
    application_position: string;
    note: string;
    hotspot_x: number | null;
    hotspot_y: number | null;
  }[];
};


// ─── Public projection ───────────────────────────────────────────

const ROOM_LOOKBOOK_META: Record<
  string,
  { title: string; tag: string; defaultApp: string; spaceType: string }
> = {
  bathroom_spa: {
    title: "Phòng tắm & Spa",
    tag: "PHÒNG TẮM & SPA",
    defaultApp: "Ốp mảng tường & lát sàn phòng tắm",
    spaceType: "bathroom_spa",
  },
  kitchen_dining: {
    title: "Bếp & Dining",
    tag: "BẾP & DINING",
    defaultApp: "Ốp tường bếp & đảo bếp",
    spaceType: "kitchen_dining",
  },
  living_room: {
    title: "Phòng khách & Lounge",
    tag: "PHÒNG KHÁCH & LOUNGE",
    defaultApp: "Ốp mảng tường nhấn phòng khách",
    spaceType: "living_room",
  },
  bedroom: {
    title: "Phòng ngủ & Suite",
    tag: "PHÒNG NGỦ & SUITE",
    defaultApp: "Ốp vách đầu giường & phòng ngủ",
    spaceType: "bedroom",
  },
  outdoor_balcony: {
    title: "Ban công & Sân trong",
    tag: "BAN CÔNG & SÂN VƯỜN",
    defaultApp: "Lát sàn ban công & sân ngoài trời",
    spaceType: "outdoor_balcony",
  },
  fnb_hospitality: {
    title: "Thương mại & F&B",
    tag: "THƯƠNG MẠI & F&B",
    defaultApp: "Ốp quầy bar & không gian thương mại",
    spaceType: "fnb_hospitality",
  },
  office_workspace: {
    title: "Thương mại & Workspace",
    tag: "THƯƠNG MẠI & WORKSPACE",
    defaultApp: "Mảng tường nhấn văn phòng làm việc",
    spaceType: "fnb_hospitality",
  },
};

export function getLookbookCycleSeed(date: Date = new Date()): number {
  return Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
}

export type ListPublicSpaceCollectionsOptions = {
  seed?: number | null;
  limit?: number | null;
};

export async function listPublicSpaceCollections(
  options?: ListPublicSpaceCollectionsOptions,
): Promise<PublicSpaceCollection[]> {
  const db = getDb();

  type DynamicConceptRow = {
    image_id: number | string;
    image_path: string;
    ai_description: string;
    product_id: number | string;
    room_slug: string;
    confidence: number | null;
    code: string;
    name: string;
    category: string;
    size: string;
    surface: string;
    color: string;
    map_image: string;
    rank_per_room: number | string;
    rank_global: number | string;
  };

  const params: SqlValue[] = [];
  let orderClause = `
    ORDER BY 
      (ai_description <> '') DESC,
      rank_global ASC, 
      product_id ASC
  `;

  if (options?.seed != null) {
    orderClause = `ORDER BY md5(image_id::text || ':' || ?)`;
    params.push(String(options.seed));
  }

  let limitClause = "";
  if (options?.limit != null) {
    if (options.limit <= 0) {
      limitClause = ` LIMIT 0`;
    } else {
      limitClause = ` LIMIT ?`;
      params.push(options.limit);
    }
  }

  // Tuyển chọn động từ kho ảnh Concept của Vision Agents:
  // Mỗi sản phẩm (product_id) chỉ hiển thị DUY NHẤT 1 ảnh concept đại diện cho mỗi không gian (rank_per_room = 1)
  // Ưu tiên ảnh có ai_description chi tiết, độ tin cậy cao, có tag kiểm duyệt.
  const dynamicQuery = `
    WITH ranked_concepts AS (
      SELECT
        pi.id AS image_id,
        pi.path AS image_path,
        COALESCE(pi.ai_description, pi.caption, '') AS ai_description,
        pi.product_id,
        t.room_slug,
        t.confidence,
        p.code,
        p.name,
        p.category,
        p.size,
        COALESCE(p.surface, '') AS surface,
        COALESCE(p.color, '') AS color,
        COALESCE(map_img.path, p.image_path, '') AS map_image,
        ROW_NUMBER() OVER (
          PARTITION BY pi.product_id, t.room_slug
          ORDER BY 
            (t.source = 'manual') DESC,
            (pi.ai_description IS NOT NULL AND pi.ai_description <> '') DESC,
            t.confidence DESC NULLS LAST,
            pi.id ASC
        ) AS rank_per_room,
        ROW_NUMBER() OVER (
          PARTITION BY pi.product_id
          ORDER BY 
            (t.source = 'manual') DESC,
            (pi.ai_description IS NOT NULL AND pi.ai_description <> '') DESC,
            t.confidence DESC NULLS LAST,
            pi.id ASC
        ) AS rank_global
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      JOIN product_image_room_tags t ON t.product_image_id = pi.id
      LEFT JOIN product_images map_img ON map_img.product_id = p.id AND map_img.kind = 'map'
      WHERE pi.kind = 'concept'
        AND pi.is_public = 1
        AND t.room_slug NOT IN ('other', 'unknown')
    )
    SELECT *
    FROM ranked_concepts
    WHERE ${options?.seed != null ? "rank_global = 1" : "rank_per_room = 1"}
    ${orderClause}
    ${limitClause};
  `;

  try {
    const rows = await db.prepare(dynamicQuery).all<DynamicConceptRow>(...params);
    if (rows && rows.length > 0) {
      return rows.map((r) => {
        const meta = ROOM_LOOKBOOK_META[r.room_slug] || {
          title: "Không gian kiến trúc",
          tag: "01 · LOOKBOOK",
          defaultApp: "Ốp lát không gian",
          spaceType: r.room_slug,
        };
        const imageId = Number(r.image_id);
        const prodId = Number(r.product_id);

        return {
          id: imageId,
          slug: `concept-${imageId}`,
          title: meta.title,
          space_type: meta.spaceType,
          tag: meta.tag,
          description: r.ai_description || meta.defaultApp,
          image_path: r.image_path,
          materials: [
            {
              product_id: prodId,
              code: r.code,
              name: r.name,
              category: r.category,
              size: r.size,
              surface: r.surface,
              color: r.color,
              image: r.map_image,
              application_position: meta.defaultApp,
              note: r.ai_description || meta.defaultApp,
              hotspot_x: null,
              hotspot_y: null,
            },
          ],
        };
      });
    }
  } catch (err) {
    console.error("[listPublicSpaceCollections] Dynamic query error, falling back to static:", err);
  }
  return [];
}


// ─── Concept Manager (Quản trị Concept / Lookbook Hub) ──────────────────────

export type CrmConceptTag = {
  room_slug: string;
  confidence: number | null;
  source: string;
  review_status: string;
};

export type CrmConceptItem = {
  image_id: number;
  image_path: string;
  caption: string;
  ai_description: string;
  is_public: number;
  created_at: string;
  product_id: number;
  product_code: string;
  product_name: string;
  product_category: string;
  product_size: string;
  product_surface: string;
  product_color: string;
  map_image: string;
  room_tags: CrmConceptTag[];
};

export type CrmConceptFilter = {
  category?: string | null;
  room_slug?: string | null;
  is_public?: number | "all" | null;
  color?: string | null;
  search?: string | null;
  page?: number;
  limit?: number;
};
export type CrmConceptResponse = {
  items: CrmConceptItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    total: number;
    publicCount: number;
    hiddenCount: number;
    withDescCount: number;
  };
  roomStats: Record<string, number>;
};

export async function listCrmConceptImages(filter?: CrmConceptFilter): Promise<CrmConceptResponse> {
  const db = getDb();
  const page = Math.max(1, filter?.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter?.limit ?? 24));
  const offset = (page - 1) * limit;

  const conditions: string[] = ["pi.kind = 'concept'"];
  const params: SqlValue[] = [];

  // Filter by room_slug
  if (filter?.room_slug && filter.room_slug !== "all") {
    params.push(filter.room_slug);
    conditions.push(
      `EXISTS (SELECT 1 FROM product_image_room_tags t2 WHERE t2.product_image_id = pi.id AND t2.room_slug = ?)`,
    );
  }

  // Filter by is_public
  if (filter?.is_public !== undefined && filter.is_public !== null && filter.is_public !== "all") {
    params.push(Number(filter.is_public));
    conditions.push(`pi.is_public = ?`);
  }
  // Filter by category (nhóm gạch)
  if (filter?.category && filter.category !== "all") {
    params.push(filter.category);
    conditions.push(`p.category = ?`);
  }


  // Filter by color palette
  if (filter?.color && filter.color !== "all") {
    const palette = COLOR_PALETTES.find((p) => p.id === filter.color);
    if (palette && palette.keywords.length > 0) {
      const orClauses = palette.keywords.map(() => "p.color ILIKE ?").join(" OR ");
      palette.keywords.forEach((kw) => params.push(`%${kw}%`));
      conditions.push(`(${orClauses})`);
    }
  }

  // Filter by search (product code, name, caption, ai_description)
  if (filter?.search && filter.search.trim()) {
    const pattern = `%${filter.search.trim()}%`;
    params.push(pattern, pattern, pattern, pattern);
    conditions.push(
      `(p.code ILIKE ? OR p.name ILIKE ? OR pi.ai_description ILIKE ? OR pi.caption ILIKE ?)`,
    );
  }
  const whereSql = conditions.join(" AND ");

  // 1. Get total matching count
  const countSql = `
    SELECT COUNT(DISTINCT pi.id) AS count
    FROM product_images pi
    JOIN products p ON p.id = pi.product_id
    WHERE ${whereSql}
  `;
  const countRes = await db.prepare(countSql).get<{ count: number | string }>(...params);
  const total = Number(countRes?.count ?? 0);

  // 2. Fetch paginated items with aggregated room_tags
  const dataSql = `
    SELECT
      pi.id AS image_id,
      pi.path AS image_path,
      pi.caption,
      COALESCE(pi.ai_description, '') AS ai_description,
      pi.is_public,
      pi.created_at,
      p.id AS product_id,
      p.code AS product_code,
      p.name AS product_name,
      p.category AS product_category,
      p.size AS product_size,
      COALESCE(p.surface, '') AS product_surface,
      COALESCE(p.color, '') AS product_color,
      COALESCE(map_img.path, p.image_path, '') AS map_image,
      COALESCE(
        json_agg(
          json_build_object(
            'room_slug', t.room_slug,
            'confidence', t.confidence,
            'source', t.source,
            'review_status', t.review_status
          )
        ) FILTER (WHERE t.room_slug IS NOT NULL),
        '[]'
      ) AS room_tags
    FROM product_images pi
    JOIN products p ON p.id = pi.product_id
    LEFT JOIN product_image_room_tags t ON t.product_image_id = pi.id
    LEFT JOIN product_images map_img ON map_img.product_id = p.id AND map_img.kind = 'map'
    WHERE ${whereSql}
    GROUP BY pi.id, pi.path, pi.caption, pi.ai_description, pi.is_public, pi.created_at,
             p.id, p.code, p.name, p.category, p.size, p.surface, p.color, map_img.path
    ORDER BY (pi.ai_description <> '') DESC, pi.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const rawItems = await db.prepare(dataSql).all<{
    image_id: number | string;
    image_path: string;
    caption: string;
    ai_description: string;
    is_public: number;
    created_at: string;
    product_id: number | string;
    product_code: string;
    product_name: string;
    product_category: string;
    product_size: string;
    product_surface: string;
    product_color: string;
    map_image: string;
    room_tags: string | CrmConceptTag[];
  }>(...params);

  const items: CrmConceptItem[] = (rawItems ?? []).map((r) => ({
    image_id: Number(r.image_id),
    image_path: r.image_path,
    caption: r.caption || "",
    ai_description: r.ai_description || "",
    is_public: Number(r.is_public ?? 1),
    created_at: r.created_at || "",
    product_id: Number(r.product_id),
    product_code: r.product_code,
    product_name: r.product_name,
    product_category: r.product_category,
    product_size: r.product_size,
    product_surface: r.product_surface,
    product_color: r.product_color,
    map_image: r.map_image,
    room_tags: typeof r.room_tags === "string" ? JSON.parse(r.room_tags) : r.room_tags || [],
  }));

  // 3. Compute overall stats
  const statsRes = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE is_public = 1) AS public_count,
         COUNT(*) FILTER (WHERE is_public = 0) AS hidden_count,
         COUNT(*) FILTER (WHERE ai_description <> '') AS with_desc_count
       FROM product_images
       WHERE kind = 'concept'`,
    )
    .get<{
      total: number | string;
      public_count: number | string;
      hidden_count: number | string;
      with_desc_count: number | string;
    }>();

  // 4. Compute room stats
  const roomStatsRows = await db
    .prepare(
      `SELECT t.room_slug, COUNT(DISTINCT pi.id) AS count
       FROM product_images pi
       JOIN product_image_room_tags t ON t.product_image_id = pi.id
       WHERE pi.kind = 'concept'
       GROUP BY t.room_slug`,
    )
    .all<{ room_slug: string; count: number | string }>();

  const roomStats: Record<string, number> = {};
  (roomStatsRows ?? []).forEach((row) => {
    roomStats[row.room_slug] = Number(row.count);
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    stats: {
      total: Number(statsRes?.total ?? 0),
      publicCount: Number(statsRes?.public_count ?? 0),
      hiddenCount: Number(statsRes?.hidden_count ?? 0),
      withDescCount: Number(statsRes?.with_desc_count ?? 0),
    },
    roomStats,
  };
}

export async function setConceptImagePublic(id: number, is_public: number): Promise<{ ok: true; is_public: number }> {
  const db = getDb();
  const val = is_public ? 1 : 0;
  await db.prepare("UPDATE product_images SET is_public = ? WHERE id = ?").run(val, id);
  return { ok: true, is_public: val };
}

export async function updateConceptDescription(id: number, ai_description: string): Promise<{ ok: true; ai_description: string }> {
  const db = getDb();
  const desc = clip(ai_description, 2000);
  await db.prepare("UPDATE product_images SET ai_description = ? WHERE id = ?").run(desc, id);
  return { ok: true, ai_description: desc };
}

export async function demoteConceptImage(id: number): Promise<{ ok: true }> {
  const db = getDb();
  // Chuyển loại ảnh về 'normal' (không còn là concept nữa)
  await db.prepare("UPDATE product_images SET kind = 'normal' WHERE id = ?").run(id);
  return { ok: true };
}
