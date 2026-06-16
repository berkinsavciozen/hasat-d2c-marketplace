import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  HarvestEntry, Listing, Offer, Order, OrderStatus, Parcel, PendingOffer, PriceAlert, PricePoint,
  Producer, Role, Subscription, User,
} from "./types";

export type NotifEvent = "offer" | "price" | "harvest" | "community";
export type NotifChannel = "whatsapp" | "push" | "sms";
export type NotifPrefs = Record<NotifEvent, Record<NotifChannel, boolean>>;

interface Store {
  user: User | null;
  parcels: Parcel[];
  entries: HarvestEntry[];
  listings: Listing[];
  prices: PricePoint[];
  offers: Offer[];
  producers: Producer[];
  orders: Order[];
  subscriptions: Subscription[];
  pendingOffer: PendingOffer | null;
  notifPrefs: NotifPrefs;
  setRole: (role: Role | null) => void;
  setPremium: (v: boolean) => void;
  updateUser: (patch: Partial<User>) => void;
  addParcel: (p: Omit<Parcel, "id">) => Parcel;
  updateParcel: (id: string, patch: Partial<Parcel>) => void;
  deleteParcel: (id: string) => void;
  addEntry: (e: Omit<HarvestEntry, "id">) => HarvestEntry;
  deleteEntry: (id: string) => void;
  addListing: (l: Omit<Listing, "id">) => Listing;
  updateListing: (id: string, patch: Partial<Listing>) => void;
  addOffer: (o: Omit<Offer, "id">) => Offer;
  updateOffer: (id: string, patch: Partial<Offer>) => void;
  setPendingOffer: (p: PendingOffer | null) => void;
  addOrder: (o: Omit<Order, "id">) => Order;
  addSubscription: (s: Omit<Subscription, "id">) => Subscription;
  setNotifPref: (e: NotifEvent, c: NotifChannel, v: boolean) => void;
  reset: () => void;
}

const seedParcels: Parcel[] = [
  { id: "p1", name: "Parsel A — Safran", area: 3, crops: ["Safran"], location: { lat: 41.25, lng: 32.69, label: "Karabük, Safranbolu" } },
  { id: "p2", name: "Parsel B — Lavanta", area: 2, crops: ["Lavanta"], location: { lat: 41.24, lng: 32.7, label: "Karabük, Safranbolu" } },
];

const seedEntries: HarvestEntry[] = [
  { id: "h1", parcelId: "p1", date: "2027-11-12", crop: "Safran", quantity: 380, unit: "g", quality: "A", photos: [], notes: "İlk yıl hasadı.", costs: { labor: 18000, fertilizer: 4000, packaging: 2500, transport: 1500, other: 1000 }, pricePerUnit: 320 },
  { id: "h2", parcelId: "p1", date: "2028-11-08", crop: "Safran", quantity: 540, unit: "g", quality: "A", photos: [], notes: "Verim arttı.", costs: { labor: 22000, fertilizer: 5000, packaging: 3000, transport: 1800, other: 1200 }, pricePerUnit: 345 },
  { id: "h3", parcelId: "p2", date: "2028-07-15", crop: "Lavanta", quantity: 120, unit: "kg", quality: "B", photos: [], notes: "", costs: { labor: 9000, fertilizer: 2500, packaging: 1500, transport: 1200, other: 800 }, pricePerUnit: 180 },
];

const seedListings: Listing[] = [
  { id: "l1", crop: "Safran", quantity: 200, unit: "g", pricePerUnit: 360, minOrder: 10, quality: "A", status: "active", producerId: "pr1" },
  { id: "l2", crop: "Lavanta", quantity: 80, unit: "kg", pricePerUnit: 200, minOrder: 5, quality: "B", status: "active", producerId: "pr1" },
  { id: "l3", crop: "Safran", quantity: 0, unit: "g", pricePerUnit: 340, minOrder: 10, quality: "A", status: "sold" },
  { id: "l4", crop: "Lavanta", quantity: 30, unit: "kg", pricePerUnit: 170, minOrder: 5, quality: "C", status: "expired" },
];

