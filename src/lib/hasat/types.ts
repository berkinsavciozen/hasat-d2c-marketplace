export type Role = "farmer" | "buyer";

export type CertificationType = "organik" | "iso" | "cografi" | "hasat" | "premium" | "yeni";

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  city: string;
  premium: boolean;
}

export interface Parcel {
  id: string;
  name: string;
  area: number; // dönüm
  crops: string[];
  location: { lat: number; lng: number; label: string };
}

export interface HarvestEntry {
  id: string;
  parcelId: string;
  date: string;
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  quality: "A" | "B" | "C";
  photos: string[];
  notes: string;
  costs: {
    labor: number;
    fertilizer: number;
    packaging: number;
    transport: number;
    other: number;
  };
  pricePerUnit?: number;
}

export interface Listing {
  id: string;
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  pricePerUnit: number;
  minOrder: number;
  quality: "A" | "B" | "C";
  status: "active" | "sold" | "expired";
}

export interface PricePoint {
  crop: string;
  hal: number;
  d2c: number;
  export: number;
  date: string;
  delta7d: number;
}
