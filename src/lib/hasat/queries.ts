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
    photos: r.parcel_photo_urls ?? [],
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
    step_key: r.step_key ?? null,
    createdAt: r.created_at ?? undefined,
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

async function uploadParcelPhotos(userId: string, parcelId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    const path = `${userId}/${parcelId}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("parcel-photos").upload(path, file, { upsert: false });
    if (up.error) throw up.error;
    const { data } = supabase.storage.from("parcel-photos").getPublicUrl(path);
    out.push(data.publicUrl);
  }
  return out;
}

export function useCreateParcel() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (p: Omit<Parcel, "id"> & { photoFiles?: File[] }) => {
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
      let row = data;
      if (p.photoFiles && p.photoFiles.length > 0) {
        const urls = await uploadParcelPhotos(userId, data.id, p.photoFiles.slice(0, 5));
        const upd = await supabase.from("parcels").update({ parcel_photo_urls: urls }).eq("id", data.id).select("*").single();
        if (upd.error) throw upd.error;
        row = upd.data;
      }
      return dbToParcel(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parcels", userId] });
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
    },
  });
}

export function useUpdateParcel() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, patch, photoFiles, existingPhotos }: { id: string; patch: Partial<Parcel>; photoFiles?: File[]; existingPhotos?: string[] }) => {
      const dbPatch: any = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.area !== undefined) dbPatch.area = patch.area;
      if (patch.crops !== undefined) dbPatch.crops = patch.crops;
      if (patch.location?.label !== undefined) dbPatch.location_label = patch.location.label;
      if (patch.location?.lat !== undefined) dbPatch.lat = patch.location.lat;
      if (patch.location?.lng !== undefined) dbPatch.lng = patch.location.lng;
      if (existingPhotos !== undefined || (photoFiles && photoFiles.length > 0)) {
        const kept = existingPhotos ?? [];
        const uploaded = userId && photoFiles && photoFiles.length > 0
          ? await uploadParcelPhotos(userId, id, photoFiles)
          : [];
        dbPatch.parcel_photo_urls = [...kept, ...uploaded].slice(0, 5);
      }
      const { error } = await supabase.from("parcels").update(dbPatch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parcels", userId] });
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
    },
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

export function useParcelsByFarmer(farmerId: string | null | undefined) {
  return useQuery({
    queryKey: ["parcelsByFarmer", farmerId],
    enabled: !!farmerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parcels").select("*")
        .eq("farmer_id", farmerId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(dbToParcel);
    },
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

async function uploadHarvestPhotos(userId: string, entryId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    const path = `${userId}/${entryId}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("harvest-photos").upload(path, file, { upsert: false });
    if (up.error) throw up.error;
    const { data } = supabase.storage.from("harvest-photos").getPublicUrl(path);
    out.push(data.publicUrl);
  }
  return out;
}

export function useCreateEntry() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (e: Omit<HarvestEntry, "id"> & { photoFile?: File }) => {
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
        step_key: e.step_key ?? null,
      }).select("*").single();
      if (error) throw error;
      let row = data;
      if (e.photoFile) {
        const urls = await uploadHarvestPhotos(userId, data.id, [e.photoFile]);
        const upd = await supabase
          .from("harvest_entries")
          .update({ photo_urls: urls })
          .eq("id", data.id)
          .select("*")
          .single();
        if (upd.error) throw upd.error;
        row = upd.data;
      }
      return dbToEntry(row);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", userId] });
      qc.invalidateQueries({ queryKey: ["farmerListings", userId] });
      qc.invalidateQueries({ queryKey: ["listingStock"] });
      qc.invalidateQueries({ queryKey: ["listingBatchEntries"] });
    },
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
  tier: "free" | "premium" | null;
  iban: string | null;
  bank_account_name: string | null;
  referral_code?: string | null;
  premium_until?: string | null;
}

export function isEffectivelyPremium(p: Pick<ProfileRow, "tier" | "premium_until"> | null | undefined): boolean {
  if (!p || p.tier !== "premium") return false;
  if (!p.premium_until) return true;
  return new Date(p.premium_until).getTime() > Date.now();
}


export function useReferredFarmers() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["referredFarmers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, city, created_at")
        .eq("referred_by", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function lookupReferralOwner(code: string): Promise<{ id: string; name: string | null } | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const { data, error } = await (supabase as any)
    .from("public_farmer_profiles")
    .select("id, name")
    .eq("referral_code", clean)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

export async function applyStoredReferral(newProfileId: string) {
  if (typeof window === "undefined") return;
  const code = window.localStorage.getItem("hasat_ref");
  if (!code) return;
  const owner = await lookupReferralOwner(code);
  if (owner && owner.id !== newProfileId) {
    await supabase.from("profiles").update({ referred_by: owner.id }).eq("id", newProfileId);
  }
  window.localStorage.removeItem("hasat_ref");
}


export function useProfile() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles").select("id, name, city, role, phone, tier, iban, bank_account_name, referral_code, premium_until")
        .eq("id", userId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProfileRow | null;
    },
  });
}

export function useReferralQualifications() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["referralQualifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("referral_qualifications")
        .select("id, qualified_at, referred_user_id")
        .eq("referrer_id", userId!)
        .order("qualified_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; qualified_at: string; referred_user_id: string }[];
    },
  });
}


