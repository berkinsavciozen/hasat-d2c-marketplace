import assert from "node:assert/strict";
import test from "node:test";

import { convertListingUnitValues, validateActiveListing } from "../src/lib/hasat/listing-form.ts";

test("g and kg conversion preserves stock value and minimum order", () => {
  const kg = convertListingUnitValues(
    { quantity: 2_500, minOrder: 500, pricePerUnit: 0.35 },
    "g",
    "kg",
  );

  assert.deepEqual(kg, {
    quantity: 2.5,
    minOrder: 0.5,
    pricePerUnit: 350,
    converted: true,
  });
  assert.equal(2_500 * 0.35, kg.quantity * kg.pricePerUnit);

  const grams = convertListingUnitValues(kg, "kg", "g");
  assert.equal(grams.quantity, 2_500);
  assert.equal(grams.minOrder, 500);
  assert.equal(grams.pricePerUnit, 0.35);
});

test("incompatible mass and volume units are never silently converted", () => {
  assert.deepEqual(
    convertListingUnitValues({ quantity: 10, minOrder: 1, pricePerUnit: 40 }, "kg", "L"),
    { quantity: 10, minOrder: 1, pricePerUnit: 40, converted: false },
  );
});

test("active listing requires complete, internally consistent inputs", () => {
  const valid = {
    crop: "safran",
    parcelId: "parcel-1",
    quantity: 10,
    unit: "kg",
    pricePerUnit: 250,
    minOrder: 2,
    photoCount: 1,
  };

  assert.equal(validateActiveListing(valid), null);
  assert.match(validateActiveListing({ ...valid, crop: "" }), /ürün seçin/i);
  assert.match(validateActiveListing({ ...valid, parcelId: "" }), /parseli seçin/i);
  assert.match(validateActiveListing({ ...valid, quantity: 0 }), /miktar/i);
  assert.match(validateActiveListing({ ...valid, pricePerUnit: 0 }), /fiyat/i);
  assert.match(validateActiveListing({ ...valid, minOrder: 11 }), /büyük olamaz/i);
  assert.match(validateActiveListing({ ...valid, photoCount: 0 }), /gerçek fotoğraf/i);
});
