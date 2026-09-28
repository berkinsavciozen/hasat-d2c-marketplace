import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPrivateRecipeShareUrl,
  captureShareTokenFromFragment,
  hasPendingShareToken,
  withPendingShareToken,
} from "../src/lib/hasat/recipeShareSecurity.ts";
import { expiryFromNow, RECIPE_SHARE_DURATIONS } from "../src/lib/hasat/recipeShareExpiry.ts";
import {
  deliverPrivateRecipeShareUrl,
  runPrivateRecipeShareAction,
} from "../src/lib/hasat/privateRecipeShareDelivery.ts";
import { resolvePrivateRecipeShareEnabled } from "../src/lib/hasat/privateRecipeShareFlag.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const TOKEN = "a".repeat(64);

test("share durations match the client contract and remain valid after transport delay", () => {
  assert.deepEqual(
    RECIPE_SHARE_DURATIONS.map(({ label }) => label),
    ["10 dakika", "1 saat", "1 gün", "7 gün", "30 gün"],
  );

  const clientNow = Date.UTC(2026, 8, 23, 12, 0, 0);
  const backendNow = clientNow + 7_000;
  const minimumExpiry = Date.parse(expiryFromNow(RECIPE_SHARE_DURATIONS[0].value, clientNow));
  const maximumExpiry = Date.parse(expiryFromNow(RECIPE_SHARE_DURATIONS[4].value, clientNow));

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

test("code-level kill switch stays off when env is true or missing", async () => {
  const flag = await read("../src/lib/hasat/privateRecipeShareFlag.ts");
  const api = await read("../src/lib/hasat/recipeShare.ts");

  assert.equal(resolvePrivateRecipeShareEnabled("true"), false);
  assert.equal(resolvePrivateRecipeShareEnabled(undefined), false);
  assert.doesNotMatch(flag, /import\.meta\.env|VITE_UX1F_PRIVATE_RECIPE_SHARE/);
  assert.match(flag, /PRIVATE_RECIPE_SHARE_ENABLED = resolvePrivateRecipeShareEnabled\(\)/);
  assert.match(api, /enabled: PRIVATE_RECIPE_SHARE_ENABLED/);
  assert.match(api, /function requireEnabled/);
});

test("native share success does not copy the capability URL", async () => {
  const calls = [];
  const result = await deliverPrivateRecipeShareUrl("https://example.test/#share=secret", {
    share: async (data) => calls.push(["share", data.url]),
    clipboard: { writeText: async (value) => calls.push(["copy", value]) },
  });

  assert.equal(result, "shared");
  assert.deepEqual(calls, [["share", "https://example.test/#share=secret"]]);
});

test("unsupported native share copies the same fragment URL", async () => {
  const copied = [];
  const url = "https://example.test/tarif-paylasim#share=secret";
  const result = await deliverPrivateRecipeShareUrl(url, {
    share: undefined,
    clipboard: { writeText: async (value) => copied.push(value) },
  });

  assert.equal(result, "copied");
  assert.deepEqual(copied, [url]);
});

test("non-Abort native share rejection falls back to clipboard", async () => {
  const copied = [];
  const url = "https://example.test/tarif-paylasim#share=secret";
  const result = await deliverPrivateRecipeShareUrl(url, {
    share: async () => {
      throw new TypeError("share unavailable");
    },
    clipboard: { writeText: async (value) => copied.push(value) },
  });

  assert.equal(result, "copied");
  assert.deepEqual(copied, [url]);
});

test("AbortError is a silent terminal result and does not copy", async () => {
  let copied = false;
  const result = await deliverPrivateRecipeShareUrl("https://example.test/#share=secret", {
    share: async () => {
      throw new DOMException("cancelled", "AbortError");
    },
    clipboard: { writeText: async () => void (copied = true) },
  });

  assert.equal(result, "aborted");
  assert.equal(copied, false);
});

test("share and clipboard double failure emits a token-free error", async () => {
  const url = "https://example.test/tarif-paylasim#share=must-not-leak";
  await assert.rejects(
    deliverPrivateRecipeShareUrl(url, {
      share: async () => {
        throw new TypeError("share failed");
      },
      clipboard: {
        writeText: async () => {
          throw new DOMException("copy failed", "NotAllowedError");
        },
      },
    }),
    (error) => {
      assert.equal(error.message, "private_recipe_share_delivery_failed");
      assert.doesNotMatch(String(error), /must-not-leak/);
      return true;
    },
  );
});

test("double delivery failure retries the same token without creating another grant", async () => {
  let grantCalls = 0;
  const delivered = [];
  const grantAction = async () => ({ token: `token-${++grantCalls}` });
  const deliverToken = async (token) => {
    delivered.push(token);
    return "failed";
  };

  const first = await runPrivateRecipeShareAction({
    actionKey: "create:recipe-a",
    pendingDelivery: null,
    grantAction,
    deliverToken,
  });
  const second = await runPrivateRecipeShareAction({
    actionKey: "create:recipe-a",
    pendingDelivery: first.pendingDelivery,
    grantAction,
    deliverToken,
  });

  assert.equal(grantCalls, 1);
  assert.deepEqual(delivered, ["token-1", "token-1"]);
  assert.deepEqual(second.pendingDelivery, {
    actionKey: "create:recipe-a",
    token: "token-1",
  });
});

test("a different recipe cannot reuse the previous recipe's pending token", async () => {
  let grantCalls = 0;
  const delivered = [];
  const grantAction = async () => ({ token: `token-${++grantCalls}` });
  const deliverToken = async (token) => {
    delivered.push(token);
    return "failed";
  };
  const recipeA = await runPrivateRecipeShareAction({
    actionKey: "create:recipe-a",
    pendingDelivery: null,
    grantAction,
    deliverToken,
  });

  await runPrivateRecipeShareAction({
    actionKey: "create:recipe-b",
    pendingDelivery: recipeA.pendingDelivery,
    grantAction,
    deliverToken,
  });

  assert.equal(grantCalls, 2);
  assert.deepEqual(delivered, ["token-1", "token-2"]);
});

test("create and rotate both deliver their one-time token under one pending guard", async () => {
  const owner = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");

  assert.match(owner, /actionPendingRef\.current/);
  assert.match(owner, /pendingDeliveryRef/);
  assert.match(owner, /`create:\$\{recipeId\}`/);
  assert.match(
    owner,
    /activeRecipeIdRef\.current = recipeId;\s*pendingDeliveryRef\.current = null/,
  );
  assert.match(owner, /activeRecipeIdRef\.current === recipeId/);
  assert.match(owner, /runGrantAction\([\s\S]*?create\.mutateAsync/);
  assert.match(owner, /runGrantAction\([\s\S]*?rotate\.mutateAsync/);
  assert.match(owner, /disabled=\{actionPending\}/);
});

test("delivery pending disables create, rotate, and revoke actions", async () => {
  const owner = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");

  assert.equal(owner.match(/disabled=\{actionPending\}/g)?.length, 2);
  assert.match(owner, /disabled=\{actionPending \|\| revoke\.isPending\}/);
  assert.match(owner, /!actionPendingRef\.current &&\s*revoke\.mutate/);
});

test("delivery keeps capabilities out of query strings, logging, and persistence", async () => {
  const delivery = await read("../src/lib/hasat/privateRecipeShareDelivery.ts");
  const owner = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");
  const source = `${delivery}\n${owner}`;

  assert.doesNotMatch(
    source,
    /console\.|captureException|captureMessage|localStorage|sessionStorage|indexedDB/,
  );
  assert.doesNotMatch(source, /[?&]share=/);
  assert.doesNotMatch(delivery, /throw new Error\([^)]*url/);
});
