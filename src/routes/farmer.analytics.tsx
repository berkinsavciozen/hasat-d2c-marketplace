import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./_farmer";
export const Route = createFileRoute("/farmer/analytics")({ component: () => (<><FarmerHeader title="Analitik" subtitle="Yakında" /><div className="p-8 text-center text-hmuted">🚧 Bu ekran sonraki adımda hazırlanacak.</div></>) });
