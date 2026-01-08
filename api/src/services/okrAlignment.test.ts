import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAlignmentRules } from "./okrAlignment";

test("validateAlignmentRules blocks self-link", () => {
  const err = validateAlignmentRules("a", "a", false);
  assert.equal(err, "self_link");
});

test("validateAlignmentRules blocks direct cycle", () => {
  const err = validateAlignmentRules("parent", "child", true);
  assert.equal(err, "cycle_detected");
});

test("validateAlignmentRules allows valid link", () => {
  const err = validateAlignmentRules("parent", "child", false);
  assert.equal(err, null);
});
