import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { CropDetailBody } from "@/components/hasat/CropDetailBody";
import { formatCrop } from "@/lib/hasat/format";

export const Route = createFileRoute("/farmer/prices/$crop")({
  head: ({ params }) => ({
    meta: [{ title: `${formatCrop(decodeURIComponent(params.crop))} Fiyat | Hasat` }],
  }),
  component: CropDetail,
});

function CropDetail() {
  const { crop } = Route.useParams();
  const decoded = decodeURIComponent(crop);
  return (
    <>
      <FarmerHeader title={formatCrop(decoded)} subtitle="Fiyat serileri ve kaynaklar" />
      <CropDetailBody crop={decoded} />
    </>
  );
}
