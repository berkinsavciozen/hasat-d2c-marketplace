/**
 * F11-UI — "Kendime kopyala": AI'sız, tek adımlı klon (`rpc_clone_recipe`).
 * Backend'de idempotency YOK; çift tık koruması burada (tıklamada disable).
 * Not: klon, kaynağın adım fotoğraflarını kopyalamaz (bilinen kısıt).
 */
import { Copy } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCloneRecipe } from "@/lib/hasat/myRecipes";

export function CloneRecipeButton({ sourceRecipeId }: { sourceRecipeId: string }) {
  const navigate = useNavigate();
  const clone = useCloneRecipe();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={clone.isPending}
      onClick={() =>
        clone.mutate(sourceRecipeId, {
          onSuccess: (recipeId) => {
            toast.success("Tarif taslaklarına kopyalandı");
            navigate({ to: "/tariflerim/$recipeId", params: { recipeId } });
          },
          onError: () => toast.error("Bu tarif şu anda kopyalanamıyor"),
        })
      }
    >
      <Copy /> {clone.isPending ? "Kopyalanıyor…" : "Kendime kopyala"}
    </Button>
  );
}
