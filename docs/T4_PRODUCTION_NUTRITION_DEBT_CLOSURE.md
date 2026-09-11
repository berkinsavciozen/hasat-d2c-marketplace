# T4 Production Nutrition Debt Closure

Ground truth snapshot: 2026-09-10. Package verification: 2026-09-11.

## Outcome

This is a draft-only package. It does not apply a production migration, run a production
backfill, deploy an Edge Function, merge a PR, or manufacture computed/100 fields. The existing
calculate_recipe_nutrition function remains the only writer of materialized nutrition.

The read-only production inventory found 34 public/published recipes: 18 already computed/100,
11 partial and 5 NULL. The proposed resolution simulation found zero unresolved ingredient rows
across the remaining 16. A PostgreSQL 17 integration fixture containing 18 ready recipes and 16
debt recipes then passed the real engine's 34/34 computed/100 assertion.

## Ingredient-level manifest

FT = exact free-text reference/alias, MU = normalized unit or sourced household measure,
CR = missing crop reference, PD = explicit product/recipe decision, EX = explicit exclusion.

| Recipe | Before | Blockers and proposed resolution | Classes |
|---|---:|---|---|
| anasonlu-damla-sakizli-ev-yapimi-dondurma | NULL | anason dessertspoon measure; milk, sugar and salep references; mastic is audited trace-flavour exclusion | FT/MU/EX |
| ayvali-firin-tavuk-sonbahara-merhaba | NULL | medium quince, skin-on drumstick, carrot/onion/garlic/oil, honey/salt/spices/butter; tablespoon lemon corrected to 15 g lemon juice | FT/MU/PD |
| celtik-pilavi-geleneksel-ve-luks-sunum | NULL | unhulled çeltik corrected to 277.5 g dry long-grain white rice; “chicken stock or water” corrected to 500 g water; butter/salt/pepper/almond references | FT/MU/PD |
| cevizli-biber-ezmesi-muhammara | partial 98.57 | pepper paste, pomegranate molasses, breadcrumbs and salt references; exact TÜRKOMP pul-biber crop row | FT/MU/CR |
| cevizli-elmali-salata | partial 84.16 | rocket bunch, full-fat white cheese and flower honey | FT/MU/PD |
| cevizli-kurabiye | partial 80.00 | crop wheat corrected to 250 g wheat flour; butter/sugars/baking powder; ambiguous vanilla corrected to 1 tsp extract | FT/MU/PD |
| eksi-mayali-tam-bugday-ekmegi | partial 83.33 | crop wheat corrected to 300 g whole-wheat flour; starter fixed to explicit 100% hydration composite; water and salt | FT/MU/PD |
| elmali-incirli-hafif-tatli-firinda | partial 85.71 | honey, cinnamon, walnut tablespoon, butter and whole milk | FT/MU |
| elmali-serinletici-smoothie-bireysel-hidratasyon | NULL | ambiguous plant milk corrected to unsweetened refrigerated almond milk; small ice portions are measured water; lemon juice | FT/MU/PD |
| findikli-mevsim-salatasi | partial 89.13 | mixed greens corrected to 100 g rocket; avocado/cucumber/lemon juice/salt/pepper | FT/MU/PD |
| findikli-safranli-akdeniz-usulu-firin-patates | partial 5.90 | exact potato alias and oil-unit normalization; rosemary measure; unquantified salt and pepper have audited seasoning-to-taste exclusions | FT/MU/EX |
| firinda-patlican-musakka | partial 82.14 | generic mince corrected to raw 80/20 ground beef; salt and pepper | FT/MU/PD |
| glutensiz-yulafli-sebzeli-borek | NULL | rolled-oat cup, full-fat yogurt, egg, zucchini, carrot, cheese, baking-powder packet, salt/pepper and oil | FT/MU/PD |
| horeca-ya-ozel-soguk-anasonlu-limonata | partial 0.49 | four squeezed lemons corrected to 192 g lemon juice; sugar/water/mint; unquantified serving ice has audited serving-only exclusion | FT/MU/PD/EX |
| mercimek-corbasi | partial 29.58 | water is a real zero-macro reference; measured salt | FT/MU |
| taze-uzum-cevizli-yesil-salata | partial 88.06 | rocket, full-fat white cheese, pomegranate molasses and measured salt pinch | FT/MU/PD |

