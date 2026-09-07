import assert from "node:assert/strict";
import test from "node:test";
import { completeAccountDeletion } from "./accountDeletion.ts";

test("successful deletion signs out, clears client state, and redirects", async () => {
  const calls: string[] = [];

  await completeAccountDeletion({
    deleteAccount: async () => {
      calls.push("delete");
    },
    signOutLocally: async () => {
      calls.push("sign-out");
    },
    clearClientState: () => {
      calls.push("clear");
    },
    redirectToStart: () => {
      calls.push("redirect");
    },
  });

  assert.deepEqual(calls, ["delete", "sign-out", "clear", "redirect"]);
});

test("successful deletion still clears state when local sign-out rejects", async () => {
  const calls: string[] = [];

  await completeAccountDeletion({
    deleteAccount: async () => {
      calls.push("delete");
    },
    signOutLocally: async () => {
      calls.push("sign-out");
      throw new Error("session already invalid");
    },
    clearClientState: () => {
      calls.push("clear");
    },
    redirectToStart: () => {
      calls.push("redirect");
    },
  });

  assert.deepEqual(calls, ["delete", "sign-out", "clear", "redirect"]);
});

test("failed deletion preserves the existing session and does not redirect", async () => {
  const calls: string[] = [];

  await assert.rejects(
    completeAccountDeletion({
      deleteAccount: async () => {
        throw new Error("active orders prevent deletion");
      },
      signOutLocally: async () => {
        calls.push("sign-out");
      },
      clearClientState: () => {
        calls.push("clear");
      },
      redirectToStart: () => {
        calls.push("redirect");
      },
    }),
    /active orders prevent deletion/,
  );

  assert.deepEqual(calls, []);
});

for (const role of ["buyer", "farmer"]) {
  test(`${role}: deletion preserves local sign-out → Zustand → React Query → hard redirect order`, async () => {
    const calls: string[] = [];
    await completeAccountDeletion({
      deleteAccount: async () => {
        calls.push("rpc-committed");
      },
      signOutLocally: async () => {
        calls.push("local-sign-out");
      },
      clearClientState: () => {
        calls.push("zustand-reset");
        calls.push("query-clear");
      },
      redirectToStart: () => {
        calls.push("hard-redirect");
      },
    });
    assert.deepEqual(calls, [
      "rpc-committed",
      "local-sign-out",
      "zustand-reset",
      "query-clear",
      "hard-redirect",
    ]);
  });
}
