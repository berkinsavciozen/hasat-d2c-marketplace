export function FarmPill({ city, area, crop }: { city: string; area: number | null; crop: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-hwhite/90">
      <span>📍 {city}</span>
      <span className="opacity-50">·</span>
      <span>{area === null ? "—" : `${area} dönüm`}</span>
      <span className="opacity-50">·</span>
      <span>🌸 {crop}</span>
    </div>
  );
}
