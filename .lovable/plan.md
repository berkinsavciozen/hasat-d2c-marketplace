## Scope

Backend hazır. Sadece frontend: RFQ SMS tetiklemesi + 5 yeni notif toggle.

## 1) `src/lib/hasat/queries.ts`

**a. `NotifPrefsRow` + defaults'a 5 alan ekle** (satır 2641–2671):
- `order_shipped_sms`, `order_delivered_sms`, `order_cancelled_sms`, `dispute_opened_sms`, `crop_request_match_sms` — hepsi `boolean`, default `true` (kritik durum bildirimleri; kullanıcı kapatabilir).

**b. `useCreateCropRequest` içinde SMS dispatch** (satır ~2437–2453):
Mevcut `notifications` insert'inden sonra, aynı `try` bloğu içinde her `matched` çiftçi için:
```ts
await Promise.all(matched.map((fid) =>
  (supabase as any).rpc('dispatch_sms', {
    _user_id: fid,
    _event: 'crop_request_match',
    _message: `Hasat: ${buyerName} ${cropName} arıyor${qtyLabel}${regionLabel}`,
  }).then(() => {}, (e: unknown) => console.warn('crop_request sms failed', fid, e))
));
```
Mevcut try/catch koruması yeterli — pref kontrolü RPC içinde.

## 2) `src/routes/farmer.settings.notifs.tsx`

`EVENTS` dizisine 5 yeni giriş ekle (sadece `sms` kolonu, mevcut "Teklif Kabul Edildi" satırıyla aynı şekil):
- Kargoya Verildi → `order_shipped_sms`
- Teslim Edildi → `order_delivered_sms`
- Sipariş İptal Edildi → `order_cancelled_sms`
- İhtilaf Açıldı → `dispute_opened_sms`
- Ürün Talebi Eşleşti → `crop_request_match_sms`

## 3) `src/routes/buyer.settings.notifs.tsx`

Aynı 5 girişten `crop_request_match_sms` HARİÇ 4 tanesini ekle.

## 4) Doğrulama

- `bunx tsgo --noEmit` temiz.
- `supabase--insert` ile safran talebi + `dispatch_sms` çağrısı → `net._http_response`'da status 200 + Twilio body satırını göster → test crop_request'i sil.

## Dokunulmayacaklar

`dispatch_sms` RPC, `send-sms` edge function, diğer notif_prefs alanları, offer/order trigger'ları.
