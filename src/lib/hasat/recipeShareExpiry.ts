export const RECIPE_SHARE_DURATIONS = [
  { label: "10 dakika", value: 10 * 60_000 },
  { label: "1 saat", value: 60 * 60_000 },
  { label: "1 gün", value: 24 * 60 * 60_000 },
  { label: "7 gün", value: 7 * 24 * 60 * 60_000 },
  { label: "30 gün", value: 30 * 24 * 60 * 60_000 },
] as const;

export function expiryFromNow(milliseconds: number, nowMilliseconds = Date.now()): string {
  return new Date(nowMilliseconds + milliseconds).toISOString();
}
