import assert from "node:assert/strict";
import { test } from "node:test";
import { computeKrInsights, computeOkrInsights } from "./index";

test("computeKrInsights: no target", () => {
  const result = computeKrInsights({ targetValue: null, currentValue: null }, []);
  assert.equal(result.explanationShort, "Sin target definido");
  assert.equal(result.risk, "high");
});

test("computeKrInsights: no checkins", () => {
  const result = computeKrInsights({ targetValue: 100, currentValue: 0 }, []);
  assert.equal(result.explanationShort, "Sin check-ins");
  assert.equal(result.risk, "high");
});

test("computeKrInsights: off track", () => {
  const result = computeKrInsights({ targetValue: 100, currentValue: 30 }, [{ value: 30 }]);
  assert.equal(result.explanationShort, "Fuera de rumbo");
  assert.equal(result.risk, "high");
});

test("computeKrInsights: at risk", () => {
  const result = computeKrInsights({ targetValue: 100, currentValue: 50 }, [{ value: 50 }]);
  assert.equal(result.explanationShort, "En riesgo");
  assert.equal(result.risk, "medium");
});

test("computeKrInsights: on track", () => {
  const result = computeKrInsights({ targetValue: 100, currentValue: 80 }, [{ value: 80 }]);
  assert.equal(result.explanationShort, "En rumbo");
  assert.equal(result.risk, "low");
});

test("computeOkrInsights: no KRs", () => {
  const result = computeOkrInsights([], []);
  assert.equal(result.explanationShort, "Sin KRs");
});

test("computeOkrInsights: high risk dominates", () => {
  const result = computeOkrInsights(
    [{ id: "a" }, { id: "b" }],
    [
      { krId: "a", risk: "high" },
      { krId: "b", risk: "low" },
    ]
  );
  assert.equal(result.explanationShort, "OKR en riesgo por KR criticos");
});

test("computeOkrInsights: majority medium", () => {
  const result = computeOkrInsights(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { krId: "a", risk: "medium" },
      { krId: "b", risk: "medium" },
      { krId: "c", risk: "low" },
    ]
  );
  assert.equal(result.explanationShort, "OKR en riesgo");
});

test("computeOkrInsights: majority low", () => {
  const result = computeOkrInsights(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    [
      { krId: "a", risk: "low" },
      { krId: "b", risk: "low" },
      { krId: "c", risk: "medium" },
    ]
  );
  assert.equal(result.explanationShort, "OKR en rumbo");
});
