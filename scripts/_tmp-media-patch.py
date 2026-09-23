import io

root = r"C:/Users/dankiet/orca/workspaces/CRM/seapen"
p = root + "/src/db/media.server.ts"
s = io.open(p, encoding="utf-8").read()

def rep(old, new, expect=1):
    global s
    n = s.count(old)
    assert n == expect, f"media {expect}/{n} [{old[:60]}]"
    s = s.replace(old, new)

rep('export type FlatMediaSort = "newest" | "oldest" | "code_asc" | "code_desc";',
    'export type FlatMediaSort = "newest" | "oldest" | "code_asc" | "code_desc" | "priority";')

rep("""export async function listFlatMediaImages(opts?: {
  tab?: FlatMediaTab;
  category?: string;
  search?: string;
  roomSlug?: ImageRoomTagSlug;
  publicFilter?: "all" | "public" | "hidden";
  colors?: string[];
  surfaces?: string[];
  shapes?: string[];
  textures?: string[];
  collections?: string[];
  sort?: FlatMediaSort;
  page?: number;
  pageSize?: number;
}) {""",
"""export type FlatMediaUsage = "all" | "in_use" | "unused" | "expiring";
export async function listFlatMediaImages(opts?: {
  tab?: FlatMediaTab;
  category?: string;
  search?: string;
  roomSlug?: ImageRoomTagSlug;
  publicFilter?: "all" | "public" | "hidden";
  colors?: string[];
  surfaces?: string[];
  shapes?: string[];
  textures?: string[];
  collections?: string[];
  sort?: FlatMediaSort;
  page?: number;
  pageSize?: number;
  usage?: FlatMediaUsage;
  selected?: "yes" | "no";
}) {""")

rep("""  } else if (tab === "unassigned") {
    listWhere.push("(i.kind = 'normal' OR i.kind IS NULL OR i.kind = '')");
  }

  const listWhereSql = `WHERE ${listWhere.join(" AND ")}`;""",
"""  } else if (tab === "unassigned") {
    listWhere.push("(i.kind = 'normal' OR i.kind IS NULL OR i.kind = '')");
  }

  // Tuyển chọn Trang chủ — secondary filter (không phải tab chính)
  if (opts?.selected === "yes") {
    listWhere.push("p.featured_rank IS NOT NULL AND p.featured_rank BETWEEN 1 AND 12");
  } else if (opts?.selected === "no") {
    listWhere.push("p.featured_rank IS NULL");
  }

  // Sử dụng / lifecycle — reuse Reference Resolver (same 7 nguồn).
  const usage = opts?.usage ?? "all";
  if (usage !== "all") {
    const otherRefs = otherReferencesExistSql("i", "substring(i.path from '([^/]+)$')");
    if (usage === "in_use") {
      listWhere.push(`EXISTS ${otherRefs}`);
    } else {
      const notOther = `NOT EXISTS ${otherRefs}`;
      const pending = "ast.orphaned_at IS NOT NULL AND ast.gc_completed_at IS NULL";
      if (usage === "expiring") {
        listWhere.push(`${notOther} AND ${pending}`);
      } else {
        listWhere.push(`${notOther} AND NOT (${pending})`);
      }
    }
  }

  const listWhereSql = `WHERE ${listWhere.join(" AND ")}`;""")

rep("""  } else if (sort === "code_desc") {
    orderBySql = "p.code DESC, i.is_primary DESC, i.sort_order ASC, i.id ASC";
  }""",
"""  } else if (sort === "code_desc") {
    orderBySql = "p.code DESC, i.is_primary DESC, i.sort_order ASC, i.id ASC";
  } else if (sort === "priority") {
    orderBySql = "p.featured_rank ASC NULLS LAST, i.is_primary DESC, i.id ASC";
  }""")

rep("""        FROM product_images i
        JOIN products p ON p.id = i.product_id
        ${listWhereSql}
        ORDER BY p.featured_rank ASC, (i.kind = 'map') DESC, i.is_primary DESC, i.id ASC""",
"""        FROM product_images i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN image_assets ast ON ast.storage_key = substring(i.path from '([^/]+)$')
        ${listWhereSql}
        ORDER BY p.featured_rank ASC, (i.kind = 'map') DESC, i.is_primary DESC, i.id ASC""")
rep("""        FROM product_images i
        JOIN products p ON p.id = i.product_id
        ${listWhereSql}
        ORDER BY ${orderBySql}""",
"""        FROM product_images i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN image_assets ast ON ast.storage_key = substring(i.path from '([^/]+)$')
        ${listWhereSql}
        ORDER BY ${orderBySql}""")

rep('import { getDb, type SqlValue } from "./index.server";',
    'import { getDb, type SqlValue } from "./index.server";\nimport { otherReferencesExistSql } from "@/db/image-references.server";')
if "otherReferencesExistSql" not in s:
    raise SystemExit("import not wired")

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("media.server ok")