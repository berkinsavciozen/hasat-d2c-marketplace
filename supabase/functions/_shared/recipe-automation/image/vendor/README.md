# Vendored WebP WASM binaries (F2 Step 09 — Gate B)

`webp_enc.wasm` and `webp_dec.wasm` are the non-SIMD Emscripten WASM binaries from
[`@jsquash/webp@1.5.0`](https://www.npmjs.com/package/@jsquash/webp)
(`codec/enc/webp_enc.wasm` / `codec/dec/webp_dec.wasm` in that package), which itself vendors
Google's `libwebp` encoder/decoder compiled to WebAssembly (Apache-2.0, see
[the codec's own LICENSE](https://github.com/jamsinclair/jSquash/blob/main/packages/webp/codec/LICENSE.codec.md)).

## Why these are committed here instead of resolved at import time

`@jsquash/webp`'s own `encode()`/`decode()` entry points lazily call `init()`, which by default
lets the Emscripten glue self-locate and `fetch()`/`readFile()` its `.wasm` file relative to the
package's own install location. That default path is exactly the "WASM initialization failure"
F2 Step 01 hit on Supabase's Edge Runtime (a sandboxed Deno isolate with no filesystem access to
an npm cache directory and no guarantee a same-origin relative `fetch()` resolves). jSquash's own
documented fix for constrained runtimes (Cloudflare Workers, Deno Deploy) is to instantiate the
WASM module yourself and hand `init()` a `WebAssembly.Module` instead of letting it self-locate —
see `../webp-codec.ts`. That still requires the raw `.wasm` bytes to come from *somewhere* Deno can
reach deterministically at both `deno test` time and Supabase deploy time; vendoring the two files
directly into this directory and reading them via
`Deno.readFile(new URL("./vendor/webp_enc.wasm", import.meta.url))` is that deterministic source —
no runtime dependency on npm's CDN, no reliance on Deno's npm-cache layout, works identically
locally and once deployed (Supabase bundles a function's entire directory, binary assets included).

The SIMD variant (`webp_enc_simd.wasm`/`webp_enc_simd.js`) was deliberately NOT vendored — Supabase
Edge Runtime's exact CPU/SIMD support isn't something this step could verify, and the non-SIMD
binary is the portable, always-correct choice; it costs some encode speed, not correctness.

## Provenance

- Source package: `@jsquash/webp@1.5.0` (npm, fetched via `https://registry.npmjs.org`)
- `webp_enc.wasm` sha256: `b6085bb6702f144e9dc6016d58d230b34a84976bf0d080b7390b4b4b137d6ab7`
- `webp_dec.wasm` sha256: `30fb52fa2a80166d25ba7debf902218904ba1f05ccce9f959f722beff9e2f344`

To upgrade: download the new package's `codec/enc/webp_enc.wasm` and `codec/dec/webp_dec.wasm`,
replace these two files, bump the `npm:@jsquash/webp@...` version pin in `../webp-codec.ts` to
match (the JS glue and the WASM binary must come from the same package version), and re-run
`../webp-codec.test.ts`.