export function useAIUsageThisMonth() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["ai-usage-month", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      const { data, error } = await supabase
        .from("ai_usage_tracking")
        .select("message_count")
        .eq("user_id", userId!)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return { count: (data?.message_count as number | undefined) ?? 0 };
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (patch: { name?: string; city?: string; iban?: string | null; bank_account_name?: string | null }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("profiles").update(patch as any).eq("id", userId);
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
    photos: r.photo_urls ?? [],
    producerId: r.farmer_id,
    parcelId: r.parcel_id ?? null,
    description: r.description ?? undefined,
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
  const rawHistory = Array.isArray(r.negotiation_history) ? r.negotiation_history : [];
  const history = rawHistory
    .map((h: any) => ({
      by: h?.by === "farmer" ? "farmer" : "buyer",
      at: typeof h?.at === "string" ? h.at : r.created_at,
      quantity: Number(h?.quantity ?? 0),
      pricePerUnit: Number(h?.pricePerUnit ?? 0),
      delivery: h?.delivery ?? undefined,
      deliveryDate: h?.deliveryDate ?? undefined,
      note: h?.note ?? undefined,
    }))
    .filter((h: any) => Number.isFinite(h.quantity) && Number.isFinite(h.pricePerUnit));
  const partyName =
    side === "farmer" ? (r.buyer?.name ?? "Alıcı") : (r.farmer?.name ?? "Üretici");
  const liveQty = Number(r.current_quantity ?? r.quantity);
  const livePrice = Number(r.current_price ?? r.price_per_unit);
  return {
    id: r.id,
    buyerName: partyName,
    buyerType: (((raw) => (raw === "organik_market" ? "market" : raw))(r.buyer?.buyer_type) ?? "bireysel") as BuyerType,
    crop: r.listing?.crop ?? "—",
    unit: (r.listing?.unit ?? "kg") as Offer["unit"],
    quantity: liveQty,
    pricePerUnit: livePrice,
    createdAt: r.created_at,
    status: (r.status === "pending_farmer" || r.status === "pending_buyer") ? "pending" : r.status,
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
      : history.length > 0
        ? {
            quantity: history[history.length - 1].quantity,
            pricePerUnit: history[history.length - 1].pricePerUnit,
            delivery: history[history.length - 1].delivery,
            deliveryDate: history[history.length - 1].deliveryDate,
            note: history[history.length - 1].note,
          }
        : undefined,
    history,
    producerId: r.farmer_id,
    buyerId: r.buyer_id,
    ballSide: (r.ball_side === "buyer" ? "buyer" : "farmer"),
    currentQuantity: liveQty,
    currentPrice: livePrice,
    paymentStatus: (r.payment_status ?? "unpaid") as "unpaid" | "pending" | "pending_transfer" | "paid",
    farmerIban: r.farmer?.iban ?? undefined,
    farmerBankAccountName: r.farmer?.bank_account_name ?? undefined,
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
    disputed: "disputed",
    cancelled: "cancelled",
  };
  return {
    id: r.id,
    code: r.order_ref,
    producerId: r.farmer_id,
    producerName: partyName,
    producerPhone: side === "buyer" ? (r.farmer?.phone ?? undefined) : (r.buyer?.phone ?? undefined),
    crop: listing.crop ?? "—",
    quantity: qty,
    unit: (listing.unit ?? "kg") as Order["unit"],
    pricePerUnit: price,
    total: qty * price,
    delivery: deliveryLabel(offer.delivery),
    deliveryDate: offer.delivery_date ?? "",
    status: statusMap[r.status] ?? "preparing",
    createdAt: r.created_at,
    timeline: [],
    trackingNumber: r.tracking_number ?? undefined,
    carrier: r.carrier ?? undefined,
    cancelReason: r.cancel_reason ?? undefined,
    cancelledAt: r.cancelled_at ?? undefined,
    disputeWindowExpiresAt: r.dispute_window_expires_at ?? undefined,
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

async function attachPublicFarmerProfiles<T extends { farmer_id: string }>(rows: T[]): Promise<(T & { profiles: { id: string; name: string | null; city: string | null } | null })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.farmer_id).filter(Boolean)));
  if (ids.length === 0) return rows.map((r) => ({ ...r, profiles: null }));
  const { data, error } = await (supabase as any)
    .from("public_farmer_profiles")
    .select("id, name, city")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map<string, { id: string; name: string | null; city: string | null }>();
  for (const p of (data ?? []) as any[]) byId.set(p.id, { id: p.id, name: p.name ?? null, city: p.city ?? null });
  return rows.map((r) => ({ ...r, profiles: byId.get(r.farmer_id) ?? null }));
}

export function useActiveListings() {
  return useQuery({
    queryKey: ["activeListings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const merged = await attachPublicFarmerProfiles(data ?? []);
      return merged.map(dbToActiveListing);
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
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [merged] = await attachPublicFarmerProfiles([data]);
      return dbToActiveListing(merged);
    },
  });
}

