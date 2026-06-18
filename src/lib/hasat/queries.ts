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

export function useCertifications() {
  const userId = useAuthUserId();
  return useQuery({
    queryKey: ["certifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications").select("*").eq("farmer_id", userId!);
      if (error) throw error;
      return (data ?? []) as CertRow[];
    },
  });
}
