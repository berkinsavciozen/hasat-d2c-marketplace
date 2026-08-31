import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout route for /admin/recipes/plan/* — the batch list lives in admin.recipes.plan.index.tsx,
// the batch detail/review in admin.recipes.plan.$batchId.tsx. Must render <Outlet /> so children
// mount. Same pattern as admin.recipes.tsx.
export const Route = createFileRoute("/admin/recipes/plan")({
  component: () => <Outlet />,
});
