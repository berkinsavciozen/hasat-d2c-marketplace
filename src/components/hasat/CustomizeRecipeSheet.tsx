/**
 * T6-UI — "AI ile özelleştir" iki fazlı sheet.
 * Faz A: customize-recipe (phase="propose") → öneri (hiçbir şey kaydedilmez).
 * Faz A→B arası: kullanıcı öneriyi düzenleyebilir (RecipeDraftEditor).
 * Faz B: customize-recipe (phase="save") → yeni private taslak, /tariflerim/$id.
 *
 * idempotency_key sheet açılışında BİR KEZ üretilir; retry'da yenilenmez.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RecipeDraftEditor } from "@/components/hasat/RecipeDraftEditor";
import {
  draftValidationErrors,
  useProposeCustomization,
  useSaveCustomization,
  type RecipeDraft,
} from "@/lib/hasat/myRecipes";

const EXAMPLES = ["Vegan yap", "Fındığı çıkar", "2 kişilik yap", "Fırın yerine ocakta pişir"];

export function CustomizeRecipeSheet({
  open,
  onOpenChange,
  sourceRecipeId,
  sourceTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRecipeId: string;
  sourceTitle: string;
}) {
  const navigate = useNavigate();
  const [instruction, setInstruction] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [issues, setIssues] = useState<string[]>([]);

  const propose = useProposeCustomization();
  const save = useSaveCustomization();

  useEffect(() => {
    if (!open) return;
    // Sheet her açılışta yeni bir istek — anahtarı burada bir kez üret.
    setIdempotencyKey(crypto.randomUUID());
    setInstruction("");
    setDraft(null);
    setChangedFields([]);
    setIssues([]);
  }, [open]);

  const runPropose = () => {
    const text = instruction.trim();
    if (text.length < 5) {
      toast.error("Ne değiştirmek istediğini biraz daha açık yaz.");
      return;
    }
    propose.mutate(
      { sourceRecipeId, instruction: text, idempotencyKey },
      {
        onSuccess: (res) => {
          setDraft(res.draft);
          setChangedFields(res.changedFields ?? []);
          setIssues(
            (res.validation?.issues ?? [])
              .map((i) => i?.message ?? i?.field ?? "")
              .filter(Boolean) as string[],
          );
        },
        onError: (err: any) => toast.error(err?.message ?? "Öneri üretilemedi."),
      },
    );
  };

  const runSave = () => {
    if (!draft) return;
    const errors = draftValidationErrors(draft);
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    save.mutate(
      { sourceRecipeId, idempotencyKey, draft },
      {
        onSuccess: (recipeId) => {
          toast.success("Taslağın kaydedildi");
          onOpenChange(false);
          navigate({ to: "/tariflerim/$recipeId", params: { recipeId } });
        },
        onError: (err: any) => toast.error(err?.message ?? "Taslak kaydedilemedi."),
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> AI ile özelleştir
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pb-8">
          <p className="text-xs text-hmuted">
            <span className="font-medium">{sourceTitle}</span> tarifini kendine göre uyarla. Öneriyi
            görüp düzenledikten sonra kendi taslağın olarak kaydedilir — özgün tarif değişmez.
          </p>

          {!draft && (
            <>
              <Textarea
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value.slice(0, 2000))}
                placeholder="Örn. sütlü malzemeleri çıkar, vegan yap"
              />
              <div className="flex flex-wrap gap-1">
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setInstruction(e)}
                    className="rounded-full border px-2.5 py-1 text-xs text-hmuted hover:bg-muted"
                  >
                    {e}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={runPropose}
                disabled={propose.isPending}
              >
                {propose.isPending ? "Öneri hazırlanıyor…" : "Öneri getir"}
              </Button>
            </>
          )}

          {draft && (
            <>
              {issues.length > 0 && (
                <div className="rounded-xl border border-[var(--saffron)] bg-card p-3 text-xs">
                  <div className="mb-1 flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Kontrol etmen iyi olur
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4 text-hmuted">
                    {issues.slice(0, 6).map((i, idx) => (
                      <li key={idx}>{i}</li>
                    ))}
                  </ul>
                </div>
              )}
              {changedFields.length > 0 && (
                <p className="text-[11px] text-hmuted">
                  Turuncu çerçeveli alanlar AI'nin değiştirdiği yerler. Kaydetmeden önce
                  düzenleyebilirsin.
                </p>
              )}
              <RecipeDraftEditor
                draft={draft}
                onChange={setDraft}
                changedFields={changedFields}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDraft(null)}
                  disabled={save.isPending}
                >
                  Geri
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={runSave}
                  disabled={save.isPending}
                >
                  {save.isPending ? "Kaydediliyor…" : "Taslağıma kaydet"}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
