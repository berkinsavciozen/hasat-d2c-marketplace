import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_DISCLOSURE,
  demoDismissalKey,
  getDemoSteps,
  readDemoDismissed,
  shouldShowDemoExperience,
  writeDemoDismissed,
} from "../src/lib/hasat/demo-experience.ts";

test("buyer and farmer demos explain complete but separate flows", () => {
  const buyer = getDemoSteps("buyer");
  const farmer = getDemoSteps("farmer");

  assert.equal(buyer.length, 5);
  assert.equal(farmer.length, 5);
  assert.equal(new Set(buyer.map((step) => step.id)).size, buyer.length);
  assert.equal(new Set(farmer.map((step) => step.id)).size, farmer.length);
  assert.match(DEMO_DISCLOSURE, /gerçek işlem değildir/i);
});

test("farmer demo leaves the main flow after the first active listing", () => {
  assert.equal(
    shouldShowDemoExperience({ role: "farmer", dismissed: false, hasActiveListing: false }),
    true,
  );
  assert.equal(
    shouldShowDemoExperience({ role: "farmer", dismissed: false, hasActiveListing: true }),
    false,
  );
});

test("dismissal is user, role and version scoped", () => {
  assert.notEqual(demoDismissalKey("user-a", "buyer"), demoDismissalKey("user-a", "farmer"));
  assert.notEqual(demoDismissalKey("user-a", "buyer"), demoDismissalKey("user-b", "buyer"));
  assert.equal(shouldShowDemoExperience({ role: "buyer", dismissed: true }), false);
});

test("dismissal persistence is safe and role-specific", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readDemoDismissed(storage, "user-a", "buyer"), false);
  writeDemoDismissed(storage, "user-a", "buyer");
  assert.equal(readDemoDismissed(storage, "user-a", "buyer"), true);
  assert.equal(readDemoDismissed(storage, "user-a", "farmer"), false);

  const blockedStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDemoDismissed(blockedStorage, "user-a", "buyer"), false);
  assert.doesNotThrow(() => writeDemoDismissed(blockedStorage, "user-a", "buyer"));
});
