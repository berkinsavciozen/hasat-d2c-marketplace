import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  HarvestEntry, Listing, Offer, Order, OrderStatus, Parcel, PendingOffer, PriceAlert, PricePoint,
  Producer, Role, Subscription, User,
} from "./types";


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
  priceAlerts: PriceAlert[];
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
  removeListing: (id: string) => void;
  addOffer: (o: Omit<Offer, "id">) => Offer;
  updateOffer: (id: string, patch: Partial<Offer>) => void;
  setPendingOffer: (p: PendingOffer | null) => void;
  addOrder: (o: Omit<Order, "id">) => Order;
  addSubscription: (s: Omit<Subscription, "id">) => Subscription;
  addPriceAlert: (a: Omit<PriceAlert, "id" | "createdAt">) => PriceAlert;
  removePriceAlert: (id: string) => void;
  reset: () => void;
}



const newId = () => Math.random().toString(36).slice(2, 10);

export const useHasat = create<Store>()(
  persist(
    (set) => ({
      user: null,
      parcels: [],
      entries: [],
      listings: [],
      prices: [],
      offers: [],
      producers: [],
      orders: [],

      subscriptions: [],
      pendingOffer: null,
      
      priceAlerts: [],
      setRole: (role) =>
        set(() => ({
          user: role
            ? { id: "u1", role, name: "", phone: "", city: "", premium: false }
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
      removeListing: (id) => set((s) => ({ listings: s.listings.filter((l) => l.id !== id) })),
      addOffer: (o) => { const no: Offer = { ...o, id: newId() }; set((s) => ({ offers: [no, ...s.offers] })); return no; },
      updateOffer: (id, patch) => set((s) => ({ offers: s.offers.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      setPendingOffer: (p) => set({ pendingOffer: p }),
      addOrder: (o) => { const no: Order = { ...o, id: newId() }; set((s) => ({ orders: [no, ...s.orders] })); return no; },
      addSubscription: (s) => { const ns: Subscription = { ...s, id: newId() }; set((st) => ({ subscriptions: [ns, ...st.subscriptions] })); return ns; },
      addPriceAlert: (a) => { const np: PriceAlert = { ...a, id: newId(), createdAt: new Date().toISOString() }; set((s) => ({ priceAlerts: [np, ...s.priceAlerts] })); return np; },
      removePriceAlert: (id) => set((s) => ({ priceAlerts: s.priceAlerts.filter((a) => a.id !== id) })),
      reset: () => set({ user: null }),
    }),
    { name: "hasat-store" },
  ),
);
