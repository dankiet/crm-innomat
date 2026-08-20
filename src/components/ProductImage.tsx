import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Fit = "contain" | "cover";

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Extra classes for the placeholder box */
  placeholderClassName?: string;
  /** Show code under "Chưa có ảnh" when no image */
  code?: string;
  /**
   * contain (default): full tile visible, padded — good for map/catalog
   * cover: fill crop — only for tight thumbs if needed
   */
  fit?: Fit;
  /**
   * Browser load strategy. `"lazy"` (default) defers off-screen images —
   * good for large catalogs. Use `"eager"` for small bounded grids/dialogs
   * where images must appear immediately (e.g. gallery/library views).
   */
  loading?: "lazy" | "eager";
};

/**
 * Product photo or a consistent "Chưa có ảnh" placeholder.
 * Default object-contain so wide strips (gạch thẻ) and studio shots
 * (white bg) look consistent in square cards.
 *
 * Tracks load failure: broken/unreachable URLs used to leave a blank white
 * <img> (no useful alt, no onError) which looked like “ảnh trắng”.
 * While loading, shows a soft neutral pulse instead of pure white.
 */
export function ProductImage({
  src,
  alt = "",
  className,
  placeholderClassName,
  code,
  fit = "contain",
  loading = "lazy",
}: Props) {
  const clean = src?.trim() || "";
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset error/loaded state when src changes (same component instance reused in grids).
  useEffect(() => {
    setBrokenFor(null);
    setLoadedFor(null);
  }, [clean]);

  /**
   * Cached images can be `complete` before React attaches onLoad, leaving the
   * tile stuck at opacity-0. Re-check the DOM node after mount/src change.
   */
  useEffect(() => {
    if (!clean) return;
    const node = imgRef.current;
    if (!node) return;
    if (node.complete) {
      if (node.naturalWidth > 0) setLoadedFor(clean);
      else setBrokenFor(clean);
    }
  }, [clean]);

  const broken = Boolean(clean) && brokenFor === clean;
  const hasImage = Boolean(clean) && !broken;
  const showLoaded = hasImage && loadedFor === clean;

  if (hasImage) {
    return (
      <span
        className={cn(
          "relative block h-full w-full overflow-hidden",
          // Neutral tile while bytes are in-flight — avoids a pure white hole
          // that reads as “missing image” on library cards.
          !showLoaded && "bg-[#f3f1ed]",
          className,
        )}
      >
        {!showLoaded ? (
          <span
            className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-[#f3f1ed] via-[#ebe8e2] to-[#f3f1ed]"
            aria-hidden
          />
        ) : null}
        <img
          key={clean}
          ref={imgRef}
          src={clean}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setLoadedFor(clean)}
          onError={() => setBrokenFor(clean)}
          className={cn(
            "relative h-full w-full transition-opacity duration-200",
            showLoaded ? "opacity-100" : "opacity-0",
            fit === "cover" ? "object-cover object-center" : "object-contain object-center",
          )}
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center bg-white text-muted-foreground",
        placeholderClassName,
        className,
      )}
      role="img"
      aria-label={broken ? "Không tải được ảnh" : "Chưa có ảnh"}
    >
      <div className="flex flex-col items-center gap-1.5 px-2 text-center">
        <ImageOff className="size-6 opacity-40" strokeWidth={1.5} />
        <span className="text-[11px] font-medium tracking-wide">
          {broken ? "Lỗi tải ảnh" : "Chưa có ảnh"}
        </span>
        {code ? (
          <span className="max-w-full truncate font-mono text-[10px] opacity-60">
            {code}
          </span>
        ) : null}
      </div>
    </div>
  );
}
