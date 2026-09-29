// deno test --allow-env --allow-read supabase/functions/whatsapp-ai-webhook/index.test.ts
import assert from "node:assert/strict";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("whatsapp-ai-webhook: stub has no imports, secrets, DB/AI/Twilio calls", () => {
  const code = SOURCE.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /\bimport\b/);
  assert.doesNotMatch(code, /\bfetch\s*\(/);
  assert.doesNotMatch(code, /createClient|Deno\.env|supabase|twilio|LOVABLE/i);
});

Deno.test("whatsapp-ai-webhook: every method and body gets 410 decommissioned, no side effects", async () => {
  let handler: ((req: Request) => Response | Promise<Response>) | undefined;
  const originalServe = Deno.serve;
  const originalFetch = globalThis.fetch;
  const originalEnvGet = Deno.env.get;
  let fetches = 0;
  let envReads = 0;
  globalThis.fetch = () => {
    fetches++;
    return Promise.reject(new Error("fetch must not be called"));
  };
  Deno.env.get = (key: string) => {
    envReads++;
    return originalEnvGet.call(Deno.env, key);
  };
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = (h: (req: Request) => Response) => {
    handler = h;
    return { finished: Promise.resolve(), shutdown: async () => {} };
  };
  try {
    await import("./index.ts");
    assert.ok(handler, "Deno.serve was called with a handler");
    const twilioForm = new URLSearchParams({
      From: "whatsapp:+905001112233",
      Body: "Tarlamdaki domatesler ne durumda?",
    });
    const cases: Array<[string, BodyInit | undefined, Record<string, string>]> = [
      ["POST", twilioForm, { "content-type": "application/x-www-form-urlencoded" }],
      ["POST", JSON.stringify({ any: "json" }), { "content-type": "application/json" }],
      ["POST", "garbage", { "x-twilio-signature": "forged" }],
      ["GET", undefined, {}],
      ["PUT", "x", {}],
      ["DELETE", undefined, {}],
      ["OPTIONS", undefined, {}],
    ];
    for (const [method, body, headers] of cases) {
      const res = await handler!(
        new Request("https://example.test/functions/v1/whatsapp-ai-webhook", { method, body, headers }),
      );
      assert.equal(res.status, 410, method);
      assert.deepEqual(await res.json(), { status: "decommissioned" });
    }
    assert.equal(fetches, 0);
    assert.equal(envReads, 0);
  } finally {
    Deno.serve = originalServe;
    globalThis.fetch = originalFetch;
    Deno.env.get = originalEnvGet;
  }
});
