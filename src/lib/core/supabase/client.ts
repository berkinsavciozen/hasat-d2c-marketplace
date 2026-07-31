// hasat-core — BU DOSYAYI BURADA DÜZENLEME. Değişiklik hasat-core reposunda yapılır.
//
// Paylaşılan Supabase client factory'si. Web ve mobil aynı client kurulum
// mantığını (Database tipleri, persistSession, autoRefreshToken) paylaşır;
// tek fark oturumun nerede saklandığıdır (web `localStorage`, mobil
// `expo-secure-store`) — bu yüzden storage bir parametre.
//
// ⚠️ M5 notu: web'in kendi `src/integrations/supabase/client.ts` dosyası
// Lovable'ın ürettiği bir scaffold'dur ("This file is automatically
// generated"). Bu factory web tarafında KULLANILIYORSA bile o dosyanın
// üzerine yazılma riski (kural #105/#106'daki types.ts senaryosunun aynısı)
// aynen geçerli — factory bu riski ortadan kaldırmaz, sadece iki client
// kurulumunun (web/mobil) birbirinden sapmasını önler.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/types";

/**
 * supabase-js'in beklediği minimal storage arayüzü. Hem senkron (web
 * `localStorage`) hem asenkron (mobil `expo-secure-store`) uygulamalar bu
 * imzaya uyar — supabase-js ikisini de destekler.
 */
export interface HasatAuthStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface CreateHasatSupabaseClientOptions {
  /**
   * Oturumun nerede saklanacağı — web: `localStorage`, mobil:
   * expo-secure-store tabanlı adapter. Opsiyonel: web'in SSR yolunda
   * (`typeof window === 'undefined'`) mevcut davranış `storage: undefined`
   * geçip supabase-js'in SSR'da güvenli varsayılanına bırakmaktı — bu factory
   * o davranışı değiştirmez.
   */
  storage?: HasatAuthStorageAdapter;
}

/**
 * Tek doğruluk kaynağı: Supabase client'ı hep aynı `auth` ayarlarıyla
 * (`persistSession: true`, `autoRefreshToken: true`) kurar. Platforma özel
 * olan tek şey `storage`'dır — web'in mevcut davranışı (localStorage,
 * persistSession, autoRefreshToken) burada birebir korunmuştur.
 */
export function createHasatSupabaseClient(
  url: string,
  publishableKey: string,
  { storage }: CreateHasatSupabaseClientOptions,
): SupabaseClient<Database> {
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
