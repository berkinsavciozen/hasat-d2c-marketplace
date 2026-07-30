import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clock, Minus, Plus, Timer as TimerIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/lib/hasat/queries";
import { formatCrop, formatTRY } from "@/lib/hasat/format";
import { cropEmoji } from "@/lib/hasat/crop-config";
import {
  fetchRecipeBySlug,
  useRecipeAvailability,
  useRecipeShoppingList,
  useLogRecipeView,
  toIsoDuration,
  DIFFICULTY_LABELS,
  type RecipeIngredientRow,
} from "@/lib/hasat/recipes";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";

function ingredientLabel(i: RecipeIngredientRow): string {
  const name = i.crop ? formatCrop(i.crop) : (i.free_text_name ?? "");
  const qty = [i.quantity, i.unit].filter((x) => x != null && x !== "").join(" ");
  const base = [qty, name].filter(Boolean).join(" ").trim();
  return i.note ? `${base} (${i.note})` : base;
}

function formatTimer(seconds: number): string {
  if (seconds < 60) return `${seconds} sn`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa`;
  return `${Math.round(seconds / 86400)} gün`;
}

export const Route = createFileRoute("/tarifler/$slug")({
  loader: async ({ params }) => {
    const data = await fetchRecipeBySlug(params.slug);
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { recipe, steps, ingredients } = loaderData;
    const title = `${recipe.title} | Hasat Tarifleri`;
    const description =
      recipe.description ?? `${recipe.title} tarifi — Hasat'ın editoryal tarif koleksiyonundan.`;
    const canonical = `https://hasat.lovable.app/tarifler/${recipe.slug}`;
    const totalMinutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonical },
        ...(recipe.displayPhotoUrl
          ? [{ property: "og:image", content: recipe.displayPhotoUrl }]
          : []),
      ],
      links: [{ rel: "canonical", href: canonical }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Recipe",
            name: recipe.title,
            description,
            ...(recipe.displayPhotoUrl ? { image: [recipe.displayPhotoUrl] } : {}),
            ...(recipe.servings ? { recipeYield: `${recipe.servings} porsiyon` } : {}),
            ...(toIsoDuration(recipe.prep_minutes)
              ? { prepTime: toIsoDuration(recipe.prep_minutes) }
              : {}),
            ...(toIsoDuration(recipe.cook_minutes)
              ? { cookTime: toIsoDuration(recipe.cook_minutes) }
              : {}),
            ...(toIsoDuration(totalMinutes) ? { totalTime: toIsoDuration(totalMinutes) } : {}),
            ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
            ...(recipe.diet_tags.length > 0 ? { keywords: recipe.diet_tags.join(", ") } : {}),
            recipeIngredient: ingredients.map(ingredientLabel).filter(Boolean),
            recipeInstructions: steps.map((s) => ({
              "@type": "HowToStep",
              text: s.instruction,
              ...(s.photo_url ? { image: s.photo_url } : {}),
            })),
            author: { "@type": "Organization", name: "Hasat" },
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="p-8 text-center text-hmuted">
      Tarif bulunamadı.{" "}
      <Link to="/tarifler" className="underline">
        Tüm tarifler →
      </Link>
    </div>
  ),
  component: RecipeDetailPage,
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

