// F2 Recipe Automation — Step 09: minimal magic-byte sniff for the two formats Gemini plausibly
// returns (PNG, JPEG) — not a general file-type library, just enough to set recipe_assets'
// `content_type` correctly for the raw 'source' asset (the crop/hero/square assets are always
// `image/webp`, set directly by the caller, never sniffed).
export function sniffImageMimeType(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}
