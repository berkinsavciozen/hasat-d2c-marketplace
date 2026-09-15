import heroFarmerCrop from "@/assets/landing/hero-farmer-crop.jpg";
import youngFarmer from "@/assets/landing/young-farmer.jpg";

export const LANDING_MEDIA = {
  heroFarmerCrop,
  youngFarmer,
  realFarmerStory: null as string | null,
} as const;

export const FARMER_BENEFITS = [
  {
    title: "Talebi daha erken gör",
    body: "Ürün yetişmeden önce platformdaki mevcut talepleri, teklifleri ve düzenli alım fırsatlarını gör.",
  },
  {
    title: "Fiyatını veriye bakarak belirle",
    body: "Kaynağı belli hal fiyatlarıyla Hasat'ta tamamlanan satışları ayrı ayrı karşılaştır.",
  },
  {
    title: "Bütün müşterilerin tek yerde",
    body: "Teklifleri, kesinleşmiş siparişleri, düzenli alımları ve teslimatları tek kanaldan yönet.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    title: "Üretimini kaydet",
    body: "Ne yetiştireceğini, miktarı ve hasat zamanını sisteme gir.",
    state: "Üretim planı kayda hazır",
  },
  {
    title: "Gerçek talep, teklif ve fiyatları gör",
    body: "Mevcut alıcı taleplerini, kayıtlı teklifleri ve kaynağı belli fiyatları karşılaştır.",
    state: "Kaynaklar ayrı gösterilir",
  },
  {
    title: "Üretimi ve satışı yönet",
    body: "Tarla günlüğünü, siparişlerini, teslimatlarını ve ödemelerini tek yerden takip et.",
    state: "Her adım kayıt altında",
  },
] as const;

export const FARMER_FAQ = [
  {
    q: "Ürünüm henüz yetişmediyse mevcut talepleri görebilir miyim?",
    a: "Evet. Platformdaki açık ürün taleplerini inceleyebilir, üretim planını mevcut talebi görerek oluşturabilirsin. Talep, satın alma garantisi değildir.",
  },
  {
    q: "Birden fazla alıcıdan teklif alabilir miyim?",
    a: "Evet. Yayındaki ürününe gelen teklifleri aynı yerde görebilir ve her biri için kayıtlı biçimde yanıt verebilirsin.",
  },
  {
    q: "Diğer hallerdeki fiyatlar hangi kaynaklardan geliyor?",
    a: "Yalnızca kaynağı sistemde tanımlı resmî hal verileri gösterilir. Kaynak bağlantısı olmayan şehir veya haller bağlıymış gibi gösterilmez.",
  },
  {
    q: "Hal fiyatları ne zaman güncellendi?",
    a: "Güncellenme bilgisi veri kaynağından güvenilir biçimde geldiğinde fiyatla birlikte gösterilir. Bilgi mevcut değilse tarih üretilmez.",
  },
  {
    q: "Hasat satış ortalaması nasıl hesaplanıyor?",
    a: "Yalnızca platformdaki tamamlanmış gerçek satış kayıtları kullanılır. Yeterli anonimlik eşiği oluşmadan kesin ortalama yayımlanmaz.",
  },
  {
    q: "Hasat satış ortalamasına hangi işlemler dâhil ediliyor?",
    a: "İlanlar, bekleyen teklifler ve kabul edilmiş teklifler satış ortalamasına katılmaz; yalnızca tamamlanmış satış kayıtları kullanılır.",
  },
  {
    q: "İlan, teklif, kabul edilmiş teklif ve gerçekleşen satış fiyatının farkı nedir?",
    a: "İlan satıcının istediği fiyatı, teklif alıcının önerisini, kabul edilmiş teklif tarafların mutabakatını, gerçekleşen satış ise tamamlanmış işlemi ifade eder.",
  },
  {
    q: "Hasat AI hangi bilgileri otomatik olarak düzenleyebilir?",
    a: "Yazdığın üretim ve işlem bilgilerini kayıt alanlarına dönüştürmeye yardımcı olur. Vermediğin miktar, maliyet veya fiyatı tahmin etmez; kayıt kesinleşmeden önce onayını ister.",
  },
  {
    q: "Tarla günlüğüne neler kaydedilir?",
    a: "Sulama, gübreleme, bakım, fotoğraf ve hasat gibi üretim adımlarını kendi gerçekleşmiş kayıtlarınla tutabilirsin.",
  },
  {
    q: "Ödeme ve komisyon nasıl çalışır?",
    a: "Ödeme, anlaşılan sipariş tutarı üzerinden çiftçinin IBAN'ına yapılır. Platform komisyonu sabit %5'tir.",
  },
  {
    q: "Alıcının teklif vermesi satın alma garantisi midir?",
    a: "Hayır. Teklif, taraflarca kabul edilip sipariş kesinleşene kadar satın alma garantisi oluşturmaz.",
  },
  {
    q: "Hasat'a nasıl başlarım?",
    a: "Telefon numaranla üretici olarak giriş yap, profilini tamamla ve üretim kaydını oluşturmaya başla.",
  },
] as const;

export const CONTACT_OPTIONS = [
  { value: "farmer", label: "Çiftçiyim" },
  { value: "buyer", label: "Alıcıyım" },
  { value: "partnership", label: "İş birliği yapmak istiyorum" },
  { value: "information", label: "Platform hakkında bilgi almak istiyorum" },
  { value: "other", label: "Diğer" },
] as const;

export type ContactTopic = (typeof CONTACT_OPTIONS)[number]["value"];