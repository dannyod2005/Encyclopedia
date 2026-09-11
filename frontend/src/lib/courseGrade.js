// #435 — extracted from LearningScreen.jsx's render body so the grade
// calculation has direct unit-test coverage (see courseGrade.test.js)
// instead of only being reachable by rendering the whole screen.
//
// #240 — continuous course grade: summed correct answers over summed
// question counts, across every taken-and-quizzed module. This is
// mathematically identical to CourseAnalyticsService's per-learner
// quizAverageScorePct (which pools every raw QuizSubmission's isCorrect
// across the course) rather than a divergent calculation — a "taken"
// module always has a graded answer for every one of its questions
// (submitQuiz requires a complete set, no partial submissions), so
// summing score/total per module and summing every submission directly
// land on the same number. Null (not a 0%) when no quizzed module has
// been taken yet, so the UI can show "—" instead of a misleadingly bad
// grade before any quiz exists to grade.
//
// This intentionally mirrors backend's computeCourseGrade in
// enrollments.service.ts (same filter/reduce shape), just returning the
// bare percentage rather than a { courseGradePct, passed } pair — the
// frontend already has PASS_THRESHOLD_PCT in scope in LearningScreen.jsx
// wherever this is used, so there's no need to duplicate the pass/fail
// comparison here too.
export function computeCourseGradePct(quizResultsOverview) {
  const gradedModules = (quizResultsOverview ?? []).filter(
    (r) => r.hasQuiz && r.taken,
  );

  if (gradedModules.length === 0) return null;

  return Math.round(
    (gradedModules.reduce((sum, r) => sum + (r.score ?? 0), 0) /
      gradedModules.reduce((sum, r) => sum + r.total, 0)) *
      100,
  );
}
