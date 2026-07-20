import { createFileRoute } from "@tanstack/react-router";
import { BuyerHeader } from "@/components/hasat/BuyerHeader";
import { CommunityFeed } from "@/components/hasat/community/CommunityFeed";

export const Route = createFileRoute("/buyer/community")({
  head: () => ({ meta: [{ title: "Topluluk | Hasat" }] }),
  component: BuyerCommunity,
});

const CATS = ["Tümü", "Genel", "Soru", "Tavsiye", "Pazar"];

function BuyerCommunity() {
  return (
    <>
      <BuyerHeader title="Topluluk" subtitle="Üretici ve alıcılarla konuş" />
      <CommunityFeed categories={CATS} defaultCategory="Genel" />
    </>
  );
}
