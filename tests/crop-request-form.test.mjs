import assert from "node:assert/strict";
import test from "node:test";

import { validateCropRequest } from "../src/lib/hasat/crop-request-form.ts";

const valid = {
  cropName: "Safran",
  quantity: "5",
  targetPrice: "250",
  startDate: "2026-11-01",
  endDate: "2026-11-30",
};

test("crop request accepts a complete demand signal", () => {
  assert.equal(validateCropRequest(valid), null);
});

test("crop request rejects unusable quantity, price and date ranges", () => {
  assert.match(validateCropRequest({ ...valid, cropName: " " }), /ürünü yazın/i);
  assert.match(validateCropRequest({ ...valid, quantity: "0" }), /miktar/i);
  assert.match(validateCropRequest({ ...valid, targetPrice: "-1" }), /hedef fiyat/i);
  assert.match(
    validateCropRequest({ ...valid, startDate: "2026-12-01", endDate: "2026-11-30" }),
    /önce olamaz/i,
  );
  assert.match(
    validateCropRequest({ ...valid, startDate: "", endDate: "2026-11-30" }),
    /başlangıç/i,
  );
});
