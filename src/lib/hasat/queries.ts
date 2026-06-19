import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Parcel, HarvestEntry, Listing, Offer, Order, OrderStatus, BuyerType } from "./types";

export function useAuthUserId() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return userId;
}

// ---- mappers ----
const emptyCosts = { labor: 0, fertilizer: 0, packaging: 0, transport: 0, other: 0 };

export function dbToParcel(r: any): Parcel {
  return {
    id: r.id,
    name: r.name,
    area: Number(r.area),
    crops: r.crops ?? [],
    location: { lat: Number(r.lat ?? 0), lng: Number(r.lng ?? 0), label: r.location_label ?? "" },
  };
}

export function dbToEntry(r: any): HarvestEntry {
  const costs = (r.costs && typeof r.costs === "object") ? { ...emptyCosts, ...r.costs } : { ...emptyCosts };
  return {
    id: r.id,
    parcelId: r.parcel_id,
    date: r.harvest_date,
    crop: r.crop,
    quantity: Number(r.quantity),
    unit: r.unit,
    quality: r.quality,
    notes: r.notes ?? "",
    photos: r.photo_urls ?? [],
    costs,
  };
}

// ---- farm helper ----
const farmCache = new Map<string, string>();

async function ensureFarm(userId: string): Promise<string> {
  if (farmCache.has(userId)) return farmCache.get(userId)!;
  const { data: existing, error: e1 } = await supabase
    .from("farms").select("id").eq("farmer_id", userId).limit(1).maybeSingle();
  if (e1) throw e1;
  if (existing?.id) {
    farmCache.set(userId, existing.id);
    return existing.id;
  }
  const { data: created, error: e2 } = await supabase
    .from("farms").insert({ farmer_id: userId }).select("id").single();
  if (e2) throw e2;
  farmCache.set(userId, created.id);
  return created.id;
}

// ---- parcels ----
export function useParcels() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["parcels", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parcels").select("*")
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(dbToParcel);
    },
  });
}

export function useCreateParcel() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (p: Omit<Parcel, "id">) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const farm_id = await ensureFarm(userId);
      const { data, error } = await supabase.from("parcels").insert({
        farmer_id: userId,
        farm_id,
        name: p.name,
        area: p.area,
        crops: p.crops,
        location_label: p.location.label,
        lat: p.location.lat,
        lng: p.location.lng,
      }).select("*").single();
      if (error) throw error;
      return dbToParcel(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parcels", userId] }),
  });
}

export function useUpdateParcel() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Parcel> }) => {
      const dbPatch: any = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.area !== undefined) dbPatch.area = patch.area;
      if (patch.crops !== undefined) dbPatch.crops = patch.crops;
      if (patch.location?.label !== undefined) dbPatch.location_label = patch.location.label;
      if (patch.location?.lat !== undefined) dbPatch.lat = patch.location.lat;
      if (patch.location?.lng !== undefined) dbPatch.lng = patch.location.lng;
      const { error } = await supabase.from("parcels").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parcels", userId] }),
  });
}

export function useDeleteParcel() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parcels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parcels", userId] }),
  });
}

// ---- entries ----
export function useEntries() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["entries", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("harvest_entries").select("*")
        .eq("farmer_id", userId!)
        .order("harvest_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToEntry);
    },
  });
}

export function useEntry(entryId: string) {
  return useQuery({
    queryKey: ["entry", entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("harvest_entries").select("*").eq("id", entryId).maybeSingle();
      if (error) throw error;
      return data ? dbToEntry(data) : null;
    },
  });
}

export function useCreateEntry() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (e: Omit<HarvestEntry, "id">) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase.from("harvest_entries").insert({
        farmer_id: userId,
        parcel_id: e.parcelId,
        crop: e.crop,
        quantity: e.quantity,
        unit: e.unit,
        quality: e.quality,
        notes: e.notes || null,
        costs: e.costs as any,
        harvest_date: e.date,
        photo_urls: [],
      }).select("*").single();
      if (error) throw error;
      return dbToEntry(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", userId] }),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("harvest_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["entries", userId] });
      qc.removeQueries({ queryKey: ["entry", id] });
    },
  });
}

// ---- certifications ----
export interface CertRow {
  id: string;
  type: string;
  verified_at: string | null;
  expires_at: string | null;
  document_url: string | null;
}

