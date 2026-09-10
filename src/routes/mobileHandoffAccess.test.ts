// Run with: node --experimental-strip-types --test src/routes/mobileHandoffAccess.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NEXT,
  isSafeNextPath,
  parseHandoffFragment,
  resolveHandoffNext,
} from "./mobileHandoffAccess.ts";

// isSafeNextPath is unchanged by T9 (dispatch: "isSafeNextPath() mantığı ... davranışını değiştirme").
test("isSafeNextPath: accepts same-origin relative paths only", () => {
  assert.equal(isSafeNextPath("/buyer/discover"), true);
  assert.equal(isSafeNextPath("/orders/123"), true);
});

test("isSafeNextPath: rejects protocol-relative and absolute URLs", () => {
  assert.equal(isSafeNextPath("//evil.example/phish"), false);
  assert.equal(isSafeNextPath("https://evil.example"), false);
  assert.equal(isSafeNextPath("javascript:alert(1)"), false);
});

test("isSafeNextPath: rejects non-strings and paths not starting with /", () => {
  assert.equal(isSafeNextPath(null), false);
  assert.equal(isSafeNextPath(undefined), false);
  assert.equal(isSafeNextPath(42), false);
  assert.equal(isSafeNextPath("buyer/discover"), false);
});

test("parseHandoffFragment: reads nonce and next from a #-prefixed hash", () => {
  const parsed = parseHandoffFragment("#nonce=abc123&next=%2Fbuyer%2Forders");
  assert.equal(parsed.nonce, "abc123");
  assert.equal(parsed.next, "/buyer/orders");
});

test("parseHandoffFragment: also accepts a hash with the leading # already stripped", () => {
  const parsed = parseHandoffFragment("nonce=xyz&next=%2Ffoo");
  assert.equal(parsed.nonce, "xyz");
  assert.equal(parsed.next, "/foo");
});

test("parseHandoffFragment: no fragment at all -> both null (falls to /login upstream)", () => {
  const parsed = parseHandoffFragment("");
  assert.equal(parsed.nonce, null);
  assert.equal(parsed.next, null);
});

test("parseHandoffFragment: never reads the old access_token/refresh_token keys as anything special", () => {
  // Regression guard: T9 must not accidentally still branch on these old fragment keys.
  const parsed = parseHandoffFragment("#access_token=leaked&refresh_token=leaked&next=/x");
  assert.equal(parsed.nonce, null);
  assert.equal(parsed.next, "/x");
});

test("resolveHandoffNext: prefers the server-issued next_path when safe", () => {
  assert.equal(resolveHandoffNext("/server/path", "/fragment/path"), "/server/path");
});

test("resolveHandoffNext: falls back to the fragment's next when server next_path is absent", () => {
  assert.equal(resolveHandoffNext(null, "/fragment/path"), "/fragment/path");
  assert.equal(resolveHandoffNext(undefined, "/fragment/path"), "/fragment/path");
  assert.equal(resolveHandoffNext("", "/fragment/path"), "/fragment/path");
});

test("resolveHandoffNext: falls back to DEFAULT_NEXT when neither source is safe", () => {
  assert.equal(resolveHandoffNext(null, null), DEFAULT_NEXT);
  assert.equal(resolveHandoffNext("//evil.example", "//evil.example"), DEFAULT_NEXT);
});

test("resolveHandoffNext: an unsafe server next_path is never rescued by falling back to the fragment", () => {
  // A present (even if unsafe) server next_path is authoritative — it must not cause a second-guess
  // fallback to the less-trusted fragment value, safe or not.
  assert.equal(resolveHandoffNext("//evil.example", "/otherwise/safe/fragment/path"), DEFAULT_NEXT);
  assert.equal(resolveHandoffNext("//evil.example", "https://evil.example"), DEFAULT_NEXT);
});
