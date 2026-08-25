import type { Offer, BallSide } from "./types";

export interface StatusVisual {
  label: string;
  tone: "info" | "warn" | "ok" | "muted" | "bad";
}

const TONE: Record<StatusVisual["tone"], { bg: string; fg: string }> = {
  info: { bg: "color-mix(in oklab, var(--teal) 12%, transparent)", fg: "var(--teal)" },
  warn: { bg: "color-mix(in oklab, var(--gold) 22%, transparent)", fg: "var(--gold)" },
  ok: { bg: "color-mix(in oklab, var(--sage) 22%, transparent)", fg: "var(--sage)" },
  muted: { bg: "color-mix(in oklab, var(--hmuted) 18%, transparent)", fg: "var(--hmuted)" },
  bad: { bg: "color-mix(in oklab, var(--hred) 18%, transparent)", fg: "var(--hred)" },
};

/** Computes the Turkish label + tone for an offer, given the viewer's role. */
export function statusVisual(offer: Offer, viewer: BallSide): StatusVisual {
  const ball = offer.ballSide ?? "farmer";
  const pay = offer.paymentStatus ?? "unpaid";
  if (offer.status === "rejected") return { label: "Reddedildi", tone: "bad" };
  if (offer.status === "completed") return { label: "Tamamlandı", tone: "ok" };
  if (offer.status === "active" || (offer.status === "accepted" && pay === "paid")) {
    return { label: "Aktif", tone: "ok" };
  }
  if (offer.status === "accepted") {
    return { label: "Ödeme Bekleniyor", tone: "warn" };
  }
  if (offer.status === "counter") {
    return ball === viewer
      ? { label: "Yanıtınızı Bekliyoruz", tone: "info" }
      : { label: "Karşı Taraf Yanıtı Bekleniyor", tone: "muted" };
  }
  // pending
  return ball === viewer
    ? { label: "Yanıtınızı Bekliyoruz", tone: "info" }
    : { label: "Yanıt Bekleniyor", tone: "muted" };
}

export function statusStyle(v: StatusVisual) {
  return TONE[v.tone];
}

/** Can the viewer Accept the current offer? Only if it's their turn. */
export function canAccept(offer: Offer, viewer: BallSide): boolean {
  if (offer.status !== "pending" && offer.status !== "counter") return false;
  return (offer.ballSide ?? "farmer") === viewer;
}

export function canCounter(offer: Offer, viewer: BallSide): boolean {
  return canAccept(offer, viewer);
}

export function canReject(offer: Offer, viewer: BallSide): boolean {
  return canAccept(offer, viewer);
}
