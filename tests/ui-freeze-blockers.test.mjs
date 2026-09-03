import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const farmerHome = readFileSync(new URL("../src/routes/farmer.home.tsx", import.meta.url), "utf8");
const buyerDiscover = readFileSync(
  new URL("../src/routes/buyer.discover.tsx", import.meta.url),
  "utf8",
);
const tour = readFileSync(
  new URL("../src/components/hasat/OnboardingTour.tsx", import.meta.url),
  "utf8",
);

test("farmer chat content can shrink without shrinking the 48px WhatsApp action", () => {
  assert.match(farmerHome, /min-h-\[48px\] min-w-0 flex-1/);
  assert.match(farmerHome, /<span className="min-w-0 flex-1 truncate">/);
  assert.match(farmerHome, /className="grid h-12 w-12 shrink-0/);
});

test("farmer quick actions own their horizontal overflow", () => {
  const quickActionsClass = farmerHome.match(
    /<div className="([^"]*overflow-x-auto[^"]*)">\s*\{quickActions\.map/,
  )?.[1];
  assert.ok(quickActionsClass);
  assert.match(quickActionsClass, /min-w-0/);
  assert.match(quickActionsClass, /max-w-/);
  assert.doesNotMatch(farmerHome, /(?:html|body).*overflow-x-hidden/);
});

test("tour enters at the heading, traps focus, closes on Escape, and isolates background", () => {
  assert.match(tour, /headingRef\.current\?\.focus\(\)/);
  assert.match(tour, /getTourTabTarget\(/);
  assert.match(tour, /if \(e\.key === "Escape"\)/);
  assert.match(tour, /element\.setAttribute\("inert", ""\)/);
  assert.match(tour, /restoreTourFocus\(previousFocusRef\.current, fallback\)/);
  assert.match(tour, /tabIndex=\{-1\}/);
});

test("tour step changes retain separate skip and next or finish controls", () => {
  assert.match(tour, /setIdx\(\(i\) => i \+ 1\)/);
  assert.match(tour, />\s*Atla\s*<\/button>/);
  assert.match(tour, /\{isLast \? "Bitir" : "İleri"\}/);
  assert.match(tour, /\[idx, mounted, open\]/);
});

test("listing card has three sibling native actions without an interactive container", () => {
  const card = buyerDiscover.slice(buyerDiscover.indexOf("function ListingGroupCard"));
  assert.match(card, /<article/);
  assert.doesNotMatch(card, /role="button"/);
  assert.match(card, /<Link to="\/s\/\$slug"/);
  assert.match(card, /<RepresentativeBadge \/>/);
  assert.match(card, /<button\s+type="button"\s+onClick=\{onOpen\}/);
});

test("sold-out listing primary action is truthfully disabled", () => {
  const card = buyerDiscover.slice(buyerDiscover.indexOf("function ListingGroupCard"));
  assert.match(card, /disabled=\{soldOut\}/);
  assert.match(card, /\? `\$\{formatCrop\(first\.crop\)\} ilanı tükendi`/);
  assert.doesNotMatch(card, /if \(!soldOut\) onOpen/);
});
