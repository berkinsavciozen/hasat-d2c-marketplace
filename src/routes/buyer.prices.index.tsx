import { createFileRoute } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { PricesPageBody } from "@/components/hasat/PricesPageBody";

export const Route = createFileRoute("/buyer/prices/")({
  head: () => ({ meta: [{ title: "Fiyatlar | Hasat" }] }),
  component: Prices,
});

function Prices() {
  return (
    <>
      <BuyerHeader title="Fiyatlar" subtitle="Sipariş temelli topluluk fiyat özeti" />
      <PricesPageBody role="buyer" />
    </>

  );
}
