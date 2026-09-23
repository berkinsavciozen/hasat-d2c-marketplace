import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPrivateRecipeShareUrl,
  captureShareTokenFromFragment,
  hasPendingShareToken,
  withPendingShareToken,
} from "../src/lib/hasat/recipeShareSecurity.ts";
import {
  expiryFromNow,
  RECIPE_SHARE_DURATIONS,
} from "../src/lib/hasat/recipeShareExpiry.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const TOKEN = "a".repeat(64);

test("share durations match the client contract and remain valid after transport delay", () => {
  assert.deepEqual(
    RECIPE_SHARE_DURATIONS.map(({ label }) => label),
    ["10 dakika", "1 saat", "1 gün", "7 gün", "30 gün"],
  );

  const clientNow = Date.UTC(2026, 8, 23, 12, 0, 0);
  const backendNow = clientNow + 7_000;
  const minimumExpiry = Date.parse(
    expiryFromNow(RECIPE_SHARE_DURATIONS[0].value, clientNow),
  );
  const maximumExpiry = Date.parse(
    expiryFromNow(RECIPE_SHARE_DURATIONS[4].value, clientNow),
  );

  assert.ok(minimumExpiry >= backendNow + 5 * 60_000);
  assert.ok(maximumExpiry <= backendNow + 30 * 24 * 60 * 60_000);
});

test("fragment is captured in memory and synchronously removed from the address", async () => {
  let replaced = "";
  const location = {
    hash: `#share=${TOKEN}`,
    pathname: "/tarif-paylasim",
    search: "?share=must-not-survive&safe=1",
  };
  const history = {
    state: null,
    replaceState: (_state, _title, url) => {
      replaced = url;
    },
  };
  assert.equal(captureShareTokenFromFragment(location, history), true);
  assert.equal(replaced, "/tarif-paylasim?safe=1");
  assert.equal(hasPendingShareToken(), true);
  assert.equal(await withPendingShareToken(async (token) => token.length), 64);
});

test("share URL uses fragment and rejects malformed capabilities", () => {
  assert.equal(
    buildPrivateRecipeShareUrl("https://hasat-ai.com/", TOKEN),
    `https://hasat-ai.com/tarif-paylasim#share=${TOKEN}`,
  );
  assert.throws(() => buildPrivateRecipeShareUrl("https://hasat-ai.com", "bad"));
});

test("web contract has no legacy RPC or token-bearing cache/redirect", async () => {
  const api = await read("../src/lib/hasat/recipeShare.ts");
  const route = await read("../src/routes/tarif-paylasim.tsx");
  const owner = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");
  const all = `${api}\n${route}\n${owner}`;
  assert.doesNotMatch(
    all,
    /rpc_generate_recipe_share_token|rpc_get_shared_recipe|rpc_revoke_recipe_share_token/,
  );
  assert.doesNotMatch(
    route,
    /localStorage|sessionStorage|indexedDB|search:\s*\{[^}]*share|next:[^\n]*token/,
  );
  assert.doesNotMatch(api, /queryKey:\s*\[[^\]]*token/);
  assert.match(route, /history\.replaceState|noindex,nofollow,noarchive|no-referrer|no-store/);
  assert.match(
    api,
    /recipe_share_operation_in_progress|recipe_share_idempotency_conflict|recipe_share_cannot_clone_own/,
  );
});

test("feature flag is default-off and gates every RPC surface", async () => {
  const flag = await read("../src/lib/hasat/privateRecipeShareFlag.ts");
  const api = await read("../src/lib/hasat/recipeShare.ts");
  assert.match(flag, /=== "true"/);
  assert.match(api, /enabled: PRIVATE_RECIPE_SHARE_ENABLED/);
  assert.match(api, /function requireEnabled/);
});