const seedPrices: PricePoint[] = [
  { crop: "Safran", hal: 280, d2c: 358, export: 12.4, date: "2028-11-15", delta7d: 8.4 },
  { crop: "Lavanta", hal: 140, d2c: 195, export: 6.2, date: "2028-11-15", delta7d: 3.1 },
  { crop: "Tıbbi Bitkiler", hal: 80, d2c: 110, export: 3.4, date: "2028-11-15", delta7d: -1.2 },
  { crop: "Fındık", hal: 220, d2c: 275, export: 8.1, date: "2028-11-15", delta7d: 2.0 },
  { crop: "Zeytinyağı", hal: 320, d2c: 410, export: 12.0, date: "2028-11-15", delta7d: -0.5 },
];

const seedOffers: Offer[] = [
  { id: "o1", buyerName: "Mikla Restaurant", buyerType: "restoran", crop: "Safran", unit: "g", quantity: 50, pricePerUnit: 355, createdAt: "2028-11-14T10:30:00Z", status: "pending" },
  { id: "o2", buyerName: "Macro Center", buyerType: "market", crop: "Lavanta", unit: "kg", quantity: 25, pricePerUnit: 190, createdAt: "2028-11-14T08:15:00Z", status: "pending" },
  { id: "o3", buyerName: "Çırağan Palace", buyerType: "otel", crop: "Safran", unit: "g", quantity: 100, pricePerUnit: 340, createdAt: "2028-11-13T14:00:00Z", status: "counter" },
  { id: "o4", buyerName: "Anatolian Exports Ltd.", buyerType: "ihracatci", crop: "Lavanta", unit: "kg", quantity: 60, pricePerUnit: 210, createdAt: "2028-11-12T09:00:00Z", status: "accepted" },
  { id: "o5", buyerName: "Neolokal", buyerType: "restoran", crop: "Safran", unit: "g", quantity: 30, pricePerUnit: 360, createdAt: "2028-11-10T11:00:00Z", status: "active" },
  { id: "o6", buyerName: "Lokanta Maya", buyerType: "restoran", crop: "Lavanta", unit: "kg", quantity: 15, pricePerUnit: 195, createdAt: "2028-11-05T16:00:00Z", status: "completed" },
];

