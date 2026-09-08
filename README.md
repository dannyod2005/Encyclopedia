# Encyclopedia

Clickable LMS prototype — React (CRA) frontend, NestJS/TypeORM backend, Supabase (Postgres + Auth), deployed on Vercel (frontend) and GCP Cloud Run (backend).

This README doubles as the feature clarification document required by [#45](https://github.com/dannyod2005/Keystone/issues/45): every item from the brief (*LMS Prototype – Feature Clarification Approach*), mapped to its actual build status, for team review before L2.

## Status legend

- **Done** — built and working as described in the brief.
- **Partial** — built, but narrower than the brief implies; see the note.
- **Deferred** — not built, on purpose.

## Prototype modules

### Homepage

| Brief item | Status | Notes |
|---|---|---|
| Logo | Partial | A placeholder Encyclopedia "arch" mark (inline SVG) stands in for a real logo — deferred per instruction, not an oversight. |
| Login | Done | "Log in" / "Join for free" in the top nav open the auth modal. |
| Header Banner | Done | Hero section under the nav (headline, CTA, key stats). |
| Search | Partial | Fully working (title/provider search with debounce-free live filtering), but it lives on the Course Catalogue page, not the Homepage itself. |
| Course Overview | Done | "Popular this month" course cards on the Homepage. |
| Learners' Feedback | Done | "What learners say" testimonials section. |

### Learner Login

| Brief item | Status | Notes |
|---|---|---|
| Login Screen | Done | Combined login/create-account modal: role selection (learner/trainer), client-side validation, real Supabase Auth accounts, email-confirmation flow. Two things on this screen are explicitly not wired up: "Continue with Google" is disabled ("coming soon" — OAuth needs a redirect flow this modal doesn't support yet), and "Forgot password?" is a static link with no handler behind it yet. |

### Course Catalogue

| Brief item | Status | Notes |
|---|---|---|
| Enrol | Done | Enrol button (with loading state), "Already enrolled" state, hands off to the dashboard. |
| Basic Information | Done | Title, provider, category, level, hours, rating. |
| Course Summary | Done | Blurb. |
| Course Agenda | Done | Module list. |
| References & Credits | Done | "Sources & credits" list. |
| FAQ | Done | Per-course FAQ list. |

### Learner Dashboard

| Brief item | Status | Notes |
|---|---|---|
| Learning Progress | Done | In-progress / completed / certificate counts, per-course progress bars, not-started / continuing / completed groupings. |
| Calendar | Partial | Shows the current week only — the month label and prev/next arrows are rendered but disabled (no click handler), so there's no actual navigation. |
| Daily Goals | Partial | Streak and "N of 7 days hit" tracking work end-to-end. The goal itself is a fixed 30-minute constant on the backend (`DAILY_GOAL_MIN`), not learner-configurable — a `daily_goal_min` column already exists on the profile table for this but isn't read anywhere yet. |
| Learning Statistics | Done | Weekly minutes logged, enrolled course count. (Kept deliberately unlabeled as a weekly claim after [#123](https://github.com/dannyod2005/Keystone/issues/123).) |

### Learning Page

| Brief item | Status | Notes |
|---|---|---|
| Module List | Done | Sidebar list, click to jump between modules. |
| Video | Done | YouTube embed via iframe; falls back to a placeholder if a module has no video URL. |
| Notes | Done | Per-module, private, autosaves on blur. |
| Grades | Done | Per-module quiz score panel, stays in sync after a submission without a page reload. |
| Quiz | Done | MCQ and short-answer, auto-graded, one attempt per learner per quiz (no retakes). See deviation note below — this expanded past MCQ-only after the brief/issue #45 was written. |

Forum (discussion) is also live on the Learning Page — not one of the five bullets listed for this module in the brief, but it's the concrete implementation of engagement item (e) below.

## Deliverables (per brief)

| Deliverable | Status | Notes |
|---|---|---|
| Interactive prototype | Done | This application. |
| UI/UX mockups | — | Produced outside this repo. |
| Feature clarification document | Done | This document. |
| Approved feature list | Pending | Awaiting team sign-off on this document. |

## Overarching requirements (a–f)

| # | Requirement | Status | Notes |
|---|---|---|---|
| a | User login and learner onboarding | Partial | Login is fully done. "Onboarding" is limited to the signup form itself (name + learner/trainer role) — there's no separate welcome flow or tour after account creation. |
| b | Course management and enrolment functionality | Done | Trainer Studio: create/edit/delete courses, modules, videos, and quizzes; ownership scoped to the trainer or their provider team. Enrolment via the catalogue. |
| c | Learning modules with YouTube embeds, notes, progress tracking, completion | Done | |
| d | Assessment (quizzes and grading), completion tracking, digital certificate generation | Done | Certificates are real generated PDFs, gated to completed courses. |
| e | Learner engagement features (discussion forums, FAQs) | Done | Threaded forum per module (post/reply/edit); FAQ per course. |
| f | Learner dashboard (progress, reporting, analytics) | Done | With the Calendar/Daily Goals caveats noted above — progress and weekly stats are real, but the "analytics" surface is a single weekly card, not a dedicated reporting view. |

## Agreed deviations — explicit call-outs

So none of these read as oversights:

- **Logo deferred per instruction** — placeholder mark in place of a designed logo.
- **Quiz is MCQ + short-answer (auto-graded), single attempt** — the brief/issue #45 was written when quizzes were MCQ-only by agreement; short-answer support (auto-graded against a list of acceptable answers) was added afterward under [#40](https://github.com/dannyod2005/Keystone/issues/40). The single-attempt rule (no retakes once submitted) carried over unchanged.
- **Google sign-in disabled** — button present, explicitly disabled, needs an OAuth redirect flow not yet built.
- **"Forgot password?" not wired** — link is present on the login screen but currently does nothing.
- **Homepage search deferred to Catalogue** — search is fully functional, just not present on the Homepage itself.
- **Daily goal is a fixed platform constant, not per-learner** — tracking works; the "set your own goal" part doesn't yet, despite the DB already having a column for it.
- **Dashboard calendar is current-week-only** — month navigation controls are visible but inert.

---

*Generated for [#45](https://github.com/dannyod2005/Keystone/issues/45) — please flag anything above that reads wrong before this goes to L2.*
