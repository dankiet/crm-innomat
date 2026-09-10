type BrandMarkProps = {
  className?: string;
  variant?: "light" | "dark";
  size?: number;
};

export function BrandMark({ className, variant = "light", size = 32 }: BrandMarkProps) {
  const isLight = variant === "light";
  const terracotta = "#D04A2B";
  const darkSlot = isLight ? "#1A333B" : "#14252B";
  const floor = isLight ? "#F6EFE9" : "#E2DAD0";
  const floorBorder = isLight ? "none" : "rgba(31, 43, 51, 0.25)";
  const greenLine = isLight ? "#5B9B72" : "#3F7452";

  return (
    <svg
      className={className ?? "brand-mark"}
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="em bán gạch — logo biểu tượng không gian kiến trúc và vật liệu đất nung"
    >
      <g id="em-ban-gach-brandmark">
        {/* Floor Triangle Plane */}
        <polygon
          points="20.0,92.0 53.0,71.8 57.3,74.2 57.3,92.0"
          fill={floor}
          stroke={floorBorder}
          strokeWidth={isLight ? 0 : 0.5}
        />

        {/* Central Dark Vertical Slot */}
        <polygon
          points="53.0,28.2 57.3,25.8 57.3,74.2 53.0,71.8"
          fill={darkSlot}
        />
        {/* Dark slot top extension */}
        <polygon
          points="53.0,28.2 56.6,26.2 56.6,20.0 53.0,28.2"
          fill={darkSlot}
        />
        <rect x="56.6" y="19.8" width="0.7" height="8.4" fill={darkSlot} />

        {/* Left Terracotta Slab */}
        <polygon
          points="20.0,46.2 53.0,28.2 53.0,71.8 20.0,92.0"
          fill={terracotta}
        />

        {/* Right Terracotta Slab */}
        <polygon
          points="57.3,20.8 80.5,7.8 80.5,92.0 57.3,92.0"
          fill={terracotta}
        />

        {/* Architectural Construction Drafting Lines (Fine Green Lines) */}
        <line
          x1="19.6"
          y1="46.0"
          x2="53.2"
          y2="27.9"
          stroke={greenLine}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <line
          x1="56.9"
          y1="20.6"
          x2="80.7"
          y2="7.6"
          stroke={greenLine}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <line
          x1="56.6"
          y1="19.8"
          x2="57.4"
          y2="19.8"
          stroke={greenLine}
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <line
          x1="56.6"
          y1="19.8"
          x2="56.6"
          y2="24.0"
          stroke={greenLine}
          strokeWidth="0.6"
        />
        <line
          x1="19.6"
          y1="45.8"
          x2="19.6"
          y2="48.0"
          stroke={greenLine}
          strokeWidth="0.6"
        />
      </g>
    </svg>
  );
}
