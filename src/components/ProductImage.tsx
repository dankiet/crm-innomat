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
};

/**
 * Product photo or a consistent "Chưa có ảnh" placeholder.
 * Default object-contain so wide strips (gạch thẻ) and studio shots
 * (white bg) look consistent in square cards.
 */
export function ProductImage({
  src,
  alt = "",
  className,
  placeholderClassName,
  code,
  fit = "contain",
}: Props) {
  const hasImage = Boolean(src && src.trim());

  if (hasImage) {
    return (
      <img
        src={src!}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "w-full h-full",
          fit === "cover" ? "object-cover" : "object-contain object-center",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full h-full grid place-items-center bg-white text-muted-foreground",
        placeholderClassName,
        className,
      )}
      role="img"
      aria-label="Chưa có ảnh"
    >
      <div className="flex flex-col items-center gap-1.5 px-2 text-center">
        <ImageOff className="size-6 opacity-40" strokeWidth={1.5} />
        <span className="text-[11px] font-medium tracking-wide">
          Chưa có ảnh
        </span>
        {code ? (
          <span className="font-mono text-[10px] opacity-60 truncate max-w-full">
            {code}
          </span>
        ) : null}
      </div>
    </div>
  );
}