export function useCropsWithPriceData() {
  return useQuery({
    queryKey: ["cropsWithPriceData"],
    queryFn: async () => {
      const [listingsRes, cfgRes] = await Promise.all([
        supabase.from("listings").select("crop").eq("status", "active"),
        (supabase as any).from("crop_config").select("crop, has_official_price_source"),
      ]);
      if (listingsRes.error) throw listingsRes.error;
      if (cfgRes.error) throw cfgRes.error;
      const canonicalByLower = new Map<string, string>();
      for (const r of (cfgRes.data ?? []) as any[]) {
        if (r?.crop) canonicalByLower.set(String(r.crop).toLowerCase(), r.crop);
      }
      const officialCrops = new Set<string>(
        ((cfgRes.data ?? []) as any[])
          .filter((r) => r.has_official_price_source && r.crop)
          .map((r) => r.crop as string),
      );
      const out = new Set<string>();
      for (const r of (listingsRes.data ?? []) as any[]) {
        const raw = r?.crop as string | null;
        if (!raw) continue;
        const canon = canonicalByLower.get(raw.toLowerCase()) ?? raw;
        out.add(canon);
      }
      for (const c of officialCrops) out.add(c);
      return Array.from(out).sort((a, b) => a.localeCompare(b, "tr"));
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

async function uploadListingPhotos(userId: string, listingId: string, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    const path = `${userId}/${listingId}/${Date.now()}-${file.name}`;
    const up = await supabase.storage.from("listing-photos").upload(path, file, { upsert: false });
    if (up.error) throw up.error;
    const { data } = supabase.storage.from("listing-photos").getPublicUrl(path);
    out.push(data.publicUrl);
  }
  return out;
}

export function useCreateListing() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (l: ListingInput & { photoFiles?: File[] }) => {
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
      let row = data;
      if (l.photoFiles && l.photoFiles.length > 0) {
        const urls = await uploadListingPhotos(userId, data.id, l.photoFiles.slice(0, 3));
        const upd = await supabase.from("listings").update({ photo_urls: urls }).eq("id", data.id).select("*").single();
        if (upd.error) throw upd.error;
        row = upd.data;
      }
      return dbToListing(row);
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
    mutationFn: async ({ id, patch, photoFiles, existingPhotos }: { id: string; patch: Partial<Listing>; photoFiles?: File[]; existingPhotos?: string[] }) => {
      const dbPatch: any = {};
      if (patch.crop !== undefined) dbPatch.crop = patch.crop;
      if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
      if (patch.unit !== undefined) dbPatch.unit = patch.unit;
      if (patch.pricePerUnit !== undefined) dbPatch.price_per_unit = patch.pricePerUnit;
      if (patch.minOrder !== undefined) dbPatch.min_order = patch.minOrder;
      if (patch.quality !== undefined) dbPatch.quality = patch.quality;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (existingPhotos !== undefined || (photoFiles && photoFiles.length > 0)) {
        const kept = existingPhotos ?? [];
        const uploaded = userId && photoFiles && photoFiles.length > 0
          ? await uploadListingPhotos(userId, id, photoFiles)
          : [];
        dbPatch.photo_urls = [...kept, ...uploaded].slice(0, 3);
      }
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
// LISTING BATCHES (harvest entry links) & STOCK
// =====================================================================
export interface ListingStock {
  base: number;       // sum of linked harvest quantities, or listing.quantity fallback
  reserved: number;   // accepted offers on this listing
  available: number;  // base - reserved
  linkedCount: number;
  usingFallback: boolean;
}

export function useListingStock(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingStock", listingId],
    enabled: !!listingId,
    queryFn: async (): Promise<ListingStock> => {
      const [links, listingRes, offersRes] = await Promise.all([
        supabase
          .from("listing_harvest_entries")
          .select("harvest_entry_id, harvest_entries(quantity)")
          .eq("listing_id", listingId!),
        supabase.from("listings").select("quantity").eq("id", listingId!).maybeSingle(),
        supabase.from("offers").select("quantity").eq("listing_id", listingId!).eq("status", "accepted"),
      ]);
      if (links.error) throw links.error;
      if (listingRes.error) throw listingRes.error;
      if (offersRes.error) throw offersRes.error;
      const batchSum = (links.data ?? []).reduce((s: number, r: any) => s + Number(r.harvest_entries?.quantity ?? 0), 0);
      const usingFallback = batchSum <= 0;
      const base = usingFallback ? Number(listingRes.data?.quantity ?? 0) : batchSum;
      const reserved = (offersRes.data ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0);
      return {
        base,
        reserved,
        available: Math.max(0, base - reserved),
        linkedCount: links.data?.length ?? 0,
        usingFallback,
      };
    },
  });
}

export function useListingBatchEntries(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingBatchEntries", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_harvest_entries")
        .select("harvest_entry_id, harvest_entries(*)")
        .eq("listing_id", listingId!);
      if (error) throw error;
      const entries = (data ?? [])
        .map((r: any) => r.harvest_entries)
        .filter(Boolean)
        .map(dbToEntry)
        .sort((a, b) => a.date.localeCompare(b.date));
      return entries;
    },
  });
}

export function useHarvestListingLinks(entryId: string | undefined | null) {
  return useQuery({
    queryKey: ["harvestListingLinks", entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_harvest_entries")
        .select("listing_id, listings(id, crop, unit, status)")
        .eq("harvest_entry_id", entryId!);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        listingId: r.listing_id as string,
        crop: r.listings?.crop as string,
        unit: r.listings?.unit as string,
        status: r.listings?.status as string,
      }));
    },
  });
}

export function useLinkHarvestToListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, entryId }: { listingId: string; entryId: string }) => {
      const { error } = await supabase
        .from("listing_harvest_entries")
        .insert({ listing_id: listingId, harvest_entry_id: entryId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["listingStock", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listingBatchEntries", v.listingId] });
      qc.invalidateQueries({ queryKey: ["harvestListingLinks", v.entryId] });
    },
  });
}

export function useUnlinkHarvestFromListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, entryId }: { listingId: string; entryId: string }) => {
      const { error } = await supabase
        .from("listing_harvest_entries")
        .delete()
        .eq("listing_id", listingId)
        .eq("harvest_entry_id", entryId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["listingStock", v.listingId] });
      qc.invalidateQueries({ queryKey: ["listingBatchEntries", v.listingId] });
      qc.invalidateQueries({ queryKey: ["harvestListingLinks", v.entryId] });
    },
  });
}

export function useListingOrders(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingOrders", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, created_at, order_ref, offer:offers!inner(quantity, price_per_unit, listing_id, buyer:profiles!offers_buyer_id_fkey(name))")
        .eq("offer.listing_id", listingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/**
 * Harvest entries linked to a listing, for buyer-facing "Ürün Geçmişi"
 * timeline and coverage badges. Reads through listing_harvest_entries (public)
 * and harvest_entries (public read of linked entries only).
 */
export function useListingProvenanceEntries(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingProvenance", listingId],
    enabled: !!listingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_harvest_entries")
        .select("harvest_entries(id, parcel_id, harvest_date, crop, quantity, unit, quality, notes, photo_urls, costs, step_key, created_at)")
        .eq("listing_id", listingId!);
      if (error) throw error;
      const entries = (data ?? [])
        .map((r: any) => r.harvest_entries)
        .filter(Boolean)
        .map(dbToEntry)
        .sort((a, b) => a.date.localeCompare(b.date));
      return entries;
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
        .select("*, buyer:profiles!offers_buyer_id_fkey(id,name,city,buyer_type), listing:listings(crop,unit)")
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
        .select("*, farmer:profiles!offers_farmer_id_fkey(id,name,city,iban,bank_account_name), listing:listings(crop,unit)")
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
        current_quantity: o.quantity,
        current_price: o.pricePerUnit,
        ball_side: "farmer",
        payment_status: "unpaid",
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
      // SMS dispatch now handled DB-side via notify_offer_received → dispatch_sms.
    },
  });
}


export type OfferStatusUpdate = "accepted" | "rejected" | "counter" | "completed";

