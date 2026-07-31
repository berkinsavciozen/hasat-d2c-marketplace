// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
//
// Paylaşılan çekirdeğin giriş noktası. İki client de (web, M5'ten sonra mobil)
// buradan içeri alır:
//
//   import { convertQuantity, tokens } from "@/lib/core";
//   import type { Database } from "@/lib/core/db/types";
//
// DB tipleri bilinçli olarak barrel'a dahil edilmedi: 2.700 satırlık üretilmiş
// bir dosyayı her import'ta tip grafiğine sokmamak için doğrudan yoldan alınır.

export { convertQuantity } from "./units";
export { brand, semanticLight, radius, typography, spacing, tokens } from "./design/tokens";
export type { BrandColor, SemanticColor } from "./design/tokens";
export { createHasatSupabaseClient } from "./supabase/client";
export type { HasatAuthStorageAdapter, CreateHasatSupabaseClientOptions } from "./supabase/client";
