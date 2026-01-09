import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOwnerMember, canRemoveOwner } from "./okrMembers";

test("buildOwnerMember assigns owner role for creator", () => {
  const member = buildOwnerMember({
    tenantId: "tenant",
    okrId: "okr",
    userObjectId: "user",
  });
  assert.equal(member.role, "owner");
  assert.equal(member.createdBy, "user");
});

test("canRemoveOwner blocks last owner removal", () => {
  assert.equal(canRemoveOwner(1, "owner"), false);
  assert.equal(canRemoveOwner(2, "owner"), true);
  assert.equal(canRemoveOwner(1, "editor"), true);
});
