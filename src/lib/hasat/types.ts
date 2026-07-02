export type Role = "farmer" | "buyer";

export type CertificationType = "organik" | "iso" | "cografi" | "hasat" | "premium" | "yeni";

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  city: string;
  premium: boolean;
  crops?: string[];
  landSize?: number;
  certs?: string[];
  company?: { name: string; type: BuyerType | "diger"; address?: string; volume?: string };
}

export interface Parcel {
  id: string;
  name: string;
  area: number;
  crops: string[];
  location: { lat: number; lng: number; label: string };
  photos?: string[];
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
  costs: { labor: number; fertilizer: number; packaging: number; transport: number; other: number };
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
  photos?: string[];
  producerId?: string;
  description?: string;
}

export interface PricePoint {
  crop: string;
  hal: number;
  d2c: number;
  export: number;
  date: string;
  delta7d: number;
}

export type BuyerType = "restoran" | "otel" | "market" | "ihracatci";
export type OfferStatus = "pending" | "accepted" | "counter" | "active" | "completed" | "rejected";
export type BallSide = "farmer" | "buyer";
export type PaymentStatus = "unpaid" | "pending" | "pending_transfer" | "paid";

export interface OfferMessage {
  id: string;
  offerId: string;
  senderRole: BallSide;
  senderId: string;
  price: number | null;
  quantity: number | null;
  note: string | null;
  createdAt: string;
}

export interface OfferSnapshot {
  quantity: number;
  pricePerUnit: number;
  delivery?: string;
  deliveryDate?: string;
  note?: string;
}

export interface NegotiationSnapshot extends OfferSnapshot {
  by: "buyer" | "farmer";
  at: string;
}

export interface Offer {
  id: string;
  buyerName: string;
  buyerType: BuyerType;
  crop: string;
  unit: "g" | "kg" | "L";
  quantity: number;
  pricePerUnit: number;
  createdAt: string;
  status: OfferStatus;
  note?: string;
  delivery?: string;
  deliveryDate?: string;
  /** Original buyer offer values, retained when farmer responds with a counter. */
  original?: OfferSnapshot;
  /** Full negotiation history, oldest first. The "live" offer fields are the latest proposal. */
  history?: NegotiationSnapshot[];
  producerId?: string;
  buyerId?: string;
  /** Whose turn it is to respond to the latest offer / counter. */
  ballSide?: BallSide;
  /** Latest negotiated quantity (mirrors `quantity`, kept for clarity). */
  currentQuantity?: number;
  /** Latest negotiated unit price (mirrors `pricePerUnit`, kept for clarity). */
  currentPrice?: number;
  paymentStatus?: PaymentStatus;
}

export interface PriceAlert {
  id: string;
  crop: string;
  target: number;
  condition: "above" | "below";
  channels: { whatsapp: boolean; push: boolean; sms: boolean };
  createdAt: string;
}

export interface Producer {
  id: string;
  name: string;
  city: string;
  rating: number;
  ordersCount: number;
  experience: string;
  totalLand: string;
  avgQuality: string;
  responseTime: string;
  badges: CertificationType[];
  crops: string[];
  listings: Listing[];
  yieldHistory: { year: string; value: number }[];
  reviews: { id: string; quote: string; buyer: string; date: string; rating: number }[];
  nextHarvest: { date: string; estimatedQty: string; pricePerUnit: number; unit: string };
}

export type OrderStatus = "sent" | "accepted" | "preparing" | "shipped" | "delivered" | "completed";

export interface OrderTimelineStep {
  key: OrderStatus;
  label: string;
  doneAt?: string;
}

export interface Order {
  id: string;
  code: string;
  producerId: string;
  producerName: string;
  producerPhone?: string;
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  pricePerUnit: number;
  total: number;
  delivery: string;
  deliveryDate: string;
  status: OrderStatus;
  createdAt: string;
  timeline: OrderTimelineStep[];
}

export interface PendingOffer {
  listingId: string;
  producerId: string;
  producerName: string;
  crop: string;
  quantity: number;
  unit: "g" | "kg" | "L";
  pricePerUnit: number;
  delivery: string;
  deliveryDate: string;
  notes?: string;
  total: number;
}

export interface Subscription {
  id: string;
  producerId: string;
  producerName: string;
  crop: string;
  volume: number;
  unit: string;
  priceLocked: boolean;
  pricePerUnit: number;
  nextHarvest: string;
  total: number;
  createdAt: string;
}
