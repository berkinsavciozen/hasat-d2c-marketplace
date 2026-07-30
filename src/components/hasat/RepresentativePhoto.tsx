/**
 * Shared image-or-placeholder block for recipe cover photos and crop photos.
 * Whenever the image shown isn't the thing's own photography (a
 * `crop_config.default_photo_url` fallback), a "Temsili görsel" label is
 * mandatory — see Build/P23-Mobile.md → "Fotoğraf stratejisi" and
 * Build/DB-Schema.md → "'Temsili görsel' etiketi kararı". Never a bare
 * empty box: no photo at all falls through to a neutral placeholder glyph.
 */
export function RepresentativePhoto({
  src,
  isRepresentative,
  alt,
  placeholderEmoji = "🍽️",
  className = "",
}: {
  src: string | null | undefined;
  isRepresentative: boolean;
  alt: string;
  placeholderEmoji?: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={`grid place-items-center bg-cream text-3xl ${className}`}
        role="img"
        aria-label={alt}
      >
        {placeholderEmoji}
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      {isRepresentative && (
        <span
          className="absolute bottom-1 right-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
          style={{
            background: "color-mix(in oklab, var(--dark) 70%, transparent)",
            color: "var(--hwhite)",
          }}
        >
          Temsili görsel
        </span>
      )}
    </div>
  );
}
