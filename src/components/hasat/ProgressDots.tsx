export function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-2 rounded-full transition-all"
          style={{
            width: i + 1 === current ? 24 : 8,
            background: i + 1 <= current ? "var(--primary)" : "color-mix(in oklab, var(--hmuted) 50%, transparent)",
          }}
        />
      ))}
    </div>
  );
}
