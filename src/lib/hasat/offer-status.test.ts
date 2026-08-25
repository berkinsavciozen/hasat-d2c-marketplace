import assert from "node:assert/strict";
import test from "node:test";
import type { Offer } from "./types.ts";
import { statusVisual } from "./offer-status.ts";

function offer(overrides: Partial<Offer>): Offer {
  return {
    id: "offer-1",
    buyerName: "Uzun İsimli Alıcı İşletmesi",
    buyerType: "restoran",
    crop: "Ata Tohumu Çok Uzun Ürün Adı",
    unit: "kg",
    quantity: 24,
    pricePerUnit: 42,
    createdAt: "2026-08-25T09:00:00.000Z",
    status: "pending",
    ballSide: "buyer",
    paymentStatus: "unpaid",
    ...overrides,
  };
}

for (const status of ["pending", "counter"] as const) {
  test(`${status}: current viewer must act`, () => {
    assert.deepEqual(statusVisual(offer({ status, ballSide: "buyer" }), "buyer"), {
      label: "Yanıtınızı Bekliyoruz",
      tone: "warn",
    });
  });

  test(`${status}: counterparty must act`, () => {
    assert.equal(statusVisual(offer({ status, ballSide: "farmer" }), "buyer").tone, "muted");
  });
}

test("accepted but unpaid requires payment action", () => {
  assert.equal(
    statusVisual(offer({ status: "accepted", paymentStatus: "unpaid" }), "buyer").tone,
    "warn",
  );
});

test("accepted and paid is successful", () => {
  assert.equal(
    statusVisual(offer({ status: "accepted", paymentStatus: "paid" }), "buyer").tone,
    "ok",
  );
});

test("completed is successful", () => {
  assert.equal(statusVisual(offer({ status: "completed" }), "buyer").tone, "ok");
});

test("rejected is dangerous", () => {
  assert.equal(statusVisual(offer({ status: "rejected" }), "buyer").tone, "bad");
});
