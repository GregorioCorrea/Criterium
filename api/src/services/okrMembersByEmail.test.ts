import assert from "node:assert/strict";
import { test } from "node:test";
import { addMemberByEmail } from "./okrMembersByEmail";
import { ResolvedUser, UserResolver } from "./userResolver";

class FakeResolver implements UserResolver {
  constructor(private result: ResolvedUser | null, private error?: string) {}
  async resolveByEmail(): Promise<ResolvedUser> {
    if (this.error) {
      throw new Error(this.error);
    }
    if (!this.result) {
      throw new Error("graph_user_not_found");
    }
    return this.result;
  }
}

test("addMemberByEmail returns 403 when actor is not owner", async () => {
  const result = await addMemberByEmail(
    {
      tenantId: "t",
      okrId: "o",
      actorRole: "editor",
      actorUserId: "u",
      email: "a@b.com",
      role: "viewer",
    },
    {
      resolver: new FakeResolver({ userObjectId: "x", displayName: null, email: "a@b.com" }),
      addMember: async () => "created",
    }
  );
  assert.equal(result.status, 403);
});

test("addMemberByEmail returns 404 when user not found", async () => {
  const result = await addMemberByEmail(
    {
      tenantId: "t",
      okrId: "o",
      actorRole: "owner",
      actorUserId: "u",
      email: "a@b.com",
      role: "viewer",
    },
    {
      resolver: new FakeResolver(null),
      addMember: async () => "created",
    }
  );
  assert.equal(result.status, 404);
  assert.equal(result.body.error, "user_not_found");
});
