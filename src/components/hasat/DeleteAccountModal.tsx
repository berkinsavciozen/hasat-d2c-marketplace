import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useDeleteAccount } from "@/lib/hasat/queries";

const CONFIRM_PHRASE = "HESABIMI SİL";

export function DeleteAccountModal({
  open,
  onOpenChange,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const deleteAccount = useDeleteAccount();
  const canConfirm = confirmText.trim().toLocaleUpperCase("tr-TR") === CONFIRM_PHRASE;

  const onConfirm = async () => {
    try {
      await deleteAccount.mutateAsync();
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error((e as Error).message || "Hesap silinemedi");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setConfirmText("");
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-destructive">Hesabını Sil</SheetTitle>
        </SheetHeader>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>Bu işlem geri alınamaz. Sildiğinde:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Telefonun, adın, adreslerin, banka bilginin ve kaydettiğin tariflerin silinir.</li>
            <li>
              Teklif/sipariş/değerlendirme geçmişin, karşı tarafın kaydı ve itibarı korunacak
              şekilde kimliğinden arındırılarak kalır (yasal saklama yükümlülüğü — bkz. Gizlilik
              Politikası).
            </li>
            <li>Aynı telefon numarasıyla dilediğin zaman yeniden kayıt olabilirsin.</li>
          </ul>
          <p className="pt-1">
            Onaylamak için aşağıya <strong className="text-foreground">{CONFIRM_PHRASE}</strong>{" "}
            yazın.
          </p>
        </div>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          className="mt-3"
        />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm || deleteAccount.isPending}
          className="mt-4 w-full rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-40 min-h-[48px]"
          style={{ background: "var(--hred)" }}
        >
          {deleteAccount.isPending ? "Siliniyor…" : "Hesabımı Kalıcı Olarak Sil"}
        </button>
      </SheetContent>
    </Sheet>
  );
}
