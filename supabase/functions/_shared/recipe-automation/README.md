# Recipe Automation — canonical contracts

Zod schemas (`schemas.ts`) and their inferred TypeScript types (`types.ts`) for every payload
that crosses a stage boundary in the F2 Recipe Automation pipeline. See
`docs/recipe-automation/00-repo-audit-decision-log.md` and
`docs/recipe-automation/01-runtime-feasibility-spikes.md` for the live-schema evidence and
runtime findings these contracts are built against.

No agents, migrations, or edge functions are implemented here — this is the shared validation
layer later stages (planning, drafting, QA, safety review, image generation, publish) import.

## Running the tests

This repo has no existing Edge Function test convention (see decision log §5), so this module
uses Deno's built-in test runner directly:

```sh
deno test --allow-net supabase/functions/_shared/recipe-automation/schemas.test.ts
```

`--allow-net` is required only to fetch the `npm:zod@3.23.8` dependency on first run (cached
afterwards); no network calls happen inside the tests themselves. The suite uses Deno's built-in
`node:assert` instead of `jsr:@std/assert` / `deno.land/std` so it has no dependency on hosts an
egress policy might block.
