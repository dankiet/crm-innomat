import type { ImageRoomTagSlug, ProductImageRoomTag } from "@/lib/types";
import { IMAGE_ROOM_TAGS } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  value?: ImageRoomTagSlug[];
  roomTags?: ProductImageRoomTag[];
  disabled?: boolean;
  onChange: (value: ImageRoomTagSlug[]) => void;
};

export function ImageRoomTagPicker({ value = [], roomTags, disabled = false, onChange }: Props) {
  function toggle(slug: ImageRoomTagSlug) {
    const next = value.includes(slug) ? value.filter((item) => item !== slug) : [...value, slug];
    onChange(next);
  }

  const hasVisionTag = roomTags?.some((t) => t.source === "vision");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Bối cảnh phòng
        </p>
        {hasVisionTag ? (
          <span className="rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-medium text-emerald-600">
            AI Vision
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {IMAGE_ROOM_TAGS.map((tag) => {
          const active = value.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(tag.id)}
              className={cn(
                "rounded-md px-1.5 py-1 text-[10px] font-medium ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-terracotta text-white ring-terracotta"
                  : "bg-card text-muted-foreground ring-black/10 hover:bg-surface-strong hover:text-foreground",
              )}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
