import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /admin/recipes/* — the job list lives in admin.recipes.index.tsx,
// the job detail in admin.recipes.$jobId.tsx. Must render <Outlet /> so children mount.
export const Route = createFileRoute("/admin/recipes")({
  component: () => <Outlet />,
});

// Session-only (never persisted to localStorage, never put in a URL) — shared with
// admin.recipes.$jobId.tsx purely so navigating list -> detail doesn't force re-entering the key
// on every click. Cleared when the tab closes, same lifetime admin.kpi.tsx's in-memory key has.
export const ADMIN_RECIPE_KEY_STORAGE = "f2_admin_recipe_key";