export function useUpdateOfferStatus() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: OfferStatusUpdate; reason?: string }) => {
      const patch: any = { status };
      if (status === "accepted") {
        // Farmer accepted -> waiting for buyer's payment.
        patch.ball_side = "buyer";
        patch.payment_status = "unpaid";
      }
      if (status === "rejected" && reason) {
        patch.note = reason;
      }
      const { data: offerRow, error: e1 } = await supabase
        .from("offers").update(patch).eq("id", id).select("*").single();
      if (e1) throw e1;

      // On acceptance, ensure an order row exists (idempotent) so the
      // farmer's Siparişler view immediately reflects the accepted deal.
      if (status === "accepted") {
        const { data: existing } = await supabase
          .from("orders").select("id").eq("offer_id", id).maybeSingle();
        if (!existing) {
          const { data: order, error: oErr } = await supabase.from("orders").insert({
            offer_id: offerRow.id,
            buyer_id: offerRow.buyer_id,
            farmer_id: offerRow.farmer_id,
            status: "preparing",
            order_ref: "",
          } as any).select("id").single();
          if (oErr) throw oErr;
          await supabase.from("order_timeline").insert({
            order_id: order.id,
            step: "submitted",
            label: "Sipariş Alındı",
            completed_at: new Date().toISOString(),
          });
        }
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
    mutationFn: async ({ id, patch, original, by }: { id: string; patch: OfferCounterPatch; original?: OfferCounterPatch; by: "buyer" | "farmer" }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data: current, error: readErr } = await supabase
        .from("offers")
        .select("quantity, price_per_unit, delivery, delivery_date, note, negotiation_history")
        .eq("id", id)
        .single();
      if (readErr) throw readErr;

      const prevSnapshot = {
        by,
        at: new Date().toISOString(),
        quantity: Number(current.quantity),
        pricePerUnit: Number(current.price_per_unit),
        delivery: deliveryLabel(current.delivery),
        deliveryDate: current.delivery_date ?? undefined,
        note: current.note ?? undefined,
      };
      const prevHistory = Array.isArray((current as any).negotiation_history)
        ? (current as any).negotiation_history
        : [];
      const nextHistory = [...prevHistory, prevSnapshot];

      const otherSide = by === "farmer" ? "buyer" : "farmer";

      const { error } = await supabase.from("offers").update({
        quantity: patch.quantity,
        price_per_unit: patch.pricePerUnit,
        current_quantity: patch.quantity,
        current_price: patch.pricePerUnit,
        ball_side: otherSide,
        delivery: deliveryToDb(patch.delivery),
        delivery_date: patch.deliveryDate || null,
        note: patch.note ?? null,
        status: "counter",
        counter_offer: original ?? null,
        negotiation_history: nextHistory,
      } as any).eq("id", id);
      if (error) throw error;

      // Append to offer_messages thread (best effort)
      await supabase.from("offer_messages").insert({
        offer_id: id,
        sender_role: by,
        sender_id: userId,
        price: patch.pricePerUnit,
        quantity: patch.quantity,
        note: patch.note ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["offerMessages"] });
    },
  });
}

// Buyer simulates payment for an accepted offer.
// Sets payment_status=paid (offer status stays 'accepted'), creates an order row + initial timeline.
export function useSimulatePayment() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data: offerRow, error: e1 } = await supabase
        .from("offers")
        .update({ payment_status: "paid", status: "accepted" } as any)
        .eq("id", offerId)
        .select("*")
        .single();
      if (e1) throw e1;

      // Idempotent: only create the order if not already there.
      const { data: existing } = await supabase
        .from("orders").select("id").eq("offer_id", offerId).maybeSingle();
      if (!existing) {
        const { data: order, error: e2 } = await supabase.from("orders").insert({
          offer_id: offerRow.id,
          buyer_id: offerRow.buyer_id,
          farmer_id: offerRow.farmer_id,
          status: "preparing",
          order_ref: "",
        } as any).select("id").single();
        if (e2) throw e2;
        await supabase.from("order_timeline").insert({
          order_id: order.id,
          step: "submitted",
          label: "Sipariş Alındı",
          completed_at: new Date().toISOString(),
        });
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

// Buyer marks an IBAN transfer as sent. Offer moves to payment_status='pending_transfer'.
// Farmer will later confirm receipt with useConfirmTransferReceived.
export function useMarkTransferSent() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase
        .from("offers")
        .update({ payment_status: "pending_transfer" } as any)
        .eq("id", offerId)
        .eq("buyer_id", userId)
        .eq("status", "accepted")
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers"] });
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
    },
  });
}

// Farmer confirms havale receipt. Marks payment_status=paid and creates the order
// (idempotently, mirroring useSimulatePayment). Only the farmer on the offer may call this.
export function useConfirmTransferReceived() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data: offerRow, error: e1 } = await supabase
        .from("offers")
        .update({ payment_status: "paid" } as any)
        .eq("id", offerId)
        .eq("farmer_id", userId)
        .eq("payment_status", "pending_transfer")
        .select("*")
        .single();
      if (e1) throw e1;

      const { data: existing } = await supabase
        .from("orders").select("id").eq("offer_id", offerId).maybeSingle();
      if (!existing) {
        const { data: order, error: e2 } = await supabase.from("orders").insert({
          offer_id: offerRow.id,
          buyer_id: offerRow.buyer_id,
          farmer_id: offerRow.farmer_id,
          status: "preparing",
          order_ref: "",
        } as any).select("id").single();
        if (e2) throw e2;
        await supabase.from("order_timeline").insert({
          order_id: order.id,
          step: "submitted",
          label: "Sipariş Alındı",
          completed_at: new Date().toISOString(),
        });
      }
      return offerRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOffers"] });
      qc.invalidateQueries({ queryKey: ["farmerOrders", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOrders"] });
    },
  });
}

