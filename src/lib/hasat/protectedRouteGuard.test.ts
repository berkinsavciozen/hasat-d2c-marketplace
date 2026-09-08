import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveRole, hasActiveProfile, checkProtectedProfile } from "./protectedRouteAccess.ts";

test("accepts an authenticated buyer only on buyer routes", () => {
  assert.equal(
    hasActiveRole("user-1", { id: "user-1", role: "buyer", deleted_at: null }, "buyer"),
    true,
  );
  assert.equal(
    hasActiveRole("user-1", { id: "user-1", role: "farmer", deleted_at: null }, "buyer"),
    false,
  );
});

test("accepts an authenticated farmer only on farmer routes", () => {
  assert.equal(
    hasActiveRole("user-2", { id: "user-2", role: "farmer", deleted_at: null }, "farmer"),
    true,
  );
  assert.equal(
    hasActiveRole("user-2", { id: "user-2", role: "buyer", deleted_at: null }, "farmer"),
    false,
  );
});

test("rejects stale buyer and farmer sessions whose profile was deleted", () => {
  assert.equal(hasActiveRole("deleted-buyer", null, "buyer"), false);
  assert.equal(hasActiveRole("deleted-farmer", null, "farmer"), false);
  assert.equal(
    hasActiveRole(null, { id: "deleted-user", role: "buyer", deleted_at: null }, "buyer"),
    false,
  );
});

for (const role of ["buyer", "farmer"] as const) {
  test(`${role}: bootstrap rejects a retained deleted profile and missing status`, () => {
    assert.equal(
      hasActiveProfile("u", { id: "u", role, deleted_at: "2026-09-07T00:00:00Z" }),
      false,
    );
    assert.equal(hasActiveProfile("u", { id: "u", role }), false);
    assert.equal(hasActiveProfile("u", { id: "other", role, deleted_at: null }), false);
    assert.equal(hasActiveProfile("u", { id: "u", role, deleted_at: null }), true);
  });

  for (const entry of ["refresh", "direct deep-link", "back-button"]) {
    test(`${role}: ${entry} rechecks a valid JWT against retained deleted profile`, async () => {
      const calls: string[] = [];
      let deleted_at: string | null = null;
      const dependencies = {
        getUserId: async () => {
          calls.push("auth");
          return "u";
        },
        readProfile: async () => {
          calls.push("profile");
          return { id: "u", role, deleted_at };
        },
        clearInvalidSession: async () => {
          calls.push("cleanup");
        },
      };
      assert.equal(await checkProtectedProfile(role, dependencies), true);
      deleted_at = "2026-09-07T00:00:00Z";
      assert.equal(await checkProtectedProfile(role, dependencies), false);
      assert.deepEqual(calls, ["auth", "profile", "auth", "profile", "cleanup"]);
    });
  }

  test(`${role}: expired/stale JWT and lookup failures fail closed`, async () => {
    for (const failure of ["no-user", "auth-error", "profile-error", "no-profile", "wrong-role"]) {
      let cleared = 0;
      assert.equal(
        await checkProtectedProfile(role, {
          getUserId: async () => {
            if (failure === "auth-error") throw new Error("invalid JWT");
            return failure === "no-user" ? null : "u";
          },
          readProfile: async () => {
            if (failure === "profile-error") throw new Error("unavailable");
            return failure === "no-profile" ? null : { id: "u", role: "other", deleted_at: null };
          },
          clearInvalidSession: async () => {
            cleared++;
          },
        }),
        false,
      );
      assert.equal(cleared, 1);
    }
  });
}
