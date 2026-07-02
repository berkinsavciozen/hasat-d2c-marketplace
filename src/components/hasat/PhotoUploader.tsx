import { useEffect, useMemo, useRef } from "react";
import { ImagePlus, X } from "lucide-react";

interface Props {
  value: string[];
  files: File[];
  onChange: (value: string[], files: File[]) => void;
  max: number;
  label?: string;
}

export function PhotoUploader({ value, files, onChange, max, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage blob URLs for file previews so we can revoke them.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => {
    return () => {
      previews.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [previews]);

  const total = value.length + files.length;
  const remaining = Math.max(0, max - total);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const next = [...files, ...picked].slice(0, Math.max(0, max - value.length));
    onChange(value, next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {value.map((url, i) => (
          <div key={`u-${url}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i), files)}
              className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
              aria-label="Kaldır"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {previews.map((url, i) => (
          <div key={`f-${i}-${files[i]?.name}`} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value, files.filter((_, idx) => idx !== i))}
              className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"
              aria-label="Kaldır"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border border-dashed text-hmuted hover:bg-muted/50"
            aria-label="Fotoğraf Ekle"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handlePick}
        className="hidden"
      />
      <div className="mt-1.5 text-[11px] text-hmuted">
        {label ?? `En fazla ${max} fotoğraf`} · {total}/{max}
      </div>
    </div>
  );
}