// Withdraw the most recent counter-offer message.
// Only the sender of that message may call this. Deletes the message,
// reverts current_price/quantity to the prior message's values (or to the
// offer's original price_per_unit/quantity if no messages remain),
// reverts status to 'pending' and ball_side to the withdrawer's role.
export function useWithdrawCounter() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!userId) throw new Error("Oturum bulunamadı");

      // Read offer (originals + history)
      const { data: offerRow, error: oErr } = await supabase
        .from("offers")
        .select("price_per_unit, quantity, negotiation_history")
        .eq("id", offerId)
        .single();
      if (oErr) throw oErr;

      // Get the latest message and verify ownership
      const { data: msgs, error: mErr } = await supabase
        .from("offer_messages")
        .select("id, sender_id, sender_role, price, quantity")
        .eq("offer_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (mErr) throw mErr;
      const last = msgs?.[0];
      if (!last) throw new Error("Geri çekilecek karşı teklif bulunamadı");
      if (last.sender_id !== userId) throw new Error("Yalnızca son teklifi gönderen geri çekebilir");

      const myRole = last.sender_role as "farmer" | "buyer";

      // Delete the last message
      const { error: dErr } = await supabase.from("offer_messages").delete().eq("id", last.id);
      if (dErr) throw dErr;

      // Determine reverted values from remaining messages
      const { data: remaining } = await supabase
        .from("offer_messages")
        .select("price, quantity")
        .eq("offer_id", offerId)
        .order("created_at", { ascending: false })
        .limit(1);

      const prev = remaining?.[0];
      const origPrice = Number(offerRow.price_per_unit);
      const origQty = Number(offerRow.quantity);
      const revertPrice = prev?.price != null ? Number(prev.price) : origPrice;
      const revertQty = prev?.quantity != null ? Number(prev.quantity) : origQty;

      // Trim negotiation_history (pop the last snapshot we appended for this message)
      const prevHistory = Array.isArray((offerRow as any).negotiation_history)
        ? (offerRow as any).negotiation_history
        : [];
      const nextHistory = prevHistory.slice(0, -1);

      const { error: uErr } = await supabase.from("offers").update({
        current_price: revertPrice,
        current_quantity: revertQty,
        status: (`pending_${myRole}` as any),
        ball_side: myRole,
        negotiation_history: nextHistory,
      } as any).eq("id", offerId);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["buyerOffers", userId] });
      qc.invalidateQueries({ queryKey: ["offerMessages"] });
    },
  });
}

// Read negotiation thread for an offer
export function useOfferMessages(offerId: string | null | undefined) {
  return useQuery({
    queryKey: ["offerMessages", offerId],
    enabled: !!offerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offer_messages")
        .select("*")
        .eq("offer_id", offerId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        offerId: r.offer_id,
        senderRole: r.sender_role as "farmer" | "buyer",
        senderId: r.sender_id,
        price: r.price != null ? Number(r.price) : null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        note: r.note ?? null,
        createdAt: r.created_at,
      }));
    },
  });
}

// Buyer inbox: one row per active/negotiating offer, with last message preview.
export interface BuyerConversationRow {
  offerId: string;
  farmerId: string;
  farmerName: string;
  farmerCity: string | null;
  crop: string;
  status: string;
  ballSide: "farmer" | "buyer";
  createdAt: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastSenderRole: "farmer" | "buyer" | null;
}

export function useBuyerConversations() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["buyerConversations", userId],
    enabled: !!userId,
    queryFn: async (): Promise<BuyerConversationRow[]> => {
      const { data: offers, error } = await supabase
        .from("offers")
        .select("id, farmer_id, status, ball_side, created_at, listing:listings(crop)")
        .eq("buyer_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (offers ?? []) as any[];
      if (list.length === 0) return [];
      const offerIds = list.map((o) => o.id);
      const farmerIds = Array.from(new Set(list.map((o) => o.farmer_id).filter(Boolean)));
      const [msgsRes, farmersRes] = await Promise.all([
        supabase.from("offer_messages").select("offer_id, sender_role, note, price, quantity, created_at").in("offer_id", offerIds).order("created_at", { ascending: false }),
        (supabase as any).from("public_farmer_profiles").select("id, name, city").in("id", farmerIds),
      ]);
      if (msgsRes.error) throw msgsRes.error;
      const lastByOffer = new Map<string, any>();
      for (const m of (msgsRes.data ?? []) as any[]) {
        if (!lastByOffer.has(m.offer_id)) lastByOffer.set(m.offer_id, m);
      }
      const farmers = new Map<string, { name: string | null; city: string | null }>();
      for (const f of (farmersRes.data ?? []) as any[]) farmers.set(f.id, { name: f.name ?? null, city: f.city ?? null });
      return list.map((o): BuyerConversationRow => {
        const m = lastByOffer.get(o.id);
        const preview = m
          ? (m.note && String(m.note).trim().length > 0
              ? String(m.note)
              : (m.price != null || m.quantity != null ? "Yeni teklif" : null))
          : null;
        const farmer = farmers.get(o.farmer_id);
        return {
          offerId: o.id,
          farmerId: o.farmer_id,
          farmerName: farmer?.name ?? "Üretici",
          farmerCity: farmer?.city ?? null,
          crop: o.listing?.crop ?? "—",
          status: o.status,
          ballSide: o.ball_side === "buyer" ? "buyer" : "farmer",
          createdAt: o.created_at,
          lastMessageAt: m?.created_at ?? null,
          lastMessagePreview: preview,
          lastSenderRole: (m?.sender_role === "farmer" || m?.sender_role === "buyer") ? m.sender_role : null,
        };
      }).sort((a, b) => {
        const ta = a.lastMessageAt ?? a.createdAt;
        const tb = b.lastMessageAt ?? b.createdAt;
        return tb.localeCompare(ta);
      });
    },
  });
}

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
        .select(`${ORDER_SELECT}, buyer:profiles!orders_buyer_id_fkey(id,name,phone)`)
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
        .select(`${ORDER_SELECT}, farmer:profiles!orders_farmer_id_fkey(id,name,city,phone)`)
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
  authorRole: string | null;
  content: string;
  category: string;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  parentId: string | null;
  replyCount: number;
  flaggedForReview: boolean;
}

function dbToPost(r: any): CommunityPostRow {
  return {
    id: r.id,
    authorId: r.author_id,
    authorName: r.author?.name ?? null,
    authorCity: r.author?.city ?? null,
    authorRole: r.author?.role ?? null,
    content: r.content,
    category: r.category,
    likesCount: r.likes_count ?? 0,
    commentsCount: r.comments_count ?? 0,
    createdAt: r.created_at,
    parentId: r.parent_id ?? null,
    replyCount: 0,
    flaggedForReview: !!r.flagged_for_review,
  };
}

// Rule-based check for potential price-coordination content.
// Flags posts that reference money AND coordination language — never blocks.
const CURRENCY_TERMS = ["₺", " tl", "$"];
const COORDINATION_TERMS = ["anlaşalım", "birlikte", "hepimiz", "sabit fiyat", "taban fiyat"];
export function looksLikePriceCoordination(text: string): boolean {
  const s = ` ${text.toLowerCase()} `;
  const hasCurrency = CURRENCY_TERMS.some((t) => s.includes(t));
  const hasCoord = COORDINATION_TERMS.some((t) => s.includes(t));
  return hasCurrency && hasCoord;
}


