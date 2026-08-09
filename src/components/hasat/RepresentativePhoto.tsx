import { useState, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Info } from "lucide-react";

/**
 * Shared image-or-placeholder block for recipe cover photos, crop photos and
 * marketplace listing photos. Whenever the image shown isn't the thing's own
 * photography (a `crop_config.default_photo_url` fallback), the "Temsili
 * görsel" (representative image) disclosure is mandatory — see
 * Build/P23-Mobile.md → "Fotoğraf stratejisi" and Build/DB-Schema.md →
 * "'Temsili görsel' etiketi kararı". Never a bare empty box: no photo at all
 * falls through to a neutral placeholder glyph.
 *
 * P23-M7-g: the disclosure is an ⓘ icon (not a full-text pill) so it fits
 * even on small thumbnails (44px ingredient cards). It opens a tooltip on
 * hover (desktop) or tap (touch, since there's no hover there) — the icon's
 * `aria-label` carries the meaning either way, so it isn't icon-only for
 * assistive tech even before the tooltip opens. Built on Radix Popover
 * (not the plain `tooltip.tsx` primitive, which skips touch by design) so
 * the bubble portals to `document.body` and auto-flips — it doesn't get
 * clipped by the small `overflow-hidden` photo containers it lives inside.
 */
export function RepresentativeBadge({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Temsili görsel"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={(e) => e.stopPropagation()}
          className={`absolute grid h-5 w-5 shrink-0 place-items-center rounded-full ${className}`}
          style={{
            background: "color-mix(in oklab, var(--dark) 70%, transparent)",
            color: "var(--hwhite)",
          }}
        >
          <Info className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="tooltip"
          side="top"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="pointer-events-none z-50 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium"
          style={{
            background: "color-mix(in oklab, var(--dark) 92%, transparent)",
            color: "var(--hwhite)",
          }}
        >
          Temsili görsel
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
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
        <img
          src={src}
          alt={isRepresentative ? `${alt} (temsili görsel)` : alt}
          className="absolute inset-0 h-full w-full object-cover"
        />
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
