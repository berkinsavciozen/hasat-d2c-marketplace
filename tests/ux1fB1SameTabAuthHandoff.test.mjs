import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { navigateToLoginNext, safeLoginNext } from "../src/lib/hasat/loginNext.ts";
import {
  captureShareTokenFromFragment,
  clearPendingShareToken,
  hasPendingShareToken,
  withPendingShareToken,
} from "../src/lib/hasat/recipeShareSecurity.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const TOKEN = "b".repeat(64);

function captureShareToken() {
  let replaced = "";
  const location = {
    hash: `#share=${TOKEN}`,
    pathname: "/tarif-paylasim",
    search: "",
  };
  const history = {
    state: null,
    replaceState: (_state, _title, url) => {
      replaced = url;
    },
  };

  assert.equal(captureShareTokenFromFragment(location, history), true);
  assert.equal(replaced, "/tarif-paylasim");
}

test("fragment cleanup -> SPA login return keeps the capability in module memory", async () => {
  clearPendingShareToken();
  captureShareToken();

  const next = safeLoginNext("/tarif-paylasim");
  assert.equal(next, "/tarif-paylasim");
  assert.doesNotMatch(next, /share|token|#/i);

  let navigation = null;
  assert.equal(
    navigateToLoginNext((options) => {
      navigation = options;
    }, next),
    true,
  );
  assert.deepEqual(navigation, { href: "/tarif-paylasim" });
  assert.equal(hasPendingShareToken(), true);
  assert.equal(await withPendingShareToken(async (token) => token.length), 64);
});

test("a full module reload has no capability and fails closed", async () => {
  clearPendingShareToken();
  captureShareToken();

  const reloaded = await import(`../src/lib/hasat/recipeShareSecurity.ts?reload=${Date.now()}`);
  assert.equal(reloaded.hasPendingShareToken(), false);
  await assert.rejects(
    reloaded.withPendingShareToken(async () => "unexpected"),
    /recipe_share_token_missing/,
  );
});

test("login next allowlist accepts only the intended same-origin routes", () => {
  assert.equal(safeLoginNext("/tarif-paylasim"), "/tarif-paylasim");
  assert.equal(safeLoginNext("/tarifler/domates-corbasi"), "/tarifler/domates-corbasi");
  assert.equal(
    safeLoginNext("/.lovable/oauth/consent?authorization_id=opaque-id"),
    "/.lovable/oauth/consent?authorization_id=opaque-id",
  );

  for (const unsafe of [
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "/%5cevil.example/phish",
    "/%2f%2fevil.example/phish",
    "/%2e%2e/%2f%2fevil.example",
    "/tarif-paylasim?next=https://evil.example",
    `/tarif-paylasim#share=${TOKEN}`,
    "/buyer/discover",
  ]) {
    assert.equal(safeLoginNext(unsafe), undefined, unsafe);
  }
});

test("login uses client navigation, preserves role defaults, and keeps tokens out of telemetry", async () => {
  const login = await read("../src/routes/login.tsx");
  const recipient = await read("../src/routes/tarif-paylasim.tsx");
  const security = await read("../src/lib/hasat/recipeShareSecurity.ts");

  assert.doesNotMatch(login, /window\.location\.href\s*=\s*next/);
  assert.match(login, /navigateToLoginNext\(navigate, next\)/);
  assert.match(login, /"\/buyer\/discover"\s*:\s*"\/farmer\/home"/);
  assert.match(recipient, /auth !== "ready"/);
  assert.match(recipient, /next: "\/tarif-paylasim"/);

  const boundary = `${login}\n${recipient}\n${security}`;
  assert.doesNotMatch(
    boundary,
    /localStorage|sessionStorage|indexedDB|next:[^\n]*(?:share|token)|Sentry\.[^(]+\([^)]*token/i,
  );
});