export function useCommunityPosts(categoryFilter?: string) {
  const filter = categoryFilter && categoryFilter !== "Tümü" ? categoryFilter : null;
  return useQuery({
    queryKey: ["communityPosts", filter],
    queryFn: async () => {
      let q = supabase
        .from("community_posts")
        .select("*, author:profiles!community_posts_author_id_fkey(id,name,city,role)")
        .is("parent_id", null)
        .order("created_at", { ascending: false });
      if (filter) q = q.eq("category", filter);
      const { data, error } = await q;
      if (error) throw error;
      const posts = (data ?? []).map(dbToPost);
      const ids = posts.map((p) => p.id);
      if (ids.length > 0) {
        const { data: replies } = await supabase
          .from("community_posts")
          .select("parent_id")
          .in("parent_id", ids);
        const counts = new Map<string, number>();
        for (const row of (replies ?? []) as Array<{ parent_id: string | null }>) {
          if (row.parent_id) counts.set(row.parent_id, (counts.get(row.parent_id) ?? 0) + 1);
        }
        for (const p of posts) p.replyCount = counts.get(p.id) ?? 0;
      }
      return posts;
    },
  });
}

export function useCommunityReplies(postId: string | null | undefined) {
  return useQuery({
    queryKey: ["communityReplies", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, author:profiles!community_posts_author_id_fkey(id,name,city,role)")
        .eq("parent_id", postId!)
        .order("created_at", { ascending: true });
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
        flagged_for_review: looksLikePriceCoordination(input.content),
      }).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communityPosts"] }),
  });
}

export function useCreateReply() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: { postId: string; content: string; parentAuthorId?: string | null }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data: parent } = await supabase
        .from("community_posts")
        .select("category")

        .eq("id", input.postId)
        .maybeSingle();
      const { data, error } = await supabase.from("community_posts").insert({
        author_id: userId,
        content: input.content,
        category: parent?.category ?? "Diğer",
        parent_id: input.postId,
        flagged_for_review: looksLikePriceCoordination(input.content),
      }).select("*, author:profiles!community_posts_author_id_fkey(id,name,city,role)").single();
      if (error) throw error;
      // Best-effort notification to parent author (skip self-reply).
      if (input.parentAuthorId && input.parentAuthorId !== userId) {
        const { data: me } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
        const who = me?.name ?? "Bir üretici";
        try {
          await supabase.from("notifications").insert({
            user_id: input.parentAuthorId,
            type: "reply",
            title: "Yeni yanıt",
            body: `${who} gönderine yanıt verdi`,
            related_id: data.id,
          });
        } catch { /* notifications table optional — ignore */ }
      }
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["communityReplies", vars.postId] });
      qc.invalidateQueries({ queryKey: ["communityPosts"] });
    },
  });
}

// ---- community post likes ----
export function useLikedPostIds() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["communityLikedIds", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_post_likes")
        .select("post_id")
        .eq("user_id", userId!);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: { post_id: string }) => r.post_id));
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: { postId: string; liked: boolean }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      if (input.liked) {
        const { error } = await supabase
          .from("community_post_likes")
          .delete()
          .eq("post_id", input.postId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("community_post_likes")
          .insert({ post_id: input.postId, user_id: userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communityLikedIds", userId] });
      qc.invalidateQueries({ queryKey: ["communityPosts"] });
    },
  });
}


