import assert from "node:assert/strict";
import test from "node:test";
import { getTourTabTarget, restoreTourFocus } from "./tour-focus.ts";

test("tour focus moves forward and wraps within the dialog", () => {
  const controls = ["Atla", "İleri"];
  assert.equal(getTourTabTarget(controls, null, false), "Atla");
  assert.equal(getTourTabTarget(controls, "Atla", false), "İleri");
  assert.equal(getTourTabTarget(controls, "İleri", false), "Atla");
});

test("tour focus moves backward and wraps within the dialog", () => {
  const controls = ["Atla", "İleri"];
  assert.equal(getTourTabTarget(controls, null, true), "İleri");
  assert.equal(getTourTabTarget(controls, "Atla", true), "İleri");
  assert.equal(getTourTabTarget(controls, "İleri", true), "Atla");
});

test("tour focus restores the connected previous element", () => {
  let previousFocused = false;
  let fallbackFocused = false;
  const previous = { isConnected: true, focus: () => (previousFocused = true) };
  const fallback = { isConnected: true, focus: () => (fallbackFocused = true) };

  assert.equal(restoreTourFocus(previous, fallback), previous);
  assert.equal(previousFocused, true);
  assert.equal(fallbackFocused, false);
});

test("tour focus safely falls back when the previous element was removed", () => {
  let fallbackFocused = false;
  const previous = { isConnected: false, focus: () => assert.fail("removed element focused") };
  const fallback = { isConnected: true, focus: () => (fallbackFocused = true) };

  assert.equal(restoreTourFocus(previous, fallback), fallback);
  assert.equal(fallbackFocused, true);
});

test("tour focus skips a connected but hidden previous element", () => {
  let fallbackFocused = false;
  const previous = {
    isConnected: true,
    focus: () => assert.fail("hidden element focused"),
    getClientRects: () => ({ length: 0 }),
  };
  const fallback = { isConnected: true, focus: () => (fallbackFocused = true) };

  assert.equal(restoreTourFocus(previous, fallback), fallback);
  assert.equal(fallbackFocused, true);
});
