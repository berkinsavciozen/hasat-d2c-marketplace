import wordmarkInk from "@/assets/brand/hasat-wordmark.svg?url";
import wordmarkWhite from "@/assets/brand/hasat-wordmark-white.svg?url";
import monogramInk from "@/assets/brand/hasat-monogram.svg?url";
import monogramWhite from "@/assets/brand/hasat-monogram-white.svg?url";
import lockupInk from "@/assets/brand/hasat-lockup.svg?url";
import lockupWhite from "@/assets/brand/hasat-lockup-white.svg?url";

export type BrandLogoVariant = "wordmark" | "monogram" | "lockup";
export type BrandLogoTone = "ink" | "white";

const SOURCES: Record<BrandLogoVariant, Record<BrandLogoTone, string>> = {
  wordmark: { ink: wordmarkInk, white: wordmarkWhite },
  monogram: { ink: monogramInk, white: monogramWhite },
  lockup: { ink: lockupInk, white: lockupWhite },
};

// width/height from each SVG's own viewBox — used to derive the other
// dimension so the logo never stretches and never causes layout shift.
const ASPECT_RATIO: Record<BrandLogoVariant, number> = {
  wordmark: 666 / 200,
  monogram: 160 / 160,
  lockup: 830 / 210,
};

interface BrandLogoProps {
  /** Which lockup to render. Defaults to the full wordmark. */
  variant?: BrandLogoVariant;
  /** "ink" (deep blue, for light backgrounds) or "white" (for dark backgrounds). */
  tone?: BrandLogoTone;
  /** Rendered height in px; width is derived from the asset's aspect ratio. */
  height?: number;
  className?: string;
}

export function BrandLogo({
  variant = "wordmark",
  tone = "ink",
  height = 28,
  className,
}: BrandLogoProps) {
  const width = Math.round(height * ASPECT_RATIO[variant]);
  return (
    <img
      src={SOURCES[variant][tone]}
      alt="Hasat"
      width={width}
      height={height}
      className={className}
      style={{ height, width }}
    />
  );
}
