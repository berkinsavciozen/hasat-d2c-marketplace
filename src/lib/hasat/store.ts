import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HarvestEntry, Listing, Offer, Parcel, PricePoint, Role, User } from "./types";

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
  setNotifPref: (event: NotifEvent, channel: NotifChannel, value: boolean) => void;
  reset: () => void;
}

const seedParcels: Parcel[] = [
  { id: "p1", name: "Parsel A — Safran", area: 3, crops: ["Safran"], location: { lat: 41.25, lng: 32.69, label: "Karabük, Safranbolu" } },
  { id: "p2", name: "Parsel B — Lavanta", area: 2, crops: ["Lavanta"], location: { lat: 41.24, lng: 32.7, label: "Karabük, Safranbolu" } },
];

const seedEntries: HarvestEntry[] = [
  { id: "h1", parcelId: "p1", date: "2027-11-12", crop: "Safran", quantity: 380, unit: "g", quality: "A", photos: [], notes: "İlk yıl hasadı, hava güzeldi.", costs: { labor: 18000, fertilizer: 4000, packaging: 2500, transport: 1500, other: 1000 }, pricePerUnit: 320 },
  { id: "h2", parcelId: "p1", date: "2028-11-08", crop: "Safran", quantity: 540, unit: "g", quality: "A", photos: [], notes: "Verim arttı, sulama düzenliydi.", costs: { labor: 22000, fertilizer: 5000, packaging: 3000, transport: 1800, other: 1200 }, pricePerUnit: 345 },
  { id: "h3", parcelId: "p2", date: "2028-07-15", crop: "Lavanta", quantity: 120, unit: "kg", quality: "B", photos: [], notes: "", costs: { labor: 9000, fertilizer: 2500, packaging: 1500, transport: 1200, other: 800 }, pricePerUnit: 180 },
];

const seedListings: Listing[] = [
  { id: "l1", crop: "Safran", quantity: 200, unit: "g", pricePerUnit: 360, minOrder: 10, quality: "A", status: "active" },
  { id: "l2", crop: "Lavanta", quantity: 80, unit: "kg", pricePerUnit: 200, minOrder: 5, quality: "B", status: "active" },
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
      setNotifPref: (event, channel, value) =>
        set((s) => ({ notifPrefs: { ...s.notifPrefs, [event]: { ...s.notifPrefs[event], [channel]: value } } })),
      reset: () => set({ user: null }),
    }),
    { name: "hasat-store" },
  ),
);
