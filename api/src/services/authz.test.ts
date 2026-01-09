import assert from "node:assert/strict";
import { test } from "node:test";
import { canDelete, canEdit, canManageMembers, canView } from "./authz";

test("canView allows tenant_open regardless of membership", () => {
  assert.equal(canView(null, "tenant_open"), true);
});

test("canView requires membership in members_only", () => {
  assert.equal(canView(null, "members_only"), false);
});

test("canEdit allows owner and editor", () => {
  assert.equal(canEdit("owner"), true);
  assert.equal(canEdit("editor"), true);
  assert.equal(canEdit("viewer"), false);
});

test("canDelete only allows owner", () => {
  assert.equal(canDelete("owner"), true);
  assert.equal(canDelete("editor"), false);
});

test("canManageMembers only allows owner", () => {
  assert.equal(canManageMembers("owner"), true);
  assert.equal(canManageMembers("editor"), false);
});
