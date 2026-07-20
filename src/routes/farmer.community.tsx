import { createFileRoute } from "@tanstack/react-router";
import { FarmerHeader } from "./farmer";
import { CommunityFeed } from "@/components/hasat/community/CommunityFeed";

export const Route = createFileRoute("/farmer/community")({
  head: () => ({ meta: [{ title: "Topluluk | Hasat" }] }),
  component: Community,
});

const CATS = ["Tümü", "Safran", "Pazar", "Hava", "Hastalık", "Diğer"];

function Community() {
  return (
    <>
      <FarmerHeader title="Topluluk" subtitle="Üreticilerle bilgi paylaş" />
      <CommunityFeed categories={CATS} defaultCategory="Diğer" />
    </>
  );
}