const seedProducers: Producer[] = [
  {
    id: "pr1", name: "Ahmet Yılmaz Safran Çiftliği", city: "Karabük, Safranbolu",
    rating: 4.9, ordersCount: 142, experience: "23 yıl", totalLand: "5 dönüm",
    avgQuality: "A+", responseTime: "48 saat",
    badges: ["premium", "organik", "iso", "cografi", "hasat"],
    crops: ["Safran"],
    listings: [
      { id: "l1", crop: "Safran", quantity: 200, unit: "g", pricePerUnit: 360, minOrder: 10, quality: "A", status: "active", producerId: "pr1" },
      { id: "lx2", crop: "Lavanta Yağı", quantity: 40, unit: "L", pricePerUnit: 480, minOrder: 2, quality: "A", status: "active", producerId: "pr1" },
    ],
    yieldHistory: [{ year: "2027", value: 380 }, { year: "2028", value: 540 }, { year: "2029", value: 620 }],
    reviews: [
      { id: "r1", quote: "İstanbul'un en iyi safranı. Aroma ve renk olağanüstü.", buyer: "Mikla Restaurant", date: "Eylül 2028", rating: 5 },
      { id: "r2", quote: "Hep zamanında, hep kaliteli. Tekrar sipariş veriyoruz.", buyer: "Çırağan Palace", date: "Ağustos 2028", rating: 5 },
    ],
    nextHarvest: { date: "Kasım 2029", estimatedQty: "~500g", pricePerUnit: 23000, unit: "g" },
  },
  {
    id: "pr2", name: "Fatma Kaya Lavanta Bahçesi", city: "Isparta, Kuyucak",
    rating: 4.7, ordersCount: 89, experience: "12 yıl", totalLand: "8 dönüm",
    avgQuality: "A", responseTime: "12 saat",
    badges: ["organik", "cografi", "hasat"],
    crops: ["Lavanta"],
    listings: [
      { id: "lk1", crop: "Lavanta", quantity: 80, unit: "kg", pricePerUnit: 200, minOrder: 5, quality: "A", status: "active", producerId: "pr2" },
    ],
    yieldHistory: [{ year: "2027", value: 90 }, { year: "2028", value: 120 }, { year: "2029", value: 145 }],
    reviews: [{ id: "r3", quote: "Aroma çok yoğun. Sabunlarımızda kullanıyoruz.", buyer: "Atelier Rebul", date: "Haziran 2028", rating: 5 }],
    nextHarvest: { date: "Temmuz 2029", estimatedQty: "~150kg", pricePerUnit: 220, unit: "kg" },
  },
  {
    id: "pr3", name: "Mehmet Sarı Şifa Bitkileri", city: "İzmir, Bayındır",
    rating: 4.6, ordersCount: 56, experience: "8 yıl", totalLand: "12 dönüm",
    avgQuality: "B+", responseTime: "24 saat",
    badges: ["organik", "yeni"],
    crops: ["Tıbbi Bitkiler"],
    listings: [
      { id: "lt1", crop: "Adaçayı", quantity: 60, unit: "kg", pricePerUnit: 130, minOrder: 5, quality: "A", status: "active", producerId: "pr3" },
    ],
    yieldHistory: [{ year: "2027", value: 200 }, { year: "2028", value: 280 }, { year: "2029", value: 310 }],
    reviews: [{ id: "r4", quote: "Çeşit zenginliği harika.", buyer: "Herbalist Co.", date: "Mayıs 2028", rating: 4 }],
    nextHarvest: { date: "Eylül 2029", estimatedQty: "~250kg", pricePerUnit: 140, unit: "kg" },
  },
  {
    id: "pr4", name: "Zeynep Aydın Fındık Kooperatifi", city: "Giresun",
    rating: 4.8, ordersCount: 230, experience: "30 yıl", totalLand: "50 dönüm",
    avgQuality: "A", responseTime: "6 saat",
    badges: ["premium", "cografi", "hasat"],
    crops: ["Fındık"],
    listings: [
      { id: "lf1", crop: "Tombul Fındık", quantity: 5000, unit: "kg", pricePerUnit: 275, minOrder: 100, quality: "A", status: "active", producerId: "pr4" },
    ],
    yieldHistory: [{ year: "2027", value: 4500 }, { year: "2028", value: 5200 }, { year: "2029", value: 5800 }],
    reviews: [{ id: "r5", quote: "Tutarlı kalite, geniş hacim. Yıllık tedarikçimiz.", buyer: "Ülker", date: "Ekim 2028", rating: 5 }],
    nextHarvest: { date: "Ağustos 2029", estimatedQty: "~6 ton", pricePerUnit: 290, unit: "kg" },
  },
];

const ts = (offsetDays: number) => {
  const d = new Date(); d.setDate(d.getDate() - offsetDays); return d.toISOString();
};

const tlSteps = (status: OrderStatus): Order["timeline"] => {
  const all: { key: OrderStatus; label: string }[] = [
    { key: "sent", label: "Teklif Gönderildi" },
    { key: "accepted", label: "Kabul Edildi" },
    { key: "preparing", label: "Hazırlanıyor" },
    { key: "shipped", label: "Kargoya Verildi" },
    { key: "delivered", label: "Teslim Edildi" },
  ];
  const order: OrderStatus[] = ["sent", "accepted", "preparing", "shipped", "delivered"];
  const idx = order.indexOf(status);
  return all.map((s, i) => ({ ...s, doneAt: i <= idx ? ts(10 - i * 2) : undefined }));
};

