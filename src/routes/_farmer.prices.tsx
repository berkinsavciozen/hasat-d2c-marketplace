import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./_farmer";
export const Route = createFileRoute("/_farmer/prices")({ component: () => <Stub title="Fiyatlar" /> });
function Stub({ title }: { title: string }) {
  return (<><FarmerHeader title={title} subtitle="Yakında — sonraki iterasyonda inşa edilecek" /><div className="p-8 text-center text-hmuted">🚧 Bu ekran sonraki adımda hazırlanacak.</div></>);
}