The source query uses IS DISTINCT FROM, because SQL NOT predicates silently omit recipes whose
source or coverage is NULL.

## Reference and coverage policy

- Every new nutrition row stores source family, source identifier, dataset/version and URL.
  Values are per 100 g edible portion. Core Turkish products use identified TÜRKOMP records;
  standard commodities use identified USDA SR Legacy or FoodData Central records.
- Exact aliases are deterministic and one-to-one. There is no fuzzy matching. Compound alternatives
  such as “plant milk” and “chicken stock or water” receive no global alias.
- Water and measured ice use a real USDA water record whose macro values are known zeros.
  They are matched rows, not ignored rows.
- Measured salt uses a real salt reference and household mass. Its known sodium is stored; missing
  micronutrients remain NULL. Only an unquantified “to taste” row may use the dedicated exclusion.
- Serving-only ice and trace mastic are excluded only through constrained, audited reason codes.
  An exclusion warning is distinct from unmatched-ingredient.
- An unresolved, unweighable row forces partial and caps coverage at 99.99. It can no longer
  disappear from both numerator and denominator and accidentally produce computed/100.
- A recipe micronutrient object is emitted only when every matched reference has all six requested
  micronutrients. Unknown values are never coalesced to zero.

## Mandatory Berkin approval gate

None of the following decisions is marked as production-approved. They remain proposed values in
the draft package. Before a committing backfill, Berkin must explicitly approve every individual
item below. The backfill refuses to run in commit mode unless the operator then supplies
`BERKIN_T4_NUTRITION_DECISIONS_APPROVED=1`; dry-run mode does not accept or imply approval.

Recipe corrections/exclusions (one guarded ingredient row per item):

| ID | Recipe / ingredient | Proposed decision |
|---|---|---|
| D01 | celtik-pilavi… / çeltik | Replace with 277.5 g dry long-grain white rice. |
| D02 | celtik-pilavi… / “tavuk suyu veya su” | Choose 500 g water, not chicken stock. |
| D03 | elmali-serinletici-smoothie… / plant milk | Choose 120 ml unsweetened refrigerated almond milk. |
| D04 | findikli-mevsim-salatasi / mixed greens | Choose 100 g rocket. |
| D05 | cevizli-kurabiye / crop wheat | Correct to 250 g all-purpose wheat flour. |
| D06 | eksi-mayali-tam-bugday-ekmegi / crop wheat | Correct to 300 g whole-wheat flour. |
| D07 | cevizli-kurabiye / vanilla | Choose 1 teaspoon vanilla extract. |
| D08 | firinda-patlican-musakka / mince | Choose 300 g raw 80/20 ground beef. |
| D09 | horeca…limonata / four squeezed lemons | Use 192 g lemon juice. |
| D10 | ayvali-firin-tavuk… / tablespoon lemon | Use 15 g lemon juice. |
| D11 | anasonlu…dondurma / mastic | Exclude as `trace_flavoring_unquantified`. |
| D12 | horeca…limonata / unquantified serving ice | Exclude as `serving_only_unquantified`. |
| D13 | findikli…firin-patates / unquantified salt | Exclude as `seasoning_to_taste_unquantified`. |
| D14 | findikli…firin-patates / unquantified pepper | Exclude as `seasoning_to_taste_unquantified`. |

Editorial portion/measure decisions (the parenthesized value is the stored reference ID):

| ID | Proposed decision |
|---|---|
| D15 | Medium quince = 200 g each (`T4-ayva-medium`). |
| D16 | Large potato = 300 g each (`T4-potato-large`). |
| D17 | Mint handful = 6 g (`T4-mint-handful`). |
| D18 | Salep level tablespoon = 8 g (`T4-salep-tablespoon`). |
| D19 | Salt pinch = 0.36 g (`T4-salt-pinch`). |
| D20 | Red pepper paste level tablespoon = 18 g (`T4-pepper-paste-tablespoon`). |
| D21 | Pomegranate molasses tablespoon = 20 g (`T4-pomegranate-molasses-tablespoon`). |
| D22 | Rocket bunch = 100 g (`T4-rocket-bunch`). |
| D23 | Baking-powder packet = 10 g (`T4-baking-powder-packet`). |
| D24 | Turkish water cup = 200 g for both `bardak` and `su_bardagi` spellings (`T4-turkish-water-cup`, `T4-turkish-water-cup-underscore`). |
| D25 | Small ice piece = 15 g (`T4-small-ice-piece`). |
| D26 | Lemon-juice dessertspoon = 10 g (`T4-dessertspoon`). |
| D27 | Cucumber = 300 g each (`T4-cucumber-each`). |
| D28 | Fresh rosemary sprig = 2 g (`T4-rosemary-sprig`). |
| D29 | Full-fat yogurt Turkish water cup = 200 g (`T4-turkish-yogurt-cup`). |

