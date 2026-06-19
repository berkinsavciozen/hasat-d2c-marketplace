import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/farmer/journal")({
  component: () => <Outlet />,
});
