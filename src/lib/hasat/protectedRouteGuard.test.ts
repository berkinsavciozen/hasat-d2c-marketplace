import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveRole } from "./protectedRouteAccess.ts";

test("accepts an authenticated buyer only on buyer routes", () => {
  assert.equal(hasActiveRole("user-1", { id: "user-1", role: "buyer" }, "buyer"), true);
  assert.equal(hasActiveRole("user-1", { id: "user-1", role: "farmer" }, "buyer"), false);
});

test("accepts an authenticated farmer only on farmer routes", () => {
  assert.equal(hasActiveRole("user-2", { id: "user-2", role: "farmer" }, "farmer"), true);
  assert.equal(hasActiveRole("user-2", { id: "user-2", role: "buyer" }, "farmer"), false);
});

test("rejects stale buyer and farmer sessions whose profile was deleted", () => {
  assert.equal(hasActiveRole("deleted-buyer", null, "buyer"), false);
  assert.equal(hasActiveRole("deleted-farmer", null, "farmer"), false);
  assert.equal(hasActiveRole(null, { id: "deleted-user", role: "buyer" }, "buyer"), false);
});
