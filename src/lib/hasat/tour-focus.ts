export const TOUR_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getTourTabTarget<T>(
  focusable: readonly T[],
  active: T | null,
  backwards: boolean,
): T | null {
  if (focusable.length === 0) return null;
  const activeIndex = active === null ? -1 : focusable.indexOf(active);

  if (backwards) {
    return activeIndex <= 0 ? focusable[focusable.length - 1] : focusable[activeIndex - 1];
  }

  return activeIndex < 0 || activeIndex === focusable.length - 1
    ? focusable[0]
    : focusable[activeIndex + 1];
}

type RestorableFocus = {
  isConnected: boolean;
  focus: () => void;
  matches?: (selector: string) => boolean;
  getClientRects?: () => { length: number };
};

function isMeaningfulFocusTarget(target: RestorableFocus | null): target is RestorableFocus {
  if (!target?.isConnected) return false;
  if (target.matches?.('[disabled], [aria-hidden="true"], [inert]')) return false;
  if (target.getClientRects && target.getClientRects().length === 0) return false;
  return true;
}

export function restoreTourFocus<T extends RestorableFocus>(
  previous: T | null,
  fallback: T | null,
): T | null {
  const target = isMeaningfulFocusTarget(previous)
    ? previous
    : isMeaningfulFocusTarget(fallback)
      ? fallback
      : null;
  target?.focus();
  return target;
}