const seedOrders: Order[] = [
  { id: "od1", code: "HT-2028-0847", producerId: "pr1", producerName: "Ahmet Yılmaz Safran Çiftliği", crop: "Safran", quantity: 50, unit: "g", pricePerUnit: 360, total: 18000, delivery: "Kargo", deliveryDate: "2028-11-25", status: "preparing", createdAt: ts(8), timeline: tlSteps("preparing") },
  { id: "od2", code: "HT-2028-0852", producerId: "pr2", producerName: "Fatma Kaya Lavanta Bahçesi", crop: "Lavanta", quantity: 20, unit: "kg", pricePerUnit: 200, total: 4000, delivery: "Kargo", deliveryDate: "2028-11-28", status: "shipped", createdAt: ts(5), timeline: tlSteps("shipped") },
  { id: "od3", code: "HT-2028-0820", producerId: "pr4", producerName: "Zeynep Aydın Fındık Kooperatifi", crop: "Fındık", quantity: 200, unit: "kg", pricePerUnit: 275, total: 55000, delivery: "Lojistik", deliveryDate: "2028-10-30", status: "delivered", createdAt: ts(30), timeline: tlSteps("delivered") },
  { id: "od4", code: "HT-2028-0791", producerId: "pr3", producerName: "Mehmet Sarı Şifa Bitkileri", crop: "Adaçayı", quantity: 15, unit: "kg", pricePerUnit: 130, total: 1950, delivery: "Kargo", deliveryDate: "2028-10-12", status: "delivered", createdAt: ts(45), timeline: tlSteps("delivered") },
];

const seedNotifPrefs: NotifPrefs = {
  offer: { whatsapp: true, push: true, sms: false },
  price: { whatsapp: true, push: true, sms: false },
  harvest: { whatsapp: true, push: false, sms: false },
  community: { whatsapp: false, push: true, sms: false },
};

const newId = () => Math.random().toString(36).slice(2, 10);

export const useHasat = create<Store>()(
  persist(
    (set) => ({
      user: null,
      parcels: seedParcels,
      entries: seedEntries,
      listings: seedListings,
      prices: seedPrices,
      offers: seedOffers,
      producers: seedProducers,
      orders: seedOrders,
      subscriptions: [],
      pendingOffer: null,
      notifPrefs: seedNotifPrefs,
      setRole: (role) =>
        set(() => ({
          user: role
            ? { id: "u1", role, name: role === "farmer" ? "Mehmet Yılmaz" : "Ayşe Demir", phone: "+90 555 000 0000", city: role === "farmer" ? "Karabük" : "İstanbul", premium: false }
            : null,
        })),
      setPremium: (v) => set((s) => ({ user: s.user ? { ...s.user, premium: v } : s.user })),
      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      addParcel: (p) => { const np: Parcel = { ...p, id: newId() }; set((s) => ({ parcels: [...s.parcels, np] })); return np; },
      updateParcel: (id, patch) => set((s) => ({ parcels: s.parcels.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteParcel: (id) => set((s) => ({ parcels: s.parcels.filter((p) => p.id !== id) })),
      addEntry: (e) => { const ne: HarvestEntry = { ...e, id: newId() }; set((s) => ({ entries: [ne, ...s.entries] })); return ne; },
      deleteEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      addListing: (l) => { const nl: Listing = { ...l, id: newId() }; set((s) => ({ listings: [nl, ...s.listings] })); return nl; },
      updateListing: (id, patch) => set((s) => ({ listings: s.listings.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      addOffer: (o) => { const no: Offer = { ...o, id: newId() }; set((s) => ({ offers: [no, ...s.offers] })); return no; },
      updateOffer: (id, patch) => set((s) => ({ offers: s.offers.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      setPendingOffer: (p) => set({ pendingOffer: p }),
      addOrder: (o) => { const no: Order = { ...o, id: newId() }; set((s) => ({ orders: [no, ...s.orders] })); return no; },
      addSubscription: (s) => { const ns: Subscription = { ...s, id: newId() }; set((st) => ({ subscriptions: [ns, ...st.subscriptions] })); return ns; },
      setNotifPref: (event, channel, value) =>
        set((s) => ({ notifPrefs: { ...s.notifPrefs, [event]: { ...s.notifPrefs[event], [channel]: value } } })),
      reset: () => set({ user: null }),
    }),
    { name: "hasat-store" },
  ),
);
