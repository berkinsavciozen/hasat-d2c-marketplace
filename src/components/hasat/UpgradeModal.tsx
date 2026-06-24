import { Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function UpgradeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: "var(--lav)" }} />
            Bu ay AI limitine ulaştınız
          </SheetTitle>
        </SheetHeader>
        <p className="mt-3 text-sm text-muted-foreground">
          Aylık 50 mesaj hakkını kullandınız. Premium ile sınırsız AI sohbeti, günlük kaydı ve fiyat analizi yapabilirsiniz.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { onOpenChange(false); navigate({ to: "/farmer/premium" }); }}
            className="w-full rounded-xl py-2.5 text-sm font-medium"
            style={{ background: "var(--saffron)", color: "white" }}
          >
            Premium'a Geç
          </button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Belki Sonra</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