export const CERT_TYPES = ["organik", "iso", "cografi", "hasat", "premium", "yeni"] as const;
export type CertType = (typeof CERT_TYPES)[number];

export function useCertifications() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["certifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications").select("*")
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CertRow[];
    },
  });
}

export function useUploadCertification() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ type, file, expiresAt }: { type: CertType; file: File; expiresAt?: string | null }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const path = `${userId}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("certificates").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("certifications").insert({
        farmer_id: userId,
        type,
        document_url: path,
        expires_at: expiresAt || null,
      });
      if (error) {
        await supabase.storage.from("certificates").remove([path]);
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certifications", userId] }),
  });
}

export function useDeleteCertification() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, document_url }: { id: string; document_url: string | null }) => {
      const { error } = await supabase.from("certifications").delete().eq("id", id);
      if (error) throw error;
      if (document_url) await supabase.storage.from("certificates").remove([document_url]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certifications", userId] }),
  });
}

export async function getCertificationSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("certificates").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---- profile ----
export interface ProfileRow {
  id: string;
  name: string | null;
  city: string | null;
  role: string | null;
  phone: string | null;
}

export function useProfile() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id, name, city, role, phone")
        .eq("id", userId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProfileRow | null;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (patch: { name?: string; city?: string }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}



// =====================================================================
// MARKETPLACE — listings, offers, orders
// =====================================================================

// ---- delivery label mapping (DB enum <-> UI label) ----
const DELIVERY_DB_TO_LABEL: Record<string, string> = {
  "kargo-buyer": "Kargo (Alıcı Öder)",
  "kargo-seller": "Kargo",
  "elden": "Üreticiden Teslim",
};
export function deliveryLabel(db?: string | null): string {
  if (!db) return "Kargo";
  return DELIVERY_DB_TO_LABEL[db] ?? db;
}
export function deliveryToDb(label?: string): "kargo-buyer" | "kargo-seller" | "elden" {
  if (!label) return "kargo-seller";
  const l = label.toLowerCase();
  if (l.includes("üretici") || l.includes("teslim al") || l.includes("alıcı alır") || l.includes("kapıda")) return "elden";
  if (l.includes("alıcı")) return "kargo-buyer";
  return "kargo-seller";
}

// ---- mappers ----
export function dbToListing(r: any): Listing {
  return {
    id: r.id,
    crop: r.crop,
    quantity: Number(r.quantity),
    unit: r.unit,
    pricePerUnit: Number(r.price_per_unit),
    minOrder: Number(r.min_order),
    quality: r.quality,
    status: r.status,
    producerId: r.farmer_id,
  };
}

export interface ActiveListing extends Listing {
  farmerName: string;
  farmerCity: string;
}

export function dbToActiveListing(r: any): ActiveListing {
  return {
    ...dbToListing(r),
    farmerName: r.profiles?.name ?? "Üretici",
    farmerCity: r.profiles?.city ?? "",
  };
}

function dbToOffer(r: any, side: "farmer" | "buyer"): Offer {
  const counter = r.counter_offer && typeof r.counter_offer === "object" ? r.counter_offer : null;
  const partyName =
    side === "farmer" ? (r.buyer?.name ?? "Alıcı") : (r.farmer?.name ?? "Üretici");
  return {
    id: r.id,
    buyerName: partyName,
    buyerType: ((r.buyer?.buyer_type as BuyerType) ?? "restoran") as BuyerType,
    crop: r.listing?.crop ?? "—",
    unit: (r.listing?.unit ?? "kg") as Offer["unit"],
    quantity: Number(r.quantity),
    pricePerUnit: Number(r.price_per_unit),
    createdAt: r.created_at,
    status: r.status,
    note: r.note ?? undefined,
    delivery: deliveryLabel(r.delivery),
    deliveryDate: r.delivery_date ?? undefined,
    original: counter
      ? {
          quantity: Number(counter.quantity ?? r.quantity),
          pricePerUnit: Number(counter.pricePerUnit ?? r.price_per_unit),
          delivery: counter.delivery,
          deliveryDate: counter.deliveryDate,
          note: counter.note,
        }
      : undefined,
    producerId: r.farmer_id,
  };
}

function dbToOrder(r: any, side: "farmer" | "buyer"): Order {
  const offer = r.offer ?? {};
  const listing = offer.listing ?? {};
  const qty = Number(offer.quantity ?? 0);
  const price = Number(offer.price_per_unit ?? 0);
  const partyName = side === "buyer" ? (r.farmer?.name ?? "Üretici") : (r.buyer?.name ?? "Alıcı");
  // DB order_status -> UI OrderStatus
  const statusMap: Record<string, OrderStatus> = {
    preparing: "preparing",
    shipped: "shipped",
    delivered: "delivered",
    completed: "delivered",
    disputed: "preparing",
  };
  return {
    id: r.id,
    code: r.order_ref,
    producerId: r.farmer_id,
    producerName: partyName,
    crop: listing.crop ?? "—",
    quantity: qty,
    unit: (listing.unit ?? "kg") as Order["unit"],
    pricePerUnit: price,
    total: qty * price,
    delivery: "Kargo",
    deliveryDate: offer.delivery_date ?? "",
    status: statusMap[r.status] ?? "preparing",
    createdAt: r.created_at,
    timeline: [],
  };
}

const TIMELINE_DEFAULT: { key: OrderStatus; label: string }[] = [
  { key: "sent", label: "Teklif Gönderildi" },
  { key: "accepted", label: "Kabul Edildi" },
  { key: "preparing", label: "Hazırlanıyor" },
  { key: "shipped", label: "Kargoya Verildi" },
  { key: "delivered", label: "Teslim Edildi" },
];

function dbToTimeline(rows: any[]): Order["timeline"] {
  // map step keys: 'submitted' -> 'sent'
  const byKey = new Map<string, string>();
  for (const r of rows) {
    const key = r.step === "submitted" ? "sent" : r.step;
    if (r.completed_at) byKey.set(key, r.completed_at);
  }
  return TIMELINE_DEFAULT.map((s) => ({
    key: s.key,
    label: s.label,
    doneAt: byKey.get(s.key) ?? undefined,
  }));
}

// =====================================================================
// LISTINGS
// =====================================================================
export function useFarmerListings() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["farmerListings", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings").select("*")
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToListing);
    },
  });
}

export function useActiveListings() {
  return useQuery({
    queryKey: ["activeListings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*, profiles!listings_farmer_id_fkey(id,name,city)")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToActiveListing);
    },
  });
}

export function useListing(listingId: string) {
  return useQuery({
    queryKey: ["listing", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*, profiles!listings_farmer_id_fkey(id,name,city)")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      return data ? dbToActiveListing(data) : null;
    },
  });
}

export interface ListingInput {
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  pricePerUnit: number;
  minOrder: number;
  quality: "A" | "B" | "C";
  description?: string;
  harvestEntryId?: string | null;
}

export function useCreateListing() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (l: ListingInput) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase.from("listings").insert({
        farmer_id: userId,
        harvest_entry_id: l.harvestEntryId ?? null,
        crop: l.crop,
        quantity: l.quantity,
        unit: l.unit,
        price_per_unit: l.pricePerUnit,
        min_order: l.minOrder,
        quality: l.quality,
        description: l.description ?? null,
        status: "active",
      }).select("*").single();
      if (error) throw error;
      return dbToListing(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
      qc.invalidateQueries({ queryKey: ["activeListings"] });
    },
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Listing> }) => {
      const dbPatch: any = {};
      if (patch.crop !== undefined) dbPatch.crop = patch.crop;
      if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
      if (patch.unit !== undefined) dbPatch.unit = patch.unit;
      if (patch.pricePerUnit !== undefined) dbPatch.price_per_unit = patch.pricePerUnit;
      if (patch.minOrder !== undefined) dbPatch.min_order = patch.minOrder;
      if (patch.quality !== undefined) dbPatch.quality = patch.quality;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      const { error } = await supabase.from("listings").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
      qc.invalidateQueries({ queryKey: ["activeListings"] });
    },
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
      qc.invalidateQueries({ queryKey: ["activeListings"] });
    },
  });
}

// =====================================================================
// OFFERS
// =====================================================================
export function useFarmerOffers() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["farmerOffers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*, buyer:profiles!offers_buyer_id_fkey(id,name,city), listing:listings(crop,unit)")
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => dbToOffer(r, "farmer"));
    },
  });
}

export function useBuyerOffers() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["buyerOffers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*, farmer:profiles!offers_farmer_id_fkey(id,name,city), listing:listings(crop,unit)")
        .eq("buyer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => dbToOffer(r, "buyer"));
    },
  });
}

export interface OfferInput {
  farmerId: string;
  listingId: string;
  quantity: number;
  pricePerUnit: number;
  delivery?: string;
  deliveryDate?: string;
  note?: string;
}

export function useCreateOffer() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (o: OfferInput) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase.from("offers").insert({
        buyer_id: userId,
        farmer_id: o.farmerId,
        listing_id: o.listingId,
        quantity: o.quantity,
        price_per_unit: o.pricePerUnit,
        delivery: deliveryToDb(o.delivery),
        delivery_date: o.deliveryDate || null,
        note: o.note || null,
        status: "pending",
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["farmerOffers"] });
    },
  });
}

export type OfferStatusUpdate = "accepted" | "rejected" | "counter" | "completed";

export function useUpdateOfferStatus() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OfferStatusUpdate }) => {
      const { data: offerRow, error: e1 } = await supabase
        .from("offers").update({ status }).eq("id", id).select("*").single();
      if (e1) throw e1;

      if (status === "accepted") {
        const { data: order, error: e2 } = await supabase.from("orders").insert({
          offer_id: offerRow.id,
          buyer_id: offerRow.buyer_id,
          farmer_id: offerRow.farmer_id,
          status: "preparing",
          order_ref: "",
        } as any).select("id").single();
        if (e2) throw e2;
        const { error: e3 } = await supabase.from("order_timeline").insert({
          order_id: order.id,
          step: "submitted",
          label: "Sipariş Alındı",
          completed_at: new Date().toISOString(),
        });
        if (e3) throw e3;
      }
      return offerRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["farmerOrders", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOrders", userId] });
    },
  });
}

export interface OfferCounterPatch {
  quantity: number;
  pricePerUnit: number;
  delivery?: string;
  deliveryDate?: string;
  note?: string;
}

export function useCounterOffer() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, patch, original }: { id: string; patch: OfferCounterPatch; original?: OfferCounterPatch }) => {
      const { error } = await supabase.from("offers").update({
        quantity: patch.quantity,
        price_per_unit: patch.pricePerUnit,
        delivery: deliveryToDb(patch.delivery),
        delivery_date: patch.deliveryDate || null,
        note: patch.note ?? null,
        status: "counter",
        counter_offer: original ?? null,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
    },
  });
}

// =====================================================================
// ORDERS
// =====================================================================
const ORDER_SELECT =
  "*, offer:offers(quantity,price_per_unit,delivery_date,listing_id, listing:listings(crop,unit))";

export function useFarmerOrders() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["farmerOrders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`${ORDER_SELECT}, buyer:profiles!orders_buyer_id_fkey(id,name)`)
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => dbToOrder(r, "farmer"));
    },
  });
}

export function useBuyerOrders() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["buyerOrders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(`${ORDER_SELECT}, farmer:profiles!orders_farmer_id_fkey(id,name,city)`)
        .eq("buyer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => dbToOrder(r, "buyer"));
    },
  });
}

export function useOrderTimeline(orderId: string) {
  return useQuery({
    queryKey: ["orderTimeline", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_timeline")
        .select("*")
        .eq("order_id", orderId)
        .order("completed_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return dbToTimeline(data ?? []);
    },
  });
}

// shared loading dots (3-cycle)
export { ProgressDots } from "@/components/hasat/ProgressDots";

// ---- price alerts (4A) ----
export interface PriceAlertRow {
  id: string;
  crop: string;
  target: number;
  condition: "above" | "below";
  channels: { whatsapp: boolean; push: boolean; sms: boolean };
  active: boolean;
  createdAt: string;
}

function dbToPriceAlert(r: any): PriceAlertRow {
  const ch: string[] = Array.isArray(r.channels) ? r.channels : [];
  return {
    id: r.id,
    crop: r.crop,
    target: Number(r.target_price),
    condition: r.condition,
    channels: { whatsapp: ch.includes("whatsapp"), push: ch.includes("push"), sms: ch.includes("sms") },
    active: !!r.active,
    createdAt: r.created_at,
  };
}

export function usePriceAlerts() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["priceAlerts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_alerts").select("*")
        .eq("farmer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToPriceAlert);
    },
  });
}

export function useCreatePriceAlert() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: { crop: string; target: number; condition: "above" | "below"; channels: { whatsapp: boolean; push: boolean; sms: boolean } }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const channels = (Object.keys(input.channels) as Array<keyof typeof input.channels>).filter((k) => input.channels[k]);
      const { data, error } = await supabase.from("price_alerts").insert({
        farmer_id: userId,
        crop: input.crop,
        target_price: input.target,
        condition: input.condition,
        channels,
        active: true,
      }).select("*").single();
      if (error) throw error;
      return dbToPriceAlert(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["priceAlerts"] }),
  });
}

export function useDeletePriceAlert() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("price_alerts").delete().eq("id", id).eq("farmer_id", userId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["priceAlerts"] }),
  });
}

export function useTogglePriceAlert() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("price_alerts").update({ active }).eq("id", id).eq("farmer_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["priceAlerts"] }),
  });
}

// ---- harvest subscriptions (4B) ----
export interface SubscriptionRow {
  id: string;
  buyerId: string;
  farmerId: string;
  farmerName: string | null;
  farmerCity: string | null;
  nextHarvestDate: string | null;
  estimatedQty: number | null;
  volumeCommitment: number | null;
  priceLock: boolean;
  lockedPrice: number | null;
  lockedAt: string | null;
  status: string;
  createdAt: string;
}

function dbToSubscription(r: any): SubscriptionRow {
  return {
    id: r.id,
    buyerId: r.buyer_id,
    farmerId: r.farmer_id,
    farmerName: r.farmer?.name ?? null,
    farmerCity: r.farmer?.city ?? null,
    nextHarvestDate: r.next_harvest_date,
    estimatedQty: r.estimated_qty != null ? Number(r.estimated_qty) : null,
    volumeCommitment: r.volume_commitment != null ? Number(r.volume_commitment) : null,
    priceLock: !!r.price_lock,
    lockedPrice: r.locked_price != null ? Number(r.locked_price) : null,
    lockedAt: r.locked_at,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function useMySubscriptions() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["mySubscriptions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("harvest_subscriptions")
        .select("*, farmer:profiles!harvest_subscriptions_farmer_id_fkey(id,name,city)")
        .eq("buyer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToSubscription);
    },
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: {
      farmerId: string;
      volumeCommitment: number;
      priceLock: boolean;
      lockedPrice?: number | null;
      nextHarvestDate?: string | null;
      estimatedQty?: number | null;
    }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase.from("harvest_subscriptions").insert({
        buyer_id: userId,
        farmer_id: input.farmerId,
        volume_commitment: input.volumeCommitment,
        price_lock: input.priceLock,
        locked_price: input.priceLock ? input.lockedPrice ?? null : null,
        locked_at: input.priceLock ? new Date().toISOString() : null,
        next_harvest_date: input.nextHarvestDate ?? null,
        estimated_qty: input.estimatedQty ?? null,
        status: "active",
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mySubscriptions"] }),
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase
        .from("harvest_subscriptions")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("buyer_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mySubscriptions"] }),
  });
}

// ---- community posts (4C) ----
export interface CommunityPostRow {
  id: string;
  authorId: string;
  authorName: string | null;
  authorCity: string | null;
  content: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

function dbToPost(r: any): CommunityPostRow {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author?.name ?? null,
    authorCity: r.author?.city ?? null,
    content: r.content,
    category: r.category,
    likesCount: r.likes_count ?? 0,
    commentsCount: r.comments_count ?? 0,
    createdAt: r.created_at,
  };
}

export function useCommunityPosts(categoryFilter?: string) {
  const filter = categoryFilter && categoryFilter !== "Tümü" ? categoryFilter : null;
  return useQuery({
    queryKey: ["communityPosts", filter],
    queryFn: async () => {
      let q = supabase
        .from("community_posts")
        .select("*, author:profiles!community_posts_author_id_fkey(id,name,city)")
        .order("created_at", { ascending: false });
      if (filter) q = q.eq("category", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(dbToPost);
    },
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: { content: string; category: string }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase.from("community_posts").insert({
        author_id: userId,
        content: input.content,
        category: input.category,
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communityPosts"] }),
  });
}
