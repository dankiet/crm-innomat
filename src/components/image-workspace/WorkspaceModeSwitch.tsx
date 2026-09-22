/**
 * Image Workspace — mode switch dùng chung cho cả hai route (/luu-tru = Kho ảnh,
 * /khong-gian = Lookbook). Giữ query dùng chung khi chuyển mode:
 *   q (search) + ánh xạ roomSlug ↔ room (cùng vocabulary IMAGE_ROOM_TAGS).
 * Legacy URLs không đổi; deep-link mỗi mode vẫn chạy như cũ.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Store, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageRoomTagSlug } from "@/lib/types";

const MODE_LABEL = {
  assets: "Kho ảnh",
  lookbook: "Lookbook",
} as const;

export function WorkspaceModeSwitch({ mode }: { mode: keyof typeof MODE_LABEL }) {
  const navigate = useNavigate();
  const search = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const q = typeof search.q === "string" ? search.q : undefined;
  const room = typeof search.room === "string" ? search.room : undefined;
  const roomSlug = typeof search.roomSlug === "string" ? search.roomSlug : undefined;

  const go = (target: "assets" | "lookbook") => {
    navigate({
      to: target === "assets" ? "/luu-tru" : "/khong-gian",
      search:
        target === "assets"
          ? { q, roomSlug: (room ?? roomSlug) as ImageRoomTagSlug | undefined }
          : { q, room: roomSlug ?? room },
    });
  };

  const itemClass = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
      active
        ? "bg-foreground text-background shadow-xs"
        : "text-muted-foreground hover:text-foreground hover:bg-surface-strong",
    );

  return (
    <div
      role="tablist"
      aria-label="Image Workspace — chế độ làm việc"
      className="inline-flex items-center rounded-full border border-border/80 bg-surface-strong/60 p-0.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "assets"}
        className={itemClass(mode === "assets")}
        onClick={() => go("assets")}
        aria-label="Kho ảnh (Asset mode)"
      >
        <Store className="size-3.5" />
        <span>Kho ảnh</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "lookbook"}
        className={itemClass(mode === "lookbook")}
        onClick={() => go("lookbook")}
        aria-label="Lookbook (Concept mode)"
      >
        <Layers3 className="size-3.5" />
        <span>Lookbook</span>
      </button>
    </div>
  );
}
