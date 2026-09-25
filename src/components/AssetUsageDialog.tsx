/**
 * Asset Usage Dialog — trả lời "MediaAsset này đang được dùng ở đâu?" ngay trong
 * Media Workspace (không rời /luu-tru). Asset-centric: 1 file = 1 MediaAsset;
 * các usage gom theo nhóm (product/lookbook/featured/hero/mapping).
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Layers3, Eye, EyeOff, Link as LinkIcon } from "lucide-react";
import { memo } from "react";
import type { FlatMediaItem, FlatMediaUsage } from "@/db/media.server";
import type { ImageReference } from "@/db/image-references.server";

const ROLE_LABEL: Record<ImageReference["role"], string> = {
  product_image: "Ảnh sản phẩm",
  product: "Ảnh đại diện sản phẩm",
  mapping: "Đề xuất vật liệu",
  custom_mapping_product: "Đề xuất vật liệu (sản phẩm riêng)",
  lp_hero: "Hero Landing Page",
};

const STATUS_LABEL: Record<FlatMediaUsage, string> = {
  used: "In use",
  unused: "Not in use",
};

const GROUP_LABEL: Record<keyof FlatMediaItem["usage_groups"], string> = {
  product: "Sản phẩm",
  lookbook: "Lookbook",
  featured: "Tuyển chọn",
  hero: "Hero",
  mapping: "Đề xuất vật liệu",
};

function RefRow({ ref }: { ref: ImageReference }) {
  const owner = ref.owner?.name ?? ref.owner?.code;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-surface-strong/50 px-2.5 py-1.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">
          {ref.owner?.code ? `${ref.owner.code} · ` : ""}
          {owner || ROLE_LABEL[ref.role]}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {ROLE_LABEL[ref.role]}
          {ref.label ? ` · ${ref.label}` : ""}
        </p>
      </div>
      {ref.href ? (
        <a
          href={ref.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/80 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-strong transition-colors"
        >
          <LinkIcon className="size-3" />
          Mở
        </a>
      ) : null}
    </div>
  );
}

export const AssetUsageDialog = memo(function AssetUsageDialog({
  open,
  onClose,
  item,
  references,
}: {
  open: boolean;
  onClose: () => void;
  item: FlatMediaItem | null;
  references: ImageReference[];
}) {
  if (!item) return null;
  const groupEntries = (Object.keys(GROUP_LABEL) as (keyof FlatMediaItem["usage_groups"])[])
    .map((k) => ({ key: k, label: GROUP_LABEL[k], count: item.usage_groups[k] ?? 0 }))
    .filter((g) => g.count > 0);
  const hasProductUsage = item.id > 0;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>MediaAsset đang được dùng ở đâu?</DialogTitle>
          <DialogDescription className="font-mono">
            #{item.storage_key} · {item.status ? STATUS_LABEL[item.status] : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface-strong">
              {item.path ? (
                <img src={item.path} alt={item.storage_key} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 space-y-0.5 text-xs">
              <p className="font-semibold text-foreground">
                {hasProductUsage ? item.product_name : `MediaAsset #${item.asset_id}`}
              </p>
              <p className="text-muted-foreground">
                {hasProductUsage
                  ? `${item.product_code} · Phân loại: ${
                      item.kind === "map" ? "MAP" : item.kind === "concept" ? "Concept" : "Ảnh thường"
                    }`
                  : "Không thuộc sản phẩm cụ thể"}
                {hasProductUsage && item.kind === "map"
                  ? item.product_is_public === 1
                    ? " · Hiện trên Thư viện"
                    : " · Ẩn Thư viện"
                  : ""}
              </p>
              {hasProductUsage && item.kind === "concept" ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                  {item.image_is_public === 1 ? (
                    <Eye className="size-3.5 text-emerald-600" />
                  ) : (
                    <EyeOff className="size-3.5 text-muted-foreground" />
                  )}
                  Lookbook: {item.image_is_public === 1 ? "Hiển thị" : "Ẩn"}
                </p>
              ) : null}
              {item.room_tags.length > 0 ? (
                <p className="text-muted-foreground">
                  Phòng: {item.room_tags.map((t) => t.room_slug).join(", ")}
                </p>
              ) : null}
            </div>
          </div>

          {/* Tóm tắt usage theo nhóm */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Layers3 className="size-3.5" />
              Usage theo nhóm
            </p>
            {groupEntries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
                Không nơi nào dùng file này. File vẫn nằm trong kho lưu trữ cho tới khi bạn xoá
                thủ công.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groupEntries.map((g) => (
                  <span
                    key={g.key}
                    className="inline-flex items-center rounded-md border border-border/80 bg-surface-strong/60 px-2 py-0.5 text-[11px] font-semibold text-foreground"
                  >
                    {g.label}: {g.count}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Layers3 className="size-3.5" />
              Chi tiết nơi đang dùng
            </p>
            {references.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
                Không có tham chiếu chi tiết (usage được gom theo bảng mới).
              </p>
            ) : (
              <div className="space-y-1.5">
                {references.map((r, i) => (
                  <RefRow key={`${r.role}-${r.id}-${i}`} ref={r} />
                ))}
              </div>
            )}
            {references.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {references.length} nơi đang dùng.
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});