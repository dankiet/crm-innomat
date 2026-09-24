/**
 * Asset Usage Dialog — trả lời "Ảnh này đang được dùng ở đâu?" ngay trong
 * Media Workspace (không rời /luu-tru). Không còn phần lifecycle/GC.
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
import type { FlatMediaItem } from "@/db/media.server";
import type { ImageReference } from "@/db/image-references.server";

const ROLE_LABEL: Record<ImageReference["role"], string> = {
  product_image: "Ảnh sản phẩm",
  product: "Ảnh đại diện sản phẩm",
  mapping: "Đề xuất vật liệu",
  custom_mapping_product: "Đề xuất vật liệu (sản phẩm riêng)",
  lp_hero: "Hero Landing Page",
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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ảnh đang được dùng ở đâu?</DialogTitle>
          <DialogDescription>
            #{item.id} · {item.product_code} · {item.product_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-surface-strong">
              {item.path ? (
                <img src={item.path} alt={item.product_name} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 space-y-0.5 text-xs">
              <p className="font-semibold text-foreground">{item.product_name}</p>
              <p className="text-muted-foreground">
                {item.product_code} · Phân loại:{" "}
                {item.kind === "map" ? "MAP" : item.kind === "concept" ? "Concept" : "Ảnh thường"}
                {item.kind === "map"
                  ? item.product_is_public === 1
                    ? " · Hiện trên Thư viện"
                    : " · Ẩn Thư viện"
                  : ""}
              </p>
              {item.kind === "concept" ? (
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

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Layers3 className="size-3.5" />
              Đang được dùng ở đâu
            </p>
            {references.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
                Không còn nơi nào khác dùng ảnh này. File vẫn nằm trong kho lưu trữ cho tới khi
                bạn xoá thủ công.
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
