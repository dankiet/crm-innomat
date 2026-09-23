import io

root = r"C:/Users/dankiet/orca/workspaces/CRM/seapen"
p = root + "/src/routes/_app.luu-tru.tsx"
s = io.open(p, encoding="utf-8").read()

def rep(old, new, expect=1):
    global s
    n = s.count(old)
    assert n == expect, f"lt {expect}/{n} [{old[:50]}]"
    s = s.replace(old, new)

# A) derived: usage default Active; bỏ selectedVal + statusFilterActiveCount (status segmented)
rep('  const usage = searchParams.usage ?? "all";', '  const usage = searchParams.usage ?? "in_use";')
rep("  const selectedVal = tab === \"featured\" ? \"yes\" : (searchParams.selected ?? \"all\");\n", "")
rep("""  const currentSortOption = SORT_OPTIONS.find((s) => s.key === sort) ?? SORT_OPTIONS[0]!;
  const statusFilterActiveCount =
    (usage !== "all" ? 1 : 0) +
    (tab !== "featured" && searchParams.selected != null ? 1 : 0);""",
"""  const currentSortOption = SORT_OPTIONS.find((s) => s.key === sort) ?? SORT_OPTIONS[0]!;""")

rep("""    colors: selectedColors.length ? selectedColors : undefined,
    surfaces: selectedSurfaces.length ? selectedSurfaces : undefined,
    shapes: selectedShapes.length ? selectedShapes : undefined,
    textures: selectedTextures.length ? selectedTextures : undefined,
    collections: selectedCollections.length ? selectedCollections : undefined,
    sort,
    page,
    pageSize,
  },""",
"""    colors: selectedColors.length ? selectedColors : undefined,
    surfaces: selectedSurfaces.length ? selectedSurfaces : undefined,
    shapes: selectedShapes.length ? selectedShapes : undefined,
    textures: selectedTextures.length ? selectedTextures : undefined,
    collections: selectedCollections.length ? selectedCollections : undefined,
    sort,
    page,
    pageSize,
    usage,
    selected: searchParams.selected ?? undefined,
  },""")

# C) effect deps: usage + selected
rep("""  }, [tab, category, roomSlug, publicFilter, searchParams.colors, searchParams.surfaces, searchParams.shapes, searchParams.textures, searchParams.collections, sort, searchParams.q, page, pageSize]);""",
"""  }, [tab, category, roomSlug, publicFilter, searchParams.colors, searchParams.surfaces, searchParams.shapes, searchParams.textures, searchParams.collections, sort, searchParams.q, searchParams.usage, searchParams.selected, page, pageSize]);""")

# D) bỏ state status popover
rep("  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);\n", "")

# E) TABS labels EN
rep('  { key: "all", label: "All", countKey: "all" },', '  { key: "all", label: "All", countKey: "all" },')
rep('  { key: "map", label: "MAP", countKey: "map" },', '  { key: "map", label: "MAP", countKey: "map" },')
rep('  { key: "concept", label: "Concept", countKey: "concept" },', '  { key: "concept", label: "Lookbook", countKey: "concept" },')
rep('  { key: "unassigned", label: "Chưa gán", countKey: "unassigned" },', '  { key: "unassigned", label: "Uncategorized", countKey: "unassigned" },')

# F) row: ẩn featured, to/byen chip
rep("            {TABS.map((t) => {", "            {TABS.filter((t) => t.key !== \"featured\").map((t) => {")
rep('"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer",',
    '"inline-flex items-center min-w-[76px] justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-all cursor-pointer",')

# G) thay popover status + selection bằng segmented Active/To Delete
a = s.find("            {/* Bộ lọc Trạng thái / Vòng đời (Popover gộp thay cho 2 dải pill rời) */}")
b = s.find("            {/* Sắp xếp Popover gọn gàng */}", a)
assert a != -1 and b != -1 and a < b
new_status = """            {/* Status — segmented: Active | To Delete (mặc định Active) */}
            <div
              className="flex items-center gap-0.5 bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs"
              title="Lọc theo trạng thái sử dụng: Active = còn được dùng nơi khác; To Delete = không còn dùng ở nơi khác (sẽ vào GC sau khi xoá bản ghi cuối)"
            >
              <button
                type="button"
                onClick={() => patchFilters({ usage: undefined })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                  usage === "in_use"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                )}
                aria-pressed={usage === "in_use"}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => patchFilters({ usage: "expiring" })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer",
                  usage === "expiring"
                    ? "bg-terracotta text-white shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                )}
                aria-pressed={usage === "expiring"}
              >
                To Delete
              </button>
            </div>

"""
s = s[:a] + new_status + s[b:]

# I) hasActiveFilters: usage default active → chỉ tính khi khác active
rep("""    usage !== "all" ||
    (tab !== "all" && tab !== "featured") ||
    (searchParams.selected != null)""",
"""    usage !== "in_use" ||
    (tab !== "all" && tab !== "featured") ||
    (searchParams.selected != null)""")

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("luu-tru UI patch ok")