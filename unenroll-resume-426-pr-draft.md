## Commit message

```
Fix #426: unenroll copy + resume progress on re-enrol

Unenroll's confirm dialog said "your progress will reset if you enrol
again", but quiz answers/notes/module_complete history were never
actually wiped on unenroll (deliberately — see EnrollmentsService.remove),
so the Grades panel kept showing prior results even after "resetting".
Re-enrolling also always started a fresh Enrollment row at module 1,
contradicting that same surviving history.

- Reword LearningScreen.jsx's unenroll confirm copy to describe what
  actually happens: course position resets, quiz/grade/note history
  is kept.
- Add ActivityService.getCompletedModuleIds(userId, moduleIds) — looks
  up which modules a user has a 'module_complete' event for.
- EnrollmentsService.create() now loads the course's modules and, if
  any were previously completed, seeds the new enrollment's
  progress/status from that count instead of always starting at 0.
  Deliberately skips badge/notification side effects (already fired
  the first time). retake() (#300) is untouched — stays an intentional
  full reset.

A genuinely first-time enrollment has no completed-module history, so
this is a no-op for it — unchanged behavior. Verified live: re-enrolling
after completing part of a course resumes at the right module with
Grades intact; a fresh course still starts at module 1.
```

## PR title

```
Fix #426: unenroll copy overpromised a reset; re-enrol now resumes progress
```

## PR description

```markdown
Fixes #426.

**Problem:** the unenroll confirm dialog said "your progress will reset if you enrol again," but that was never fully true — quiz answers, grades, and notes for a course are deliberately kept on unenroll (keyed to `(user, module/question)`, not to the enrollment row — see `EnrollmentsService.remove`'s existing comment) and resurface as-is on re-enrollment. Because of that same gap, re-enrolling always dropped the learner back at module 1 even though the Grades panel still showed every quiz they'd already taken — the two parts of the screen contradicted each other.

**Fix:**
- Reworded the unenroll confirm copy (`LearningScreen.jsx`) to say what actually happens: course position resets, but quiz answers, grades, and notes are kept.
- Added `ActivityService.getCompletedModuleIds(userId, moduleIds)`, which returns the set of modules a user has an existing `module_complete` event for — the same durable, per-module record `logModuleCompletion` already writes and that survives unenrollment.
- `EnrollmentsService.create()` now loads the course's modules and, when any were previously completed, seeds the new enrollment's `progress`/`status` from that history instead of always starting at 0/`in-progress`. Deliberately skips badge/notification logic here — those already fired the first time this learner completed (parts of) the course, and re-firing them on a resumed enrollment would be wrong.

**Scope:** `EnrollmentsService.retake()` (#300, the Dashboard's "Retake" button) is untouched — that's an intentional full reset with its own confirm copy already saying so. Checked the one other caller of `create()` (learning-path cascade enrollment) — it just inherits the same correct behavior, no conflict.

**Verification:** shell/tsc unavailable in my environment, so this was structurally reviewed rather than compiled. Confirmed working live: enrol → complete some modules/a quiz → unenrol → re-enrol resumes at the right module with Grades intact; a genuinely first-time enrollment (no completion history) still starts at module 1.
```
