import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";

export const Route = createFileRoute("/farmer/analytics")({
  head: () => ({ meta: [{ title: "Analitik | Hasat" }] }),
  component: Analytics,
});

function Analytics() {
  return (
    <>
      <FarmerHeader title="Analitik" subtitle="Performansını takip et" />
      <div className="p-4 md:p-8">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="text-sm text-muted-foreground">
            Henüz analiz için yeterli veri yok. Hasat kayıtları ve siparişler eklendikçe burada görünecek.
          </div>
        </div>
      </div>
    </>
  );
}
