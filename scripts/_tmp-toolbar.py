import io

root = r"C:/Users/dankiet/orca/workspaces/CRM/seapen"
p = root + "/src/routes/_app.luu-tru.tsx"
s = io.open(p, encoding="utf-8").read()

def rep(old, new, expect=1):
    global s
    n = s.count(old)
    assert n == expect, f"lt {expect}/{n} [{old[:50]}]"
    s = s.replace(old, new)

rep('title="Kho lưu trữ ảnh & Media"', 'title="Media"')
rep('          {/* Search bar */}\n          <div className="relative flex-1 min-w-0 max-w-md">',
    '          {/* Search bar — 1 hàng full-width như tab Sản phẩm */}\n          <div className="relative w-full min-w-0">')
rep('              className="h-9 w-full text-xs pl-9 pr-8 rounded-full bg-card border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60 shadow-2xs"',
    '              className="h-10 w-full text-sm pl-10 pr-9 rounded-full bg-transparent border border-border/80 outline-none focus:border-terracotta/50 focus:ring-2 focus:ring-terracotta/15 text-foreground placeholder:text-muted-foreground/60"')

# bỏ Nhóm pills (giữ `</div>` cuối hàng)
a = s.find("          {/* Nhóm sản phẩm (Category Pills) */}")
if a != -1:
    b = s.find("            })}\n          </div>", a)
    assert b != -1, "pills close"
    end = b + len("            })}")
    # sau `})}` là `\n          </div>` đóng list — giữ lại; chỉ xoá tới hết `})}`
    s = s[:a] + s[end:]
    print("pills removed")

# Nhóm thành FilterChip đầu hàng facets
rep('<FilterChip label="Màu" count={selectedColors.length}>',
'''<FilterChip label="Nhóm" count={category !== "all" ? 1 : 0}>
            <MultiSelectFilter
              title="Chọn nhóm danh mục"
              options={PRODUCT_GROUPS.filter((g) => g.slug !== "tat-ca").map((g) => ({
                value: g.category,
                label: g.label,
              }))}
              selected={category !== "all" ? [category] : []}
              onChange={(next) => {
                const picked = next[next.length - 1];
                patchFilters({
                  category: picked ?? undefined,
                  colors: undefined,
                  surfaces: undefined,
                  shapes: undefined,
                  textures: undefined,
                  collections: undefined,
                });
              }}
              searchable
            />
          </FilterChip>
          <FilterChip label="Màu" count={selectedColors.length}>''')

# Usage UI: chỉ 3 nhãn
a = s.find("            {/* Sử dụng (usage / lifecycle) — secondary */}")
b = s.find("            {/* Tuyển chọn Trang chủ (#1–#12) — secondary */}")
assert a != -1 and b != -1 and a < b
new_usage = """            {/* Sử dụng (usage / lifecycle) — secondary: Đang dùng / Chờ xóa */}
            <div
              className="flex items-center gap-0.5 bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs"
              title="Lọc theo nơi đang dùng (reference resolver) & lifecycle GC"
            >
              {[
                { key: "all", label: "Sử dụng" },
                { key: "in_use", label: "Đang dùng" },
                { key: "expiring", label: "Chờ xóa" },
              ].map((opt) => {
                const activeU = usage === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      patchFilters({
                        usage: opt.key === "all" ? undefined : (opt.key as "in_use" | "expiring"),
                      })
                    }
                    className={cn(
                      "rounded-full px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                      activeU
                        ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

"""
s = s[:a] + new_usage + s[b:]

# Tuyển chọn — chỉ tab MAP
a = s.find("            {/* Tuyển chọn Trang chủ (#1–#12) — secondary */}")
b = s.find("            {/* Sắp xếp */}", a)
assert a != -1 and b != -1
new_sel = """            {/* Tuyển chọn Trang chủ (#1–#12) — chỉ hợp lệ ở tab MAP */}
            {tab === "map" ? (
              <div
                className="flex items-center gap-0.5 bg-surface-strong/50 p-0.5 rounded-full border border-border/80 shrink-0 text-xs"
                title="Lọc theo Vị trí Tuyển chọn Trang chủ (#1–#12)"
              >
                {[
                  { key: "all", label: "Tuyển chọn" },
                  { key: "yes", label: "Đã chọn" },
                  { key: "no", label: "Chưa chọn" },
                ].map((opt) => {
                  const activeS = selectedVal === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        patchFilters({ selected: opt.key === "all" ? undefined : (opt.key as "yes" | "no") })
                      }
                      className={cn(
                        "rounded-full px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                        activeS
                          ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-black/5"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-strong/60",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

"""
s = s[:a] + new_sel + s[b:]

# tab click: clear selected (chỉ map)
rep("""                    patchFilters({ tab: t.key === "all" ? undefined : t.key, roomSlug: t.key !== "concept" ? undefined : roomSlug === "all" ? undefined : roomSlug });
                    clearSelection();""",
"""                    patchFilters({ tab: t.key === "all" ? undefined : t.key, roomSlug: t.key !== "concept" ? undefined : roomSlug === "all" ? undefined : roomSlug, selected: undefined });
                    clearSelection();""")

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("toolbar restructure ok")