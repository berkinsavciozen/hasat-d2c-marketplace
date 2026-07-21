import { createFileRoute } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { CropDetailBody } from "@/components/hasat/CropDetailBody";
import { formatCrop } from "@/lib/hasat/format";

export const Route = createFileRoute("/buyer/prices/$crop")({
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
      <BuyerHeader title={formatCrop(decoded)} subtitle="Fiyat serileri ve kaynaklar" />
      <CropDetailBody crop={decoded} />
    </>
  );
}
