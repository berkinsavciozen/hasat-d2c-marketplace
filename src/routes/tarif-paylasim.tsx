import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatIngredientUnit } from "@/lib/hasat/format";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/hasat/LoadingDots";
import { supabase } from "@/integrations/supabase/client";
import { PRIVATE_RECIPE_SHARE_ENABLED } from "@/lib/hasat/privateRecipeShareFlag";
import {
  recipeShareErrorCode,
  type SharedRecipePreview,
  useCloneSharedRecipe,
  useResolveRecipeShare,
} from "@/lib/hasat/recipeShare";
import {
  captureShareTokenFromFragment,
  clearPendingShareToken,
  hasPendingShareToken,
  withPendingShareToken,
} from "@/lib/hasat/recipeShareSecurity";

export const Route = createFileRoute("/tarif-paylasim")({
  head: () => ({
    meta: [
      { title: "Özel tarif paylaşımı | Hasat" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "referrer", content: "no-referrer" },
      { httpEquiv: "Cache-Control", content: "no-store" },
    ],
  }),
  component: PrivateRecipeSharePage,
});

function PrivateRecipeSharePage() {
  const navigate = useNavigate();
  const resolve = useResolveRecipeShare();
  const clone = useCloneSharedRecipe();
  const [auth, setAuth] = useState<"loading" | "guest" | "ready">("loading");
  const [captured, setCaptured] = useState(false);
  const [preview, setPreview] = useState<SharedRecipePreview | null>(null);
  const [neutralError, setNeutralError] = useState(false);
  const [cloneMessage, setCloneMessage] = useState<string | null>(null);
  const actionId = useRef(crypto.randomUUID());
  const resolveStarted = useRef(false);

  useEffect(() => {
    captureShareTokenFromFragment(window.location, window.history);
    setCaptured(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAuth(data.user ? "ready" : "guest");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(session?.user ? "ready" : "guest");
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      !PRIVATE_RECIPE_SHARE_ENABLED ||
      !captured ||
      auth !== "ready" ||
      preview ||
      resolveStarted.current
    )
      return;
    if (!hasPendingShareToken()) {
      setNeutralError(true);
      return;
    }
    resolveStarted.current = true;
    void withPendingShareToken((token) => resolve.mutateAsync(token))
      .then(setPreview)
      .catch(() => setNeutralError(true));
  }, [auth, captured, preview, resolve]);

  if (!PRIVATE_RECIPE_SHARE_ENABLED) return <Unavailable />;
  if (!captured || auth === "loading" || (auth === "ready" && resolve.isPending)) {
    return (
      <div className="p-8">
        <LoadingDots />
      </div>
    );
  }
  if (neutralError || !hasPendingShareToken()) return <Unavailable reopen />;
  if (auth === "guest") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 text-center">
        <h1 className="font-serif text-2xl">Özel tarif seni bekliyor</h1>
        <p className="mt-2 text-sm text-hmuted">
          Tarifi güvenle görmek ve Defterim’e eklemek için giriş yap.
        </p>
        <Link
          to="/login"
          search={{ role: "buyer", next: "/tarif-paylasim" }}
          className="mt-6 rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground"
        >
          Giriş yap
        </Link>
        <p className="mt-3 text-xs text-hmuted">
          Bu sekme kapanır veya yenilenirse güvenlik için linki yeniden açman gerekir.
        </p>
      </main>
    );
  }
  if (!preview) return <Unavailable reopen />;

  const save = () => {
    setCloneMessage(null);
    void withPendingShareToken((token) => clone.mutateAsync({ token, actionId: actionId.current }))
      .then(({ recipe_id }) => {
        clearPendingShareToken();
        actionId.current = crypto.randomUUID();
        navigate({ to: "/tariflerim/$recipeId", params: { recipeId: recipe_id } });
      })
      .catch((error) => {
        const code = recipeShareErrorCode(error);
        if (code === "recipe_share_operation_in_progress") {
          setCloneMessage("İşlem sürüyor. Aynı düğmeyle tekrar deneyebilirsin.");
          return;
        }
        if (code === "recipe_share_idempotency_conflict") {
          actionId.current = crypto.randomUUID();
          setCloneMessage("Önceki deneme tamamlanamadı. Düğmeye yeniden dokun.");
          return;
        }
        if (code === "recipe_share_cannot_clone_own") {
          setNeutralError(false);
          setCloneMessage("Bu tarif zaten sana ait.");
        } else {
          setNeutralError(true);
        }
      });
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-6 px-4 py-8 md:px-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-hmuted">Özel paylaşım</p>
        <h1 className="mt-1 font-serif text-3xl">{preview.recipe.title}</h1>
        {preview.recipe.description && (
          <p className="mt-2 text-sm text-hmuted">{preview.recipe.description}</p>
        )}
      </header>
      <section aria-labelledby="shared-ingredients">
        <h2 id="shared-ingredients" className="font-semibold">
          Malzemeler
        </h2>
        <ul className="mt-3 space-y-2">
          {preview.ingredients.map((item) => (
            <li
              key={`${item.sort_order}-${item.crop ?? item.free_text_name}`}
              className="rounded-xl border p-3 text-sm"
            >
              {[item.quantity, formatIngredientUnit(item.unit), item.crop ?? item.free_text_name]
                .filter(Boolean)
                .join(" ")}
              {item.note ? ` · ${item.note}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="shared-steps">
        <h2 id="shared-steps" className="font-semibold">
          Hazırlanışı
        </h2>
        <ol className="mt-3 space-y-2">
          {preview.steps.map((step) => (
            <li key={step.step_no} className="rounded-xl border p-3 text-sm">
              <span className="mr-2 font-mono text-hmuted">{step.step_no}.</span>
              {step.instruction}
            </li>
          ))}
        </ol>
      </section>
      <Button className="w-full" onClick={save} disabled={clone.isPending} autoFocus>
        {clone.isPending ? "Defterime ekleniyor…" : "Defterime ekle"}
      </Button>
      {cloneMessage && (
        <p role="alert" className="text-center text-sm text-hmuted">
          {cloneMessage}
        </p>
      )}
    </main>
  );
}

function Unavailable({ reopen = false }: { reopen?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 text-center">
      <h1 className="font-serif text-2xl">Bu paylaşım açılamıyor</h1>
      <p className="mt-2 text-sm text-hmuted">
        {reopen
          ? "Güvenlik için paylaşım linkini yeniden aç."
          : "Bu özellik şu anda kullanıma açık değil."}
      </p>
      <Link to="/" className="mt-5 underline">
        Hasat’a dön
      </Link>
    </main>
  );
}
