import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./_farmer";
export const Route = createFileRoute("/_farmer/community")({ component: () => (<><FarmerHeader title="Topluluk" subtitle="Yakında" /><div className="p-8 text-center text-hmuted">🚧 Bu ekran sonraki adımda hazırlanacak.</div></>) });