function RecipeDetailPage() {
  const { recipe, steps, ingredients } = Route.useLoaderData();
  const navigate = useNavigate();
  const loggedIn = useIsLoggedIn();
  const { data: myProfile } = useProfile();
  const isBuyer = loggedIn && myProfile?.role === "buyer";

  useLogRecipeView(recipe.id);

  const [servings, setServings] = useState(recipe.servings ?? 4);
  const { data: availability = [], isLoading: availLoading } = useRecipeAvailability(recipe.id);
  const { data: shoppingList = [], isLoading: shopLoading } = useRecipeShoppingList(
    recipe.id,
    servings,
  );

  const availByIngredient = useMemo(
    () => new Map(availability.map((a) => [a.ingredient_id, a])),
    [availability],
  );
  const shopByIngredient = useMemo(
    () => new Map(shoppingList.map((s) => [s.ingredient_id, s])),
    [shoppingList],
  );
  const liveDataReady = !availLoading && !shopLoading && shoppingList.length > 0;

  const goToProduct = () => {
    if (isBuyer) navigate({ to: "/buyer/discover" });
    else navigate({ to: "/login", search: { role: "buyer" } as any });
  };

  const totalMinutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);

  return (
    <div className="min-h-screen pb-24">
      <RepresentativePhoto
        src={recipe.displayPhotoUrl}
        isRepresentative={recipe.isRepresentativePhoto}
        alt={recipe.title}
        placeholderEmoji="🍽️"
        className="h-56 w-full md:h-72"
      />

      <div className="px-4 py-5 md:px-8 space-y-6 max-w-2xl mx-auto">
        <div>
          <Link to="/tarifler" className="text-xs text-hmuted hover:underline">
            ← Tüm tarifler
          </Link>
          <h1 className="mt-2 font-serif text-2xl md:text-3xl">{recipe.title}</h1>
          {recipe.description && <p className="mt-2 text-sm text-hmuted">{recipe.description}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-hmuted">
            {totalMinutes > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {totalMinutes} dk
              </span>
            )}
            {recipe.difficulty && (
              <span>{DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}</span>
            )}
            {recipe.cuisine && <span>{recipe.cuisine}</span>}
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

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-hmuted">Malzemeler</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                className="grid h-8 w-8 place-items-center rounded-full border hover:bg-muted"
                aria-label="Porsiyonu azalt"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[5rem] text-center text-sm font-medium">
                {servings} porsiyon
              </span>
              <button
                type="button"
                onClick={() => setServings((s) => s + 1)}
                className="grid h-8 w-8 place-items-center rounded-full border hover:bg-muted"
                aria-label="Porsiyonu artır"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {ingredients.map((ing) => {
              const avail = availByIngredient.get(ing.id);
              const shop = shopByIngredient.get(ing.id);
              const name = ing.crop
                ? (avail?.crop_display_name ?? formatCrop(ing.crop))
                : ing.free_text_name;
              const isPlatformCrop = shop?.is_platform_crop ?? !!ing.crop;
              const isMatched = shop?.is_matched ?? false;

              return (
                <div key={ing.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cream text-xl overflow-hidden">
                    {avail?.crop_photo_url ? (
                      <img
                        src={avail.crop_photo_url}
                        alt={name ?? ""}
                        className="h-11 w-11 object-cover"
                      />
                    ) : (
                      cropEmoji(ing.crop ?? undefined)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-medium text-sm truncate">{name}</span>
                      {ing.is_key_ingredient && (
                        <span className="text-[9px] uppercase tracking-wide text-hmuted">
                          ana malzeme
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-hmuted">
                      {shop
                        ? `${shop.scaled_quantity ?? shop.recipe_quantity ?? ""} ${shop.recipe_unit ?? ""}`.trim()
                        : `${ing.quantity ?? ""} ${ing.unit ?? ""}`.trim()}
                      {shop && shop.scale_factor !== 1 && (
                        <span className="ml-1 opacity-70">(×{shop.scale_factor})</span>
                      )}
                      {ing.note && <span className="ml-1 italic opacity-80">· {ing.note}</span>}
                    </div>

                    {!liveDataReady ? (
                      <div className="mt-1 h-3 w-24 animate-pulse rounded bg-muted" />
                    ) : !isPlatformCrop ? null : isMatched ? (
                      <div className="mt-1 space-y-0.5">
                        <button
                          type="button"
                          onClick={goToProduct}
                          className="text-xs font-medium underline decoration-dotted"
                          style={{ color: "var(--saffron)" }}
                        >
                          Ürün sayfasına git →
                        </button>
                        <div className="text-[11px] text-hmuted">
                          {shop?.best_price_per_canonical != null && shop?.canonical_unit && (
                            <>
                              {formatTRY(shop.best_price_per_canonical)}/{shop.canonical_unit}
                            </>
                          )}
                          {shop?.min_order_canonical != null && shop?.canonical_unit && (
                            <>
                              {" "}
                              · Min. sipariş {shop.min_order_canonical} {shop.canonical_unit}
                            </>
                          )}
                          {avail && avail.active_listing_count > 0 && (
                            <> · {avail.active_listing_count} aktif ilan</>
                          )}
                        </div>
                        {shop?.rounded_up_to_min_order && shop.canonical_unit && (
                          <div className="text-[11px] text-hmuted">
                            Bu tarif için {shop.needed_canonical} {shop.canonical_unit} yeterli, ama
                            minimum sipariş {shop.purchase_canonical} {shop.canonical_unit}
                            {shop.recipes_covered != null && (
                              <> — bu miktar ~{Math.round(shop.recipes_covered)} tarif yapar.</>
                            )}
                          </div>
                        )}
                        {shop?.conversion_available === false && (
                          <div className="text-[11px] text-hmuted">Miktar hesaplanamadı.</div>
                        )}
                        {shop?.estimated_cost != null && (
                          <div className="text-[11px] text-hmuted">
                            Tahmini maliyet: {formatTRY(shop.estimated_cost)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          background: "color-mix(in oklab, var(--hmuted) 18%, transparent)",
                          color: "var(--hmuted)",
                        }}
                      >
                        Hasat'ta henüz yok
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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

        <div className="rounded-xl border border-dashed p-3 text-[11px] text-hmuted">
          Hasat hızlı teslimat uygulaması değildir: teslim süresi ve minimum sipariş miktarı
          çiftçiden doğrudan, mevsiminde ve güvenilir tedarik içindir — anında değil.
        </div>
      </div>

      {loggedIn === false && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur px-4 py-3 md:px-8">
          <Link
            to="/login"
            search={{ role: "buyer" } as any}
            className="block w-full rounded-full py-3 text-center text-sm font-semibold"
            style={{ background: "var(--saffron)", color: "var(--hwhite)" }}
          >
            Malzemeleri Hasat'tan almak için giriş yapın
          </Link>
        </div>
      )}
    </div>
  );
}