Global product-identity decisions used by exact aliases and not already covered above:

| ID | Proposed decision |
|---|---|
| D30 | Generic milk in the affected recipe means full-fat pasteurized cow's milk. |
| D31 | The specified chicken drumstick means raw meat plus skin. |
| D32 | Generic honey means flower honey. |
| D33 | Slivered almonds use the raw, unsalted almond record. |
| D34 | Generic pomegranate molasses uses the TÜRKOMP Hatay record. |
| D35 | Generic white cheese means full-fat white cheese. |
| D36 | Generic butter means salted butter. |
| D37 | Sourdough starter means a 100% hydration flour/water composite. |
| D38 | Generic yogurt means plain full-fat yogurt. |

This is the complete review-required set for this package: D01–D38. Source-record choices that
merely identify an already-specific ingredient (for example granulated sugar or raw avocado) are
source provenance, not additional product substitutions.

## Idempotency and rollback

The migration adds reference/schema/engine support only. The manual backfill:

1. verifies all 14 correction targets by recipe slug, sort order and expected old values;
2. records before/after JSON and rationale in a restricted audit table;
3. updates only rows still matching their guard;
4. recalculates all 34 public recipes through calculate_recipe_nutrition;
5. asserts exactly 34/34 computed/100 before commit.

Re-running it is safe: previously audited rows satisfy the target guard and no duplicate audit row
is inserted. The rollback restores audited fields before the new columns are removed. Schema
rollback is intentionally a separate, review-required block.

## Tests and dry run

- PostgreSQL image: public.ecr.aws/supabase/postgres:17.6.1.167.
- Real migration, manual backfill and engine result: PASS; 34/34 computed/100.
- Audit assertion: PASS; 14/14 guarded corrections captured.
- Unknown micronutrients remain SQL NULL: PASS.
- F2 exact standard-food fixture computes: PASS.
- F2 ambiguous-alternative fixture does not compute: PASS.
- F2 unknown/unweighable ingredient caps coverage at 99.99: PASS.
- Broad default function ACL fixture plus explicit function privilege assertions: PASS.
- Authenticated F7 saveDraft INSERT/UPDATE, owner RLS boundary, and controlled-column denials for
  authenticated/anon with service-role positive writes: PASS.
- Commit-mode backfill without Berkin's approval variable is rejected before `BEGIN`: PASS.
- Read-only live-data simulation: all 16 recipes, 0 unresolved ingredient rows after the proposed
  references/measures/corrections.

The production dry-run wrapper executes the same backfill and assertions with T4_ROLLBACK=1;
it must be run only after the schema migration is present and always ends with ROLLBACK.

## Edge source/live bundle verification

Immediately before this package, live ACTIVE versions were confirmed as QA v23, write v25,
revise v25, finalize v20 and publish v21. POSIX CRC32 comparison of every retrieved live bundle
file against the repository found 0 mismatches (17/17, 17/17, 22/22, 15/15 and 14/14 files).
This package changes no Edge source. No Edge deploy is required.

## Production application order (not executed)

1. Berkin explicitly approves every decision D01–D38 above.
2. Take a database backup and record the 34-recipe pre-state.
3. Apply 20260910120000_t4_production_nutrition_debt_closure.sql.
4. Run t4_production_nutrition_debt_dry_run.sql; require 34/34 and rollback confirmation.
5. Only after that approval, run the manual closure backfill without T4_ROLLBACK and with
   `BERKIN_T4_NUTRITION_DECISIONS_APPROVED=1`; require its in-transaction 34/34 assertion.
6. Re-run the read-only manifest, publish-gate fixtures and Supabase security/performance advisors.
7. Do not deploy Edge Functions unless a new byte comparison later finds drift.
