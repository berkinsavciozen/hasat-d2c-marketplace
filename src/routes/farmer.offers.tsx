import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { AIBox } from "@/components/hasat/AIBox";

export const Route = createFileRoute("/farmer/offers")({
  component: Offers,
});

function Offers() {
  return (
    <>
      <FarmerHeader title="Teklifler" subtitle="Yakında" />
      <div className="p-4 md:p-8">
        <AIBox page="storefront" />
        <div className="p-8 text-center text-hmuted">🚧 Bu ekran sonraki adımda hazırlanacak.</div>
      </div>
    </>
  );
}
