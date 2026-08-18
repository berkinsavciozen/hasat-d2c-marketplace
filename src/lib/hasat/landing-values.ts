// Ana sayfadaki rol bazlı değer önermeleri — tek kaynak.
// Yeni bir özellik yayına alındığında buraya BİR satır eklemek yeterli;
// `src/routes/index.tsx` içindeki RoleValues bölümü otomatik günceller.
//
// `icon` alanı lucide-react ikon adıdır; index.tsx içindeki ikon haritasına
// karşılık gelir (yeni bir ikon kullanırsan haritaya da ekle).

export type LandingValue = {
  /** lucide-react ikon anahtarı (index.tsx'teki ROLE_VALUE_ICONS) */
  icon: string;
  title: string;
  body: string;
  /** Varsa ilgili sayfaya iç bağlantı */
  href?: string;
  linkLabel?: string;
};

export const BUYER_VALUES: LandingValue[] = [
  {
    icon: "ChefHat",
    title: "Tarif kütüphanesi",
    body:
      "Hasat'ın editoryal tarifleri mevsimine göre yazılır. Beğendiğin tarifin malzemelerini, aynı sayfadan doğrudan üreticiden istersin — tarif mutfağınla tarla arasındaki en kısa yol.",
    href: "/tarifler",
    linkLabel: "Tarifleri gör",
  },
  {
    icon: "SlidersHorizontal",
    title: "Tarif filtreleri",
    body:
      "Süreye (30 dk, 1 saat, daha uzun), diyet etiketlerine ve malzemesi Hasat'ta bulunan tariflere göre süz; ne pişireceğine arzı görerek karar ver.",
  },
  {
    icon: "Sprout",
    title: "Malzemeden üreticiye",
    body:
      "Her malzemenin karşısında o ürünü şu an satan üreticiler listelenir. Tek tıkla teklif ver, pazarlığı mesajlaşarak sonuçlandır.",
  },
  {
    icon: "Package",
    title: "Sipariş takibi",
    body:
      "Teklif, onay, ödeme, kargo ve teslim — siparişinin her adımı tek bir zaman çizelgesinde görünür.",
  },
  {
    icon: "Bell",
    title: "Bildirim merkezi",
    body:
      "Teklifine yanıt geldiğinde, sipariş durumu değiştiğinde ya da aradığın ürün yeniden hasat edildiğinde haberin olur.",
  },
  {
    icon: "Repeat",
    title: "Düzenli tedarik",
    body:
      "Beğendiğin üreticiyle abonelik kurarsın; her hasat döneminde ürünün tekrar tekrar aramadan gelir.",
  },
];

export const FARMER_VALUES: LandingValue[] = [
  {
    icon: "Store",
    title: "Kendi vitrinin",
    body:
      "Parselin, ürünlerin ve hikayenle paylaşılabilir bir üretici sayfan olur; alıcı ürünü satın almadan önce seni tanır.",
  },
  {
    icon: "NotebookPen",
    title: "Hasat günlüğü",
    body:
      "Sulama, gübreleme ve hasat kayıtlarını fotoğrafıyla tutarsın; kayıtların doldukça izlenebilirlik seviyen yükselir.",
  },
  {
    icon: "LineChart",
    title: "Fiyat takibi",
    body:
      "Ürününün topluluk fiyat özetini görürsün; fiyatın piyasadan çok saparsa uyarılırsın.",
  },
  {
    icon: "MessageCircle",
    title: "WhatsApp ile günlük",
    body:
      "Tarladayken uygulamayı açmana gerek yok — hasadını yazarsın, Hasat AI kaydı senin yerine düzenler.",
  },
  {
    icon: "Bell",
    title: "Anlık bildirim",
    body:
      "Yeni teklif, karşı teklif ve ödeme onayı geldiği anda bildirim alırsın; hiçbir alıcı yanıtsız kalmaz.",
  },
  {
    icon: "ChefHat",
    title: "Tariflerde görünürlük",
    body:
      "Ürünün, Hasat'ın tariflerinde malzeme olarak geçtiğinde yeni alıcıların karşısına kendiliğinden çıkar.",
  },
];
