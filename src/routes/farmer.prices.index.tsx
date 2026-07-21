import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { PricesPageBody } from "@/components/hasat/PricesPageBody";

export const Route = createFileRoute("/farmer/prices/")({
  head: () => ({ meta: [{ title: "Fiyat Takibi | Hasat" }] }),
  component: Prices,
});

function Prices() {
  return (
    <>
      <FarmerHeader title="Fiyat Takibi" subtitle="Sipariş temelli topluluk fiyat özeti" />
      <PricesPageBody role="farmer" />
    </>

  );
}