// =====================================================================
// REALTIME SYNC (6A)
// =====================================================================
export function useRealtimeSync(userId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    const offersCh = supabase
      .channel("offers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers" },
        () => {
          qc.invalidateQueries({ queryKey: ["farmerOffers"] });
          qc.invalidateQueries({ queryKey: ["buyerOffers"] });
        },
      )
      .subscribe();
    const ordersCh = supabase
      .channel("orders-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          qc.invalidateQueries({ queryKey: ["farmerOrders"] });
          qc.invalidateQueries({ queryKey: ["buyerOrders"] });
          qc.invalidateQueries({ queryKey: ["buyerAnalytics"] });
        },
      )
      .subscribe();
    let notifCh: ReturnType<typeof supabase.channel> | null = null;
    if (userId) {
      notifCh = supabase
        .channel(`notif-changes-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["notifications", userId] });
            qc.invalidateQueries({ queryKey: ["notifCount", userId] });
          },
        )
        .subscribe();
    }
    return () => {
      supabase.removeChannel(offersCh);
      supabase.removeChannel(ordersCh);
      if (notifCh) supabase.removeChannel(notifCh);
    };
  }, [qc, userId]);
}

// =====================================================================
// NOTIFICATIONS (Phase 7)
// =====================================================================
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useUnreadCount() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["notifCount", userId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
      qc.invalidateQueries({ queryKey: ["notifCount", userId] });
    },
  });
}

export function useMarkOneRead() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", userId] });
      qc.invalidateQueries({ queryKey: ["notifCount", userId] });
    },
  });
}


// =====================================================================
// BUYER ANALYTICS (6C)
// =====================================================================
export interface BuyerAnalyticsRow {
  id: string;
  status: string;
  created_at: string;
  order_ref: string;
  farmer_id: string;
  offer: {
    quantity: number;
    price_per_unit: number;
    current_price: number | null;
    current_quantity: number | null;
    payment_status: string | null;
    listing: { crop: string; unit: string } | null;
  } | null;
  farmer?: { id: string; name: string | null; city: string | null } | null;
}

const PAID_STATUSES = new Set(["preparing", "shipped", "delivered", "completed"]);

export function isPaidOrder(r: Pick<BuyerAnalyticsRow, "status" | "offer">): boolean {
  return PAID_STATUSES.has(r.status) || r.offer?.payment_status === "paid";
}

export function orderRowTotal(r: Pick<BuyerAnalyticsRow, "offer">): number {
  const q = Number(r.offer?.current_quantity ?? r.offer?.quantity ?? 0);
  const p = Number(r.offer?.current_price ?? r.offer?.price_per_unit ?? 0);
  return q * p;
}

export function useBuyerAnalytics() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["buyerAnalytics", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, created_at, order_ref, farmer_id, offer:offers(quantity, price_per_unit, current_price, current_quantity, payment_status, listing:listings(crop, unit))",
        )
        .eq("buyer_id", userId!)
        .neq("status", "cancelled" as any)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = ((data ?? []) as unknown) as BuyerAnalyticsRow[];
      const farmerIds = Array.from(new Set(rows.map((r) => r.farmer_id).filter(Boolean)));
      if (farmerIds.length > 0) {
        const { data: farmers } = await (supabase as any)
          .from("public_farmer_profiles")
          .select("id, name, city")
          .in("id", farmerIds);
        const byId = new Map<string, { id: string; name: string | null; city: string | null }>();
        for (const f of (farmers ?? []) as any[]) byId.set(f.id, f);
        for (const r of rows) r.farmer = byId.get(r.farmer_id) ?? null;
      }
      return rows;
    },
  });
}

// ---- price points ----
export function usePricePoints() {
  return useQuery({
    queryKey: ["pricePoints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_points")
        .select("crop, hal_price, d2c_price, export_price, delta_7d, recorded_date")
        .order("recorded_date", { ascending: false });
      if (error) throw error;
      const seen = new Set<string>();
      const latest: import("./types").PricePoint[] = [];
      for (const r of data ?? []) {
        if (seen.has(r.crop)) continue;
        seen.add(r.crop);
        latest.push({
          crop: r.crop,
          hal: Number(r.hal_price ?? 0),
          d2c: Number(r.d2c_price ?? 0),
          export: Number(r.export_price ?? 0),
          delta7d: Number(r.delta_7d ?? 0),
          date: r.recorded_date ?? "",
        });
      }
      return latest;
    },
  });
}

// ---- price history (order-derived + official HKS aggregates) ----
//
// Raw price_history rows are not readable by other users. Aggregate reads go
// through the SECURITY DEFINER RPC `get_price_history_summary(p_crop)` which
// returns the Hasat community band (avg/stddev over the crop-configured
// window, gated at 5 distinct farmers) and, when the crop has an official
// price source, a separate `official_data` segment (HKS average). The two
// segments must never be merged into a single number in any UI or AI reply.
export interface PriceHistoryHasatSegment {
  insufficientData: boolean;
  avgPrice: number | null;
  stddevPrice: number | null;
  distinctFarmerCount: number;
}

export interface PriceHistoryOfficialSegment {
  avgPrice: number;
  officialSourceName: string;
}

export interface MarketSourceSummary {
  sourceCode: string;
  displayName: string;
  region: string | null;
  avgPrice: number | null;
}

export interface MarketSourceSeries {
  sourceCode: string;
  displayName: string;
  region: string | null;
  series: PriceHistorySeriesPoint[];
}

export interface PriceHistorySummary {
  hasat: PriceHistoryHasatSegment;
  official: PriceHistoryOfficialSegment | null;
  marketSources: MarketSourceSummary[];
  lastUpdated: string | null;
  unit: string | null;
}

export function usePriceHistorySummary(crop: string | null | undefined) {
  const key = (crop ?? "").trim();
  return useQuery({
    queryKey: ["priceHistorySummary", key.toLowerCase()],
    enabled: key.length > 0,
    queryFn: async (): Promise<PriceHistorySummary | null> => {
      const { data, error } = await supabase.rpc(
        "get_price_history_summary" as any,
        { p_crop: key } as any,
      );
      if (error) throw error;
      const row: any = data ?? null;
      if (!row) return null;
      const h = row.hasat_data ?? {};
      const o = row.official_data ?? null;
      const rawSources = Array.isArray(row.market_sources) ? row.market_sources : [];
      const marketSources: MarketSourceSummary[] = rawSources
        .map((s: any) => ({
          sourceCode: String(s?.source_code ?? ""),
          displayName: String(s?.display_name ?? s?.source_code ?? "Kaynak"),
          region: s?.region == null ? null : String(s.region),
          avgPrice: s?.avg_price == null ? null : Number(s.avg_price),
        }))
        .filter((s: MarketSourceSummary) => !!s.sourceCode);
      return {
        hasat: {
          insufficientData: !!h.insufficient_data,
          avgPrice: h.avg_price == null ? null : Number(h.avg_price),
          stddevPrice: h.stddev_price == null ? null : Number(h.stddev_price),
          distinctFarmerCount: Number(h.distinct_farmer_count ?? 0),
        },
        official: o
          ? {
              avgPrice: Number(o.avg_price),
              officialSourceName: String(o.official_source_name ?? "Resmi kaynak"),
            }
          : null,
        marketSources,
        lastUpdated: row.last_updated ?? null,
        unit: row.unit == null ? null : String(row.unit),
      };
    },
  });
}

export interface PriceHistorySeriesPoint {
  date: string;
  avgPrice: number;
}

export interface PriceHistorySeries {
  hasat: PriceHistorySeriesPoint[];
  official: PriceHistorySeriesPoint[] | null;
  marketSources: MarketSourceSeries[];
  unit: string | null;
}

export function usePriceHistorySeries(crop: string | null | undefined, weeks = 12) {
  const key = (crop ?? "").trim();
  return useQuery({
    queryKey: ["priceHistorySeries", key.toLowerCase(), weeks],
    enabled: key.length > 0,
    queryFn: async (): Promise<PriceHistorySeries> => {
      const { data, error } = await supabase.rpc(
        "get_price_history_series" as any,
        { p_crop: key, p_weeks: weeks } as any,
      );
      if (error) throw error;
      const row: any = data ?? {};
      const mapArr = (arr: any): PriceHistorySeriesPoint[] =>
        Array.isArray(arr)
          ? arr
              .map((r: any) => ({ date: String(r.week_start), avgPrice: Number(r.avg_price) }))
              .filter((p) => p.date && Number.isFinite(p.avgPrice))
          : [];
      const hasat = mapArr(row.hasat_series);
      const officialArr = row.official_series;
      const official = officialArr == null ? null : mapArr(officialArr);
      const rawSources = Array.isArray(row.market_series) ? row.market_series : [];
      const marketSources: MarketSourceSeries[] = rawSources
        .map((s: any) => ({
          sourceCode: String(s?.source_code ?? ""),
          displayName: String(s?.display_name ?? s?.source_code ?? "Kaynak"),
          region: s?.region == null ? null : String(s.region),
          series: mapArr(s?.series),
        }))
        .filter((s: MarketSourceSeries) => !!s.sourceCode);
      return { hasat, official, marketSources, unit: row.unit == null ? null : String(row.unit) };
    },
  });
}


export function useCreateCropRequest() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (input: { cropName: string; note?: string }) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("crop_requests" as any).insert({
        requested_by: userId,
        crop_name_free_text: input.cropName.trim(),
        note: input.note?.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cropRequests"] }),
  });
}


// =====================================================================
// PUBLIC PRODUCER PROFILE (real data for buyer.producer.$id)
// =====================================================================

export interface PublicFarmerProfile {
  id: string;
  name: string | null;
  city: string | null;
}

export function useFarmerPublicProfile(farmerId: string | null | undefined) {
  return useQuery({
    queryKey: ["publicFarmerProfile", farmerId],
    enabled: !!farmerId,
    queryFn: async (): Promise<PublicFarmerProfile | null> => {
      const { data, error } = await (supabase as any)
        .from("public_farmer_profiles")
        .select("id, name, city")
        .eq("id", farmerId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, name: data.name ?? null, city: data.city ?? null };
    },
  });
}

export function useFarmerActiveListings(farmerId: string | null | undefined) {
  return useQuery({
    queryKey: ["farmerActiveListings", farmerId],
    enabled: !!farmerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("farmer_id", farmerId!)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(dbToListing);
    },
  });
}

export interface ProducerStats {
  totalLandDonum: number;
  yieldHistory: { year: string; value: number }[];
  modalQuality: string | null;
  orderCount: number;
}

export function useFarmerProducerStats(farmerId: string | null | undefined) {
  return useQuery({
    queryKey: ["producerStats", farmerId],
    enabled: !!farmerId,
    queryFn: async (): Promise<ProducerStats> => {
      const [parcelsRes, entriesRes, ordersRes] = await Promise.all([
        supabase.from("parcels").select("area").eq("farmer_id", farmerId!),
        supabase
          .from("harvest_entries")
          .select("harvest_date, quantity, quality")
          .eq("farmer_id", farmerId!),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("farmer_id", farmerId!),
      ]);
      if (parcelsRes.error) throw parcelsRes.error;
      if (entriesRes.error) throw entriesRes.error;
      if (ordersRes.error) throw ordersRes.error;

      const totalLandDonum = (parcelsRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.area ?? 0),
        0,
      );

      const yieldByYear = new Map<string, number>();
      const qualityCounts = new Map<string, number>();
      for (const r of (entriesRes.data ?? []) as any[]) {
        if (r.harvest_date) {
          const year = String(r.harvest_date).slice(0, 4);
          yieldByYear.set(year, (yieldByYear.get(year) ?? 0) + Number(r.quantity ?? 0));
        }
        if (r.quality) {
          qualityCounts.set(r.quality, (qualityCounts.get(r.quality) ?? 0) + 1);
        }
      }
      const yieldHistory = Array.from(yieldByYear.entries())
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year.localeCompare(b.year));

      let modalQuality: string | null = null;
      let maxCount = 0;
      for (const [q, c] of qualityCounts) {
        if (c > maxCount) {
          maxCount = c;
          modalQuality = q;
        }
      }

      return {
        totalLandDonum,
        yieldHistory,
        modalQuality,
        orderCount: ordersRes.count ?? 0,
      };
    },
  });
}

export interface MyActiveSubscriptionSummary {
  id: string;
  nextHarvestDate: string | null;
  estimatedQty: number | null;
}

export function useMyActiveSubscriptionWith(farmerId: string | null | undefined) {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["myActiveSubscriptionWith", userId, farmerId],
    enabled: !!userId && !!farmerId,
    queryFn: async (): Promise<MyActiveSubscriptionSummary | null> => {
      const { data, error } = await supabase
        .from("harvest_subscriptions")
        .select("id, next_harvest_date, estimated_qty")
        .eq("buyer_id", userId!)
        .eq("farmer_id", farmerId!)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        nextHarvestDate: (data as any).next_harvest_date ?? null,
        estimatedQty: (data as any).estimated_qty != null ? Number((data as any).estimated_qty) : null,
      };
    },
  });
}

// =====================================================================
// NOTIFICATION PREFERENCES
// =====================================================================

export interface NotifPrefsRow {
  new_offer_whatsapp: boolean;
  new_offer_push: boolean;
  new_offer_sms: boolean;
  price_alert_whatsapp: boolean;
  price_alert_push: boolean;
  price_alert_sms: boolean;
  harvest_time_whatsapp: boolean;
  harvest_time_push: boolean;
  harvest_time_sms: boolean;
  community_push: boolean;
  offer_accepted_sms: boolean;
  payment_confirmed_sms: boolean;
}

export type NotifPrefKey = keyof NotifPrefsRow;

const NOTIF_PREF_DEFAULTS: NotifPrefsRow = {
  new_offer_whatsapp: true,
  new_offer_push: true,
  new_offer_sms: true,
  price_alert_whatsapp: true,
  price_alert_push: false,
  price_alert_sms: false,
  harvest_time_whatsapp: true,
  harvest_time_push: true,
  harvest_time_sms: false,
  community_push: false,
  offer_accepted_sms: false,
  payment_confirmed_sms: false,
};

export function useNotifPrefs() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["notifPrefs", userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotifPrefsRow> => {
      const { data, error } = await supabase
        .from("notif_prefs")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        // Self-heal: seed a default row if the trigger/backfill missed this user.
        const insertRow = { user_id: userId!, new_offer_sms: true };
        await supabase.from("notif_prefs").insert(insertRow);
        return { ...NOTIF_PREF_DEFAULTS };
      }
      const r = data as Record<string, unknown>;
      const out = { ...NOTIF_PREF_DEFAULTS };
      (Object.keys(out) as NotifPrefKey[]).forEach((k) => {
        if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
      });
      return out;
    },
  });
}

export function useUpdateNotifPrefs() {
  const qc = useQueryClient();
  const userId = useAuthUserId();
  return useMutation({
    mutationFn: async (patch: Partial<NotifPrefsRow>) => {
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase
        .from("notif_prefs")
        .update(patch as any)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["notifPrefs", userId] });
      const prev = qc.getQueryData<NotifPrefsRow>(["notifPrefs", userId]);
      if (prev) {
        qc.setQueryData<NotifPrefsRow>(["notifPrefs", userId], { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifPrefs", userId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifPrefs", userId] }),
  });
}

