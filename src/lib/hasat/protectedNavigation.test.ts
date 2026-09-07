import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { checkProtectedProfile } from "./protectedRouteAccess.ts";

for (const role of ["buyer", "farmer"] as const) {
  for (const entry of ["refresh", "direct deep-link", "back-button"]) {
    test(`${role}: router refuses ${entry} with a retained deleted profile`, async () => {
      let cleanups = 0;
      let protectedLoads = 0;
      let redirectTarget: string | undefined;
      const path = `/${role}/orders`;
      const history = createMemoryHistory({
        initialEntries: entry === "back-button" ? [path, "/"] : [path],
      });
      const root = createRootRoute();
      const start = createRoute({ getParentRoute: () => root, path: "/" });
      const protectedParent = createRoute({
        getParentRoute: () => root,
        path: role,
        beforeLoad: async () => {
          const allowed = await checkProtectedProfile(role, {
            getUserId: async () => "retained-user",
            readProfile: async () => ({
              id: "retained-user",
              role,
              deleted_at: "2026-09-07T00:00:00Z",
            }),
            clearInvalidSession: async () => {
              cleanups++;
            },
          });
          if (!allowed) {
            const response = redirect({ to: "/" });
            redirectTarget = response.options.to;
            throw response;
          }
        },
      });
      const child = createRoute({
        getParentRoute: () => protectedParent,
        path: "orders",
        loader: () => {
          protectedLoads++;
        },
      });
      const router = createRouter({
        routeTree: root.addChildren([start, protectedParent.addChildren([child])]),
        history,
        isServer: true,
      });
      if (entry === "back-button") history.back();
      await router.load();
      assert.ok(cleanups > 0);
      assert.equal(protectedLoads, 0);
      assert.equal(redirectTarget, "/");
    });
  }
}

test("router harness control runs an unguarded child loader", async () => {
  let loads = 0;
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "buyer/orders",
    loader: () => {
      loads++;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/buyer/orders"] }),
    isServer: true,
  });
  await router.load();
  assert.equal(loads, 1);
});
