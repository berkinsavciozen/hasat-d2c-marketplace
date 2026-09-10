/**
 * T6-UI / F11-UI ortak taslak editörü — hem AI öneri sheet'i (Faz A→B arası
 * düzenleme) hem `/tariflerim/$recipeId` düzenleme ekranı bunu kullanır.
 * Tamamen kontrollü bir bileşen: kendi içinde hiçbir ağ çağrısı yapmaz.
 */
import { Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  emptyIngredient,
  emptyStep,
  type DraftIngredient,
  type DraftStep,
  type RecipeDraft,
} from "@/lib/hasat/myRecipes";

const DIFFICULTIES = [
  { value: "", label: "—" },
  { value: "kolay", label: "Kolay" },
  { value: "orta", label: "Orta" },
  { value: "zor", label: "Zor" },
];

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function RecipeDraftEditor({
  draft,
  onChange,
  changedFields = [],
}: {
  draft: RecipeDraft;
  onChange: (next: RecipeDraft) => void;
  /** Faz A diff'i (ör. "ingredients[2]", "title") — değişen alanları işaretler. */
  changedFields?: string[];
}) {
  const changed = (key: string) => changedFields.includes(key);
  const changedRing = (key: string) =>
    changed(key) ? "ring-2 ring-[var(--saffron)] ring-offset-1" : "";

  const setField = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setIngredient = (index: number, patch: Partial<DraftIngredient>) =>
    onChange({
      ...draft,
      ingredients: draft.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    });

  const setStep = (index: number, patch: Partial<DraftStep>) =>
    onChange({
      ...draft,
      steps: draft.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wider text-hmuted">
          Başlık
        </label>
        <Input
          value={draft.title}
          onChange={(e) => setField("title", e.target.value)}
          className={changedRing("title")}
          placeholder="Tarif başlığı"
        />
        <label className="block text-xs font-medium uppercase tracking-wider text-hmuted">
          Açıklama
        </label>
        <Textarea
          value={draft.description ?? ""}
          onChange={(e) => setField("description", e.target.value || null)}
          className={changedRing("description")}
          rows={3}
          placeholder="Kısa açıklama (opsiyonel)"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["servings", "Porsiyon"],
              ["prepMinutes", "Hazırlık (dk)"],
              ["cookMinutes", "Pişirme (dk)"],
              ["restMinutes", "Dinlenme (dk)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <label className="block text-[11px] text-hmuted">{label}</label>
              <Input
                inputMode="numeric"
                value={draft[key] ?? ""}
                onChange={(e) => setField(key, numOrNull(e.target.value))}
                className={changedRing(key)}
              />
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] text-hmuted">Zorluk</label>
          <select
            value={draft.difficulty ?? ""}
            onChange={(e) => setField("difficulty", e.target.value || null)}
            className={`h-11 w-full rounded-md border bg-background px-3 text-sm ${changedRing("difficulty")}`}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-hmuted">Malzemeler</h3>
        {draft.ingredients.map((ing, i) => {
          const isChanged =
            changed(`ingredients[${i}]`) || changed(`ingredients[${i}].added`);
          return (
            <div
              key={i}
              className={`space-y-2 rounded-xl border bg-card p-3 ${isChanged ? "border-[var(--saffron)]" : ""}`}
            >
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={ing.freeTextName ?? ing.crop ?? ""}
                  onChange={(e) =>
                    ing.crop
                      ? setIngredient(i, { crop: e.target.value || null })
                      : setIngredient(i, { freeTextName: e.target.value })
                  }
                  placeholder="Malzeme adı"
                />
                <Input
                  className="w-20"
                  inputMode="decimal"
                  value={ing.quantity ?? ""}
                  onChange={(e) => setIngredient(i, { quantity: numOrNull(e.target.value) })}
                  placeholder="Miktar"
                  aria-label="Miktar"
                />
                <Input
                  className="w-20"
                  value={ing.unit ?? ""}
                  onChange={(e) => setIngredient(i, { unit: e.target.value || null })}
                  placeholder="Birim"
                  aria-label="Birim"
                />
              </div>
              <Input
                value={ing.note ?? ""}
                onChange={(e) => setIngredient(i, { note: e.target.value || null })}
                placeholder="Not (opsiyonel)"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-hmuted">
                  <Checkbox
                    checked={ing.isKeyIngredient}
                    onCheckedChange={(v) => setIngredient(i, { isKeyIngredient: v === true })}
                  />
                  Ana malzeme
                </label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Yukarı taşı"
                    onClick={() =>
                      onChange({ ...draft, ingredients: move(draft.ingredients, i, i - 1) })
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Aşağı taşı"
                    onClick={() =>
                      onChange({ ...draft, ingredients: move(draft.ingredients, i, i + 1) })
                    }
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Malzemeyi sil"
                    onClick={() =>
                      onChange({
                        ...draft,
                        ingredients: draft.ingredients.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...draft,
              ingredients: [...draft.ingredients, emptyIngredient(draft.ingredients.length + 1)],
            })
          }
        >
          <Plus /> Malzeme ekle
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-hmuted">Adımlar</h3>
        {draft.steps.map((s, i) => {
          const isChanged = changed(`steps[${i}]`) || changed(`steps[${i}].added`);
          return (
            <div
              key={i}
              className={`space-y-2 rounded-xl border bg-card p-3 ${isChanged ? "border-[var(--saffron)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-hmuted">Adım {i + 1}</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Yukarı taşı"
                    onClick={() => onChange({ ...draft, steps: move(draft.steps, i, i - 1) })}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Aşağı taşı"
                    onClick={() => onChange({ ...draft, steps: move(draft.steps, i, i + 1) })}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Adımı sil"
                    onClick={() =>
                      onChange({ ...draft, steps: draft.steps.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <Textarea
                rows={3}
                value={s.instruction}
                onChange={(e) => setStep(i, { instruction: e.target.value })}
                placeholder="Ne yapılacak?"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-hmuted">Süre (sn, opsiyonel)</span>
                <Input
                  className="w-28"
                  inputMode="numeric"
                  value={s.timerSeconds ?? ""}
                  onChange={(e) => setStep(i, { timerSeconds: numOrNull(e.target.value) })}
                  aria-label="Adım süresi (saniye)"
                />
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...draft, steps: [...draft.steps, emptyStep(draft.steps.length + 1)] })}
        >
          <Plus /> Adım ekle
        </Button>
      </section>
    </div>
  );
}
