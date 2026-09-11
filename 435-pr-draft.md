## Commit message

```
Fix #435: establish frontend test coverage (first wave)

Vitest was scaffolded in #431 but there was effectively no real coverage
yet (one parity test, plus userDisplay.js's own tests from that same
PR). Scoped as a first wave per the issue: extraction + highest-risk
flows first, not an unbounded "test everything" pass.

- Extract LearningScreen.jsx's inline course-grade calc into
  lib/courseGrade.js (mirrors backend's computeCourseGrade) + 9-case
  unit test suite
- AuthModal + ResetPasswordModal: login/signup/forgot-password tabs,
  validation, Google OAuth trigger, Supabase error surfacing
- LearningScreen: quiz completion gate (#205), quiz retake (#239),
  unenroll confirm (#426)
- DashboardScreen: retake confirm flow (#300/#301)
- GoalOnboardingModal + RoleOnboardingModal: selection, skip, and
  reject-then-retry behavior
- useFocusTrap: initial focus, Tab/Shift+Tab wrap, focus restore on
  close (works around jsdom's lack of layout via a stubbed
  offsetParent, scoped to that one test file)
- AuthContext: session/user state, PASSWORD_RECOVERY handling,
  unsubscribe on unmount

Verified: 62/62 tests pass (npm run test), build succeeds (npm run
build) with no new warnings beyond #431's pre-existing chunk-size note.
```

## PR title

```
Fix #435: establish frontend test coverage (first wave)
```

## PR description

```markdown
Fixes #435.

**What:** first real pass at frontend test coverage now that Vitest is set up (#431). Scoped deliberately — extraction + highest-risk flows, not an attempt to cover all ~30 screens/components at once (full `App.jsx` integration tests and visual regression are explicitly out of scope for this wave, per the issue).

**What changed:**
- `src/lib/courseGrade.js` — extracted `LearningScreen.jsx`'s inline course-grade calculation into a standalone, directly-testable function (mirrors backend's `computeCourseGrade` in `enrollments.service.ts`). `LearningScreen.jsx` now imports and calls it instead of duplicating the logic inline. 9-case unit test suite in `courseGrade.test.js`.
- `AuthModal.test.jsx` / `ResetPasswordModal.test.jsx` — login/signup/forgot-password tabs, field validation, Google OAuth trigger, Supabase error message surfacing. Supabase client is mocked at the module level.
- `LearningScreen.test.jsx` — the #205 quiz-completion gate (Mark Complete disabled until the module's quiz is taken, unlocks after submitting), the #239 retake flow (read-only summary → explicit retake → blank form again), and the #426 unenroll confirm dialog (confirm calls `onUnenrol` + `onBack`, cancel doesn't).
- `DashboardScreen.retake.test.jsx` — the #300/#301 retake confirm flow (confirm/cancel/error-surfacing).
- `GoalOnboardingModal.test.jsx` / `RoleOnboardingModal.test.jsx` — selection calls the right callback with the right value, skip behavior (Goal only — Role intentionally has none), and re-enabling selection if the save rejects.
- `useFocusTrap.test.jsx` — initial focus on activation, Tab/Shift+Tab cycling at the boundaries, and focus restoration to the trigger element on close. jsdom doesn't run a layout engine, so `offsetParent` is always null by default; this test stubs it (scoped to this one file only) since the hook's own visibility filter depends on it.
- `AuthContext.test.jsx` — initial session/user resolution, updates on auth state change events, `PASSWORD_RECOVERY` handling + `clearPasswordRecovery`, and unsubscribing on unmount.

**Verification:** `npm run test` — 62/62 passing across 11 test files. `npm run build` succeeds with no new warnings.

**Not done as part of this PR** (per the issue's explicit scope): full `App.jsx` integration tests (mocking every `fetch` call) and visual/pixel regression testing — both real gaps, left for a follow-up once this first wave is in.
```
