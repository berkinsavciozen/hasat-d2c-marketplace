# WebP WASM binaries (F2 Step 09 — Gate B)

`webp_enc.wasm` and `webp_dec.wasm` were the non-SIMD Emscripten WASM binaries from
[`@jsquash/webp@1.5.0`](https://www.npmjs.com/package/@jsquash/webp)
(`codec/enc/webp_enc.wasm` / `codec/dec/webp_dec.wasm` in that package), which itself vendors
Google's `libwebp` encoder/decoder compiled to WebAssembly (Apache-2.0, see
[the codec's own LICENSE](https://github.com/jamsinclair/jSquash/blob/main/packages/webp/codec/LICENSE.codec.md)).

## 2026-09-01 hotfix: no longer vendored as separate files here

These two files used to live in this directory and were read via
`Deno.readFile(new URL("./vendor/webp_enc.wasm", import.meta.url))`. That depended on Supabase's
Edge Function deploy pipeline actually bundling non-JS/TS binary assets alongside the function's
source — **live-verified NOT to hold**: inspecting the deployed `recipe-stage-image` function's own
file listing after both an MCP-tool deploy and a `supabase functions deploy` CLI run via GitHub
Actions showed neither included `vendor/*.wasm`. Every real invocation failed with
`IMAGE_WEBP_ENCODE_FAILED` ("path not found") — the encoder was silently missing in every
production deploy this function ever had.

Fix: both `.wasm` payloads are now embedded as base64 string constants directly in
`../webp-codec.ts`, decoded via `atob()` at init time. This removes the dependency on
asset-bundling entirely — whatever a deploy pipeline does with non-`.ts` files, the bytes now
travel with the source itself. This directory is kept only for this README's provenance notes; the
binaries themselves are not present here anymore (see `../webp-codec.ts` for the live copy).

## Why a manually-instantiated WASM module at all

`@jsquash/webp`'s own `encode()`/`decode()` entry points lazily call `init()`, which by default
lets the Emscripten glue self-locate and `fetch()`/`readFile()` its `.wasm` file relative to the
package's own install location. That default path is exactly the "WASM initialization failure"
F2 Step 01 hit on Supabase's Edge Runtime (a sandboxed Deno isolate with no filesystem access to
an npm cache directory and no guarantee a same-origin relative `fetch()` resolves). jSquash's own
documented fix for constrained runtimes (Cloudflare Workers, Deno Deploy) is to instantiate the
WASM module yourself and hand `init()` a `WebAssembly.Module` instead of letting it self-locate —
see `../webp-codec.ts`.

The SIMD variant (`webp_enc_simd.wasm`/`webp_enc_simd.js`) was deliberately not used — Supabase
Edge Runtime's exact CPU/SIMD support isn't something this step could verify, and the non-SIMD
binary is the portable, always-correct choice; it costs some encode speed, not correctness.

## Provenance

- Source package: `@jsquash/webp@1.5.0` (npm, fetched via `https://registry.npmjs.org`)
- `webp_enc.wasm` sha256: `b6085bb6702f144e9dc6016d58d230b34a84976bf0d080b7390b4b4b137d6ab7`
- `webp_dec.wasm` sha256: `30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344`

To upgrade: download the new package's `codec/enc/webp_enc.wasm` and `codec/dec/webp_dec.wasm`,
base64-encode each (`base64 -w0 webp_enc.wasm`) and replace the `ENCODER_WASM_BASE64` /
`DECODER_WASM_BASE64` constants in `../webp-codec.ts`, bump the `npm:@jsquash/webp@...` version pin
in that same file to match (the JS glue and the WASM binary must come from the same package
version), update the sha256 values above, and re-run `../webp-codec.test.ts`.
