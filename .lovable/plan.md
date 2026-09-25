# Capability check: publish historical commit 9f3730b with VITE_UX1F_PRIVATE_RECIPE_SHARE=false

## Conclusion: Unsupported

Lovable does not support selecting an arbitrary historical Git commit for build/publish, and does not support per-build environment variable overrides.

## Why

1. **No commit picker for publish.** The Publish flow always deploys the current saved project state (latest commit on the connected branch). There is no UI or API to point a deployment at a specific historical SHA like `9f3730bd5d5098808bee87ffe95c7482b17ec314`.

2. **No per-build env override.** `VITE_UX1F_PRIVATE_RECIPE_SHARE` is a build-time variable read from the project `.env` at build time. Lovable env vars are project-level settings, not per-deployment inputs. Changing the value means editing `.env` — which is itself a new commit on top of current main, not a one-build override.

3. **History restore is not a free checkout.** Lovable's "restore to this version" rewrites the project state to that version (a revert-style operation), which the request explicitly forbids ("do not revert history", "current main must not be modified").

## What would be possible (for reference, not requested)

- Revert/restore the project to that commit (changes project state — excluded by the constraints).
- Via the GitHub integration: create a separate branch at that SHA, flip the env var there, and build outside Lovable (e.g. CI), self-hosting the output. This is outside Lovable's publish pipeline.

## Action

None. No code, commit, publish, deploy, or setting change will be made. This is a read-only capability answer.
