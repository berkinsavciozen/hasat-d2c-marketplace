# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
is a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` (dynamic — bare `$`, no curly braces) |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment) |
| `files/$.tsx` | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx` | layout route (renders children via `<Outlet />`) |
| `__root.tsx` | app shell — wraps every page; preserve `<Outlet />` |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Protected account routes

Buyer and farmer parent `beforeLoad` guards verify the current Auth user and read
`profiles.id, role, deleted_at` on every access check. Only a matching role and an
explicitly null `deleted_at` authorize access. Auth bootstrap uses the same active
profile predicate before hydrating Zustand. Never infer deletion solely from the
anonymized name or a retained Auth user/profile row. The public buyer producer
profile exception stays public.

Deploy the B-9 schema migration before these clients. See the
[B-9 contract, local tests and production acceptance matrix](../../supabase/tests/b9_profile_deleted_at/README.md)
for the mobile contract and separate legacy remediation requirement.
