import assert from "node:assert/strict";
import { test } from "node:test";
import { safeParseJson } from "./aiClient";
import { ruleValidateKr, ruleValidateOkr } from "./aiOkr";

test("safeParseJson parses fenced json", () => {
  const raw = "```json\n{\"a\":1}\n```";
  const parsed = safeParseJson<{ a: number }>(raw);
  assert.equal(parsed?.a, 1);
});

test("safeParseJson returns null on invalid", () => {
  const parsed = safeParseJson<{ a: number }>("not json");
  assert.equal(parsed, null);
});

test("ruleValidateKr requires targetValue", () => {
  const result = ruleValidateKr({ title: "Ventas", targetValue: null });
  assert.ok(result.issues.some((i) => i.code === "kr_target_missing"));
});

test("ruleValidateOkr flags missing KRs", () => {
  const result = ruleValidateOkr({
    objective: "Mejorar retencion",
    fromDate: "2026-01-01",
    toDate: "2026-02-01",
    krs: [],
  });
  assert.ok(result.issues.some((i) => i.code === "krs_missing"));
});
