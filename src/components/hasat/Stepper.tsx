import { Minus, Plus } from "lucide-react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  unit?: string;
  units?: string[];
  onUnitChange?: (u: string) => void;
}

// Kills IEEE754 add/subtract drift from decimal steps (ör. 0.1 + 0.2 →
// 0.30000000000000004) before it reaches the number input's `value`.
function roundStep(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function Stepper({ value, onChange, step = 1, min = 0, unit, units, onUnitChange }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-input border p-1.5">
      <button
        type="button"
        onClick={() => onChange(roundStep(Math.max(min, value - step)))}
        className="grid h-10 w-10 place-items-center rounded-lg bg-cream hover:bg-muted"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="flex-1 bg-transparent text-center font-mono text-xl outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(roundStep(value + step))}
        className="grid h-10 w-10 place-items-center rounded-lg bg-cream hover:bg-muted"
      >
        <Plus className="h-4 w-4" />
      </button>
      {units && unit && onUnitChange ? (
        <div className="flex gap-0.5 rounded-lg bg-cream p-0.5">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${unit === u ? "bg-saffron text-white" : "text-hmuted"}`}
            >
              {u}
            </button>
          ))}
        </div>
      ) : unit ? (
        <span className="px-2 text-sm text-hmuted">{unit}</span>
      ) : null}
    </div>
  );
}
