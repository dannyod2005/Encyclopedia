import { describe, it, expect } from "vitest";
import { computeCourseGradePct } from "./courseGrade";

// #435 — mirrors backend's enrollments.service.spec.ts computeCourseGrade
// test suite (same shape, same cases), since this is the frontend half of
// an intentionally-duplicated calculation (#240/#254). A silent bug here
// means a learner sees a course grade on LearningScreen that doesn't
// match what the backend used to decide their certificate tier.
function moduleResult(overrides) {
  return {
    moduleId: "m1",
    hasQuiz: true,
    taken: true,
    score: 0,
    total: 1,
    ...overrides,
  };
}

describe("computeCourseGradePct", () => {
  it("returns null when there are no modules at all", () => {
    expect(computeCourseGradePct([])).toBeNull();
  });

  it("returns null when given undefined/null", () => {
    expect(computeCourseGradePct(undefined)).toBeNull();
    expect(computeCourseGradePct(null)).toBeNull();
  });

  it("returns null when no module has a quiz", () => {
    const results = [
      moduleResult({ hasQuiz: false, taken: false, score: null, total: 0 }),
      moduleResult({ hasQuiz: false, taken: false, score: null, total: 0 }),
    ];

    expect(computeCourseGradePct(results)).toBeNull();
  });

  it("excludes a module whose quiz exists but was never taken", () => {
    const results = [
      moduleResult({ hasQuiz: true, taken: false, score: null, total: 5 }),
    ];

    expect(computeCourseGradePct(results)).toBeNull();
  });

  it("computes 70% correctly", () => {
    const results = [moduleResult({ score: 7, total: 10 })];

    expect(computeCourseGradePct(results)).toBe(70);
  });

  it("computes just below a round number correctly", () => {
    const results = [moduleResult({ score: 68, total: 100 })];

    expect(computeCourseGradePct(results)).toBe(68);
  });

  it("pools score/total across modules rather than averaging each module's percentage", () => {
    // Module A: 1/1 (100%). Module B: 1/9 (~11%). A naive average of the
    // two percentages would be 55.5%; pooling raw counts first —
    // (1+1)/(1+9) = 20% — is the intended calculation.
    const results = [
      moduleResult({ moduleId: "a", score: 1, total: 1 }),
      moduleResult({ moduleId: "b", score: 1, total: 9 }),
    ];

    expect(computeCourseGradePct(results)).toBe(20);
  });

  it("rounds a fractional percentage to the nearest whole number", () => {
    // 2/3 = 66.66...% -> rounds up to 67.
    const results = [moduleResult({ score: 2, total: 3 })];

    expect(computeCourseGradePct(results)).toBe(67);
  });

  it("only pools taken-and-quizzed modules, ignoring untaken and quiz-less ones mixed in", () => {
    const results = [
      moduleResult({ moduleId: "a", score: 9, total: 10 }), // counted: 90%
      moduleResult({
        moduleId: "b",
        hasQuiz: false,
        taken: false,
        score: null,
        total: 0,
      }), // ignored
      moduleResult({ moduleId: "c", hasQuiz: true, taken: false, score: null, total: 4 }), // ignored (not taken)
    ];

    expect(computeCourseGradePct(results)).toBe(90);
  });
});
