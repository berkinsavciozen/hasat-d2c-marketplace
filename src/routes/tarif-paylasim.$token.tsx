/**
 * Özel tarif paylaşım linki — sahip olmayan bir ziyaretçinin (giriş yapmış ya da yapmamış) önizleme
 * gördüğü, giriş yapmışsa "defterime kaydet" ile kendi taslağına kopyalayabildiği salt-okunur sayfa.
 * Backend: rpc_get_shared_recipe (anon dahil) + rpc_clone_shared_recipe (authenticated). Public tarif
 * paylaşımı (`/tarifler/$slug`) bu dosyadan tamamen ayrı, dokunulmadı.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock, Timer as TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { formatQuantity } from "@/lib/hasat/format";
import { formatTimeBreakdown, DIFFICULTY_LABELS } from "@/lib/hasat/recipes";
import { useSharedRecipe, useCloneSharedRecipe } from "@/lib/hasat/recipeShare";

export const Route = createFileRoute("/tarif-paylasim/$token")({
  head: () => ({
    meta: [{ title: "Paylaşılan tarif | Hasat" }, { name: "robots", content: "noindex" }],
  }),
  component: SharedRecipePage,
});

function useIsLoggedIn() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setLoggedIn(!!data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return loggedIn;
}

function formatTimer(seconds: number): string {
  if (seconds < 60) return `${seconds} sn`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  return `${Math.round(seconds / 3600)} sa`;
}

function SharedRecipePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const loggedIn = useIsLoggedIn();
  const { data, isLoading } = useSharedRecipe(token);
  const clone = useCloneSharedRecipe();

  if (isLoading || loggedIn === null) {
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-hmuted">
        Bu paylaşım linki artık geçerli değil.{" "}
        <Link to="/" className="underline">
          Hasat'a dön →
        </Link>
      </div>
    );
  }

  const { recipe, ingredients, steps } = data;
  const timeBreakdown = formatTimeBreakdown(
    recipe.prep_minutes,
    recipe.cook_minutes,
    recipe.rest_minutes,
  );

  const handleSave = () => {
    clone.mutate(token, {
      onSuccess: (recipeId) => {
        toast.success("Tarif defterine kaydedildi");
        navigate({ to: "/tariflerim/$recipeId", params: { recipeId } });
      },
      onError: (err: any) => {
        if (err?.message?.includes("RECIPE_SHARE_CANNOT_CLONE_OWN")) {
          toast.error("Bu zaten senin tarifin");
        } else {
          toast.error("Tarif kaydedilemedi");
        }
      },
    });
  };

  return (
    <div className="min-h-screen pb-28">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-5 md:px-8">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl">{recipe.title}</h1>
          {recipe.description && <p className="mt-2 text-sm text-hmuted">{recipe.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-hmuted">
            {timeBreakdown && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {timeBreakdown}
              </span>
            )}
            {recipe.difficulty && (
              <span>{DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}</span>
            )}
            {recipe.cuisine && <span>{recipe.cuisine}</span>}
            {recipe.servings && <span>{recipe.servings} porsiyon</span>}
          </div>
          {recipe.diet_tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {recipe.diet_tags.map((d) => (
                <span
                  key={d}
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ background: "color-mix(in oklab, var(--sage) 25%, transparent)" }}
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>

        {recipe.cover_photo_url && (
          <img
            src={recipe.cover_photo_url}
            alt={recipe.title}
            className="h-56 w-full rounded-2xl object-cover md:h-72"
          />
        )}

        <section className="space-y-3" aria-labelledby="shared-ingredients-heading">
          <h2
            id="shared-ingredients-heading"
            className="text-xs font-medium uppercase tracking-wider text-hmuted"
          >
            Malzemeler
          </h2>
          <ul className="space-y-1.5">
            {ingredients.map((ing) => {
              const name = ing.crop ?? ing.free_text_name ?? "";
              const qty = [
                ing.quantity != null ? formatQuantity(ing.quantity, ing.unit) : null,
                ing.unit,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={ing.id} className="rounded-xl border bg-card p-3 text-sm">
                  <span className="font-medium">{[qty, name].filter(Boolean).join(" ")}</span>
                  {ing.note && <span className="ml-1 italic text-hmuted">· {ing.note}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Hazırlanışı</h2>
          <ol className="space-y-3">
            {steps.map((s) => (
              <li key={s.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs text-hmuted shrink-0 pt-0.5">
                    {s.step_no}.
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm">{s.instruction}</p>
                    {s.photo_url && (
                      <img
                        src={s.photo_url}
                        alt={`Adım ${s.step_no}`}
                        className="mt-1 h-32 w-full rounded-lg object-cover"
                      />
                    )}
                    {s.timer_seconds != null && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-hmuted">
                        <TimerIcon className="h-3 w-3" /> {formatTimer(s.timer_seconds)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-3 pb-safe backdrop-blur md:px-8">
        <div className="mx-auto max-w-2xl">
          {loggedIn === false ? (
            <Link
              to="/login"
              search={{ next: `/tarif-paylasim/${token}` } as any}
              className="block w-full rounded-full py-3 text-center text-sm font-semibold"
              style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
            >
              Kaydetmek için üye ol
            </Link>
          ) : (
            <Button className="w-full" onClick={handleSave} disabled={clone.isPending}>
              {clone.isPending ? "Kaydediliyor…" : "Defterime kaydet"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
