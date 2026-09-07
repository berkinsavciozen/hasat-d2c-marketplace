import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("buyer and farmer parent routes invoke the server profile guard before load", () => {
  for (const role of ["buyer", "farmer"]) {
    const route = read(`src/routes/${role}.tsx`);
    assert.match(route, /beforeLoad:/);
    assert.match(route, new RegExp(`await requireActiveProfile\\("${role}"\\)`));
    assert.match(
      read(`src/routes/${role === "buyer" ? "buyer.account" : "farmer.settings"}.tsx`),
      /DeleteAccountModal/,
    );
  }
  const guard = read("src/lib/hasat/protectedRouteGuard.ts");
  assert.match(guard, /auth\.getUser\(\)/);
  assert.match(guard, /select\("id, role, deleted_at"\)/);
  assert.match(guard, /if \(!allowed\) throw redirect/);
});

test("bootstrap rejects deleted profile before any persisted user hydration", () => {
  const bootstrap = read("src/routes/__root.tsx");
  const gate = bootstrap.indexOf("if (!hasActiveProfile(session.user.id, profile))");
  assert.ok(gate > -1);
  assert.ok(gate < bootstrap.indexOf("setRole(role)"));
  const rejection = bootstrap.slice(gate, bootstrap.indexOf("setRole(role)"));
  assert.match(rejection, /scope: "local"/);
  assert.match(rejection, /reset\(\)/);
  assert.match(rejection, /queryClient\.clear\(\)/);
});

test("shared deletion modal keeps concrete local cleanup and hard redirect wiring", () => {
  const modal = read("src/components/hasat/DeleteAccountModal.tsx");
  assert.match(modal, /completeAccountDeletion\(/);
  assert.match(modal, /scope: "local"/);
  assert.ok(modal.indexOf("reset();") < modal.indexOf("queryClient.clear();"));
  assert.match(modal, /redirectToStart: \(\) => window\.location\.replace\("\/"\)/);
});
