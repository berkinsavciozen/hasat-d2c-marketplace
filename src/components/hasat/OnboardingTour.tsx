import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProgressDots } from "@/components/hasat/ProgressDots";
import { FARMER_TOUR_STORAGE_KEY, type TourStep } from "@/lib/hasat/onboarding-tour";
import {
  getTourTabTarget,
  restoreTourFocus,
  TOUR_FOCUSABLE_SELECTOR,
} from "@/lib/hasat/tour-focus";

type Rect = { top: number; left: number; width: number; height: number };

type Props = {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  storageKey?: string;
};

const PAD = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 12;

export function OnboardingTour({
  steps,
  open,
  onClose,
  storageKey = FARMER_TOUR_STORAGE_KEY,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset step index when reopened
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const step = steps[idx];

  // Measure target
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) {
        setRect(null);
        return;
      }
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      // Delay to allow smooth scroll to settle before measuring
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      });
    };
    measure();
    const onResize = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const t = setInterval(onResize, 500); // catch layout shifts
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      clearInterval(t);
    };
  }, [open, step]);

  const finish = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey, "1");
    }
    onClose();
  }, [onClose, storageKey]);

  // Isolate the modal, contain keyboard focus, and restore focus on close.
  useEffect(() => {
    if (!open || !mounted || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== dialog,
    );
    const previousInert = background.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
    }));
    background.forEach((element) => {
      element.setAttribute("inert", "");
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(TOUR_FOCUSABLE_SELECTOR));
      const target = getTourTabTarget(
        focusable,
        document.activeElement as HTMLElement | null,
        e.shiftKey,
      );
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousInert.forEach(({ element, inert }) => {
        if (!inert) element.removeAttribute("inert");
      });
      const fallback = document.querySelector<HTMLElement>('[data-tour="chat-input"]');
      restoreTourFocus(previousFocusRef.current, fallback);
      previousFocusRef.current = null;
    };
  }, [finish, mounted, open]);

  // Announce every newly opened step from its heading in reading order.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    if (!previousFocusRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }
    headingRef.current?.focus();
  }, [idx, mounted, open]);

  if (!open || !mounted || !step) return null;

  const isLast = idx === steps.length - 1;

  // Tooltip position
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  let tipTop = vh / 2 - 100;
  let tipLeft = vw / 2 - TOOLTIP_W / 2;

  if (rect) {
    const placement = step.placement ?? "bottom";
    if (placement === "bottom") {
      tipTop = rect.top + rect.height + PAD + TOOLTIP_GAP;
      tipLeft = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (placement === "top") {
      tipTop = rect.top - PAD - TOOLTIP_GAP - 220;
      tipLeft = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    } else if (placement === "right") {
      tipTop = rect.top + rect.height / 2 - 100;
      tipLeft = rect.left + rect.width + PAD + TOOLTIP_GAP;
    } else {
      tipTop = rect.top + rect.height / 2 - 100;
      tipLeft = rect.left - PAD - TOOLTIP_GAP - TOOLTIP_W;
    }
    // clamp
    tipLeft = Math.max(12, Math.min(vw - TOOLTIP_W - 12, tipLeft));
    tipTop = Math.max(12, Math.min(vh - 240, tipTop));
  }

  const titleId = `tour-title-${idx}`;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0"
      style={{ zIndex: 60 }}
    >
      {/* Overlay with spotlight cutout */}
      {rect ? (
        <div
          className="fixed pointer-events-auto"
          onClick={finish}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
            border: "2px solid var(--saffron)",
            transition: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "none"
              : "all 200ms ease",
          }}
        />
      ) : (
        <div
          className="fixed inset-0 pointer-events-auto"
          onClick={finish}
          style={{ background: "rgba(0,0,0,0.6)" }}
        />
      )}

      {/* Tooltip */}
      <div
        className="fixed bg-card border rounded-2xl p-4 shadow-lg pointer-events-auto"
        style={{ top: tipTop, left: tipLeft, width: TOOLTIP_W, maxWidth: "calc(100vw - 24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="font-serif text-lg leading-tight outline-none"
        >
          {step.title}
        </div>
        <p className="mt-2 text-sm text-hmuted">{step.body}</p>

        <div className="mt-4">
          <ProgressDots current={idx + 1} total={steps.length} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="min-h-[48px] min-w-[48px] rounded-full px-4 text-sm font-medium"
            style={{ color: "var(--saffron)" }}
          >
            Atla
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setIdx((i) => i + 1))}
            className="min-h-[48px] min-w-[48px] rounded-full px-5 text-sm font-medium text-white"
            style={{ background: "var(--saffron)" }}
          >
            {isLast ? "Bitir" : "İleri"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
