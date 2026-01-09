import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { GraphUserResolver } from "./graphUserResolver";
import { clearGraphTokenCache } from "./graphClient";

type FetchCall = { url: string; options?: any };

const calls: FetchCall[] = [];

function mockFetch(responses: Array<{ status: number; json?: any; text?: string }>) {
  let idx = 0;
  globalThis.fetch = (async (url: any, options?: any) => {
    calls.push({ url: String(url), options });
    const current = responses[idx++] ?? responses[responses.length - 1];
    return {
      ok: current.status >= 200 && current.status < 300,
      status: current.status,
      json: async () => current.json,
      text: async () => current.text ?? JSON.stringify(current.json ?? {}),
    } as any;
  }) as any;
}

beforeEach(() => {
  calls.length = 0;
  process.env.GRAPH_CLIENT_ID = "client";
  process.env.GRAPH_CLIENT_SECRET = "secret";
  process.env.GRAPH_TENANT_ID = "tenant";
  clearGraphTokenCache();
});

test("resolveByEmail returns user when exactly one match", async () => {
  mockFetch([
    { status: 200, json: { access_token: "token", expires_in: 3600 } },
    {
      status: 200,
      json: { value: [{ id: "oid-1", displayName: "Ana", mail: "ana@corp.com" }] },
    },
  ]);
  const resolver = new GraphUserResolver();
  const user = await resolver.resolveByEmail("tid", "ana@corp.com");
  assert.equal(user.userObjectId, "oid-1");
  assert.equal(user.displayName, "Ana");
  assert.equal(user.email, "ana@corp.com");
  assert.ok(calls[0].url.includes("oauth2"));
  assert.ok(calls[1].url.includes("/users?"));
});

test("resolveByEmail throws not found on empty results", async () => {
  mockFetch([
    { status: 200, json: { access_token: "token", expires_in: 3600 } },
    { status: 200, json: { value: [] } },
  ]);
  const resolver = new GraphUserResolver();
  await assert.rejects(() => resolver.resolveByEmail("tid", "none@corp.com"), {
    message: "graph_user_not_found",
  });
});

test("resolveByEmail throws ambiguous on multiple results", async () => {
  mockFetch([
    { status: 200, json: { access_token: "token", expires_in: 3600 } },
    { status: 200, json: { value: [{ id: "a" }, { id: "b" }] } },
  ]);
  const resolver = new GraphUserResolver();
  await assert.rejects(() => resolver.resolveByEmail("tid", "dup@corp.com"), {
    message: "graph_user_ambiguous",
  });
});
