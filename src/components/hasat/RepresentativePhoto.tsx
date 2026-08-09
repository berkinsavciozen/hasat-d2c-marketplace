import type { ReactNode } from "react";

/**
 * Shared image-or-placeholder block for recipe cover photos, crop photos and
 * (P24) marketplace listing photos. Whenever the image shown isn't the
 * thing's own photography (a `crop_config.default_photo_url` fallback), a
 * "Temsili görsel" label is mandatory — see Build/P23-Mobile.md → "Fotoğraf
 * stratejisi" and Build/DB-Schema.md → "'Temsili görsel' etiketi kararı".
 * Never a bare empty box: no photo at all falls through to a neutral
 * placeholder glyph.
 */
export function RepresentativeBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${className}`}
      style={{
        background: "color-mix(in oklab, var(--dark) 70%, transparent)",
        color: "var(--hwhite)",
      }}
    >
      Temsili görsel
    </span>
  );
}

export function RepresentativePhoto({
  src,
  isRepresentative,
  alt,
  placeholderEmoji = "🍽️",
  className = "",
  children,
}: {
  src: string | null | undefined;
  isRepresentative: boolean;
  alt: string;
  placeholderEmoji?: string;
  className?: string;
  /**
   * Optional overlay content (gradients, badges, text) layered on top of the
   * photo/placeholder. When provided, the caller owns badge placement — use
   * `RepresentativeBadge` inside `children` instead of relying on the
   * default bottom-right label, so it can be positioned to avoid other
   * overlay content (see buyer.discover.tsx's ListingGroupCard).
   */
  children?: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0 grid place-items-center bg-cream text-3xl"
          role="img"
          aria-label={alt}
        >
          {placeholderEmoji}
        </div>
      )}
      {children}
      {!children && src && isRepresentative && (
        <RepresentativeBadge className="absolute bottom-1 right-1" />
      )}
    </div>
  );
}
