# Encyclopedia — LMS Handover Guide

Encyclopedia is a full-stack Learning Management System: a React (Vite) frontend, a NestJS/TypeORM backend, and Supabase (Postgres + Auth) as the data/identity layer. Frontend deploys to Vercel, backend deploys to GCP Cloud Run.

This document replaces the three previous `README.md` files in this repo (root, `frontend/`, `backend/`) with a single handover guide: what the product does, how it's built, how to run it, and where things live in the code.

## Contents

- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Commands](#commands)
- [Architecture](#architecture)
- [Database](#database)
- [Demo data / seeding](#demo-data--seeding)
- [Features](#features)
- [Backend module map](#backend-module-map)
- [Frontend structure](#frontend-structure)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router 7, Tailwind CSS, Vitest + Testing Library |
| Backend | NestJS 11, TypeORM, class-validator/class-transformer, Jest |
| Database | Postgres via Supabase |
| Auth | Supabase Auth (email/password + Google OAuth), verified backend-side via JWKS (`jose`) |
| Other backend libs | `pdf-lib` (certificate generation), `@nestjs/throttler` (rate limiting), YouTube Data API v3 (optional, module time estimation) |
| Hosting | Vercel (frontend), GCP Cloud Run (backend) |

## Repository layout

```
encyclopedia/
├── README.md              ← this file
├── frontend/               React app (Vite)
│   ├── src/
│   │   ├── screens/         one file per route-level page (+ trainer/ subfolder)
│   │   ├── components/      layout/, modals/, common/ (shared primitives)
│   │   ├── context/         AuthContext
│   │   ├── hooks/           useFocusTrap, etc.
│   │   ├── lib/             supabaseClient, courseGrade calc, userDisplay helpers
│   │   ├── data/             static content not backed by the API (e.g. homepage testimonials)
│   │   └── App.jsx          routes, all API-calling handlers, most app state
│   ├── vercel.json          SPA rewrite + asset cache headers
│   └── .env.example
└── backend/                 NestJS app
    ├── src/
    │   ├── <feature>/        one folder per domain module (see Backend module map)
    │   ├── auth/              SupabaseAuthGuard, RequireTrainerGuard
    │   ├── seeds/             demo-data seed scripts
    │   ├── scripts/           wipe-test-data.ts
    │   ├── migrations/        TypeORM migrations (source of truth for schema)
    │   ├── data-source.ts     TypeORM DataSource (used by CLI/migrations/seeds)
    │   ├── app.module.ts      wires every feature module + global guards
    │   └── main.ts            bootstrap, CORS, validation pipe
    └── .env.example
```

## Getting started

You need a Supabase project (Postgres + Auth) and Node.js installed. Both apps read config from a `.env` file in their own directory — copy each `.env.example` and fill in real values.

**backend/.env**

```
DATABASE_URL=postgres://user:password@host:port/dbname
FRONTEND_URL=http://localhost:3000
DEPLOYED_FRONTEND_URL=https://your-vercel-domain.app
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional — powers GET /courses/video-duration (module time estimate from a
# YouTube video's real length). Without it that endpoint just reports the
# video as unsupported and the trainer enters module time manually.
YOUTUBE_API_KEY=your-youtube-data-api-v3-key
```

`FRONTEND_URL`/`DEPLOYED_FRONTEND_URL` accept comma-separated origins (handy for allowing both localhost and a Vercel preview URL through CORS at once).

**frontend/.env**

```
VITE_APP_API_URL=http://localhost:4000
VITE_APP_SUPABASE_URL=https://[project-ref].supabase.co
VITE_APP_SUPABASE_ANON_KEY=your-anon-key
```

**First-time setup**

```bash
cd backend && npm install && npm run migration:run
cd ../frontend && npm install
```

Then start both apps (see [Commands](#commands)) — backend on port 4000 by default, frontend on port 3000.

## Commands

### Frontend (`frontend/`)

| Command | Purpose |
|---|---|
| `npm run dev` (or `npm start`) | Dev server with hot reload — http://localhost:3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally, for a final check before deploying |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

### Backend (`backend/`)

| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server, watch mode |
| `npm run start` | Dev server, no watch |
| `npm run build && npm run start:prod` | Production: compile to `dist/`, then run `node dist/main` |
| `npm run lint` | ESLint (`--fix`) |
| `npm test` / `test:watch` / `test:cov` | Jest unit tests |
| `npm run test:e2e` | End-to-end tests |
| `npm run migration:generate` / `migration:create` / `migration:run` / `migration:revert` | TypeORM migrations (via `src/data-source.ts`) |
| `npm run seed:all` | Full demo-data reseed (see below) |
| `npm run wipe:test-data -- --confirm` | Wipe seeded rows before a clean reseed |

## Architecture

- **Frontend** is a single-page React app. Almost all API calls and cross-screen state live in `frontend/src/App.jsx`, which passes data and handlers down into the route-level screens in `frontend/src/screens/`. Routing is React Router (`BrowserRouter`) with routes for `/`, `/catalogue`, `/dashboard`, `/leaderboard`, `/settings`, `/learning/:courseId`, `/trainer`, `/privacy`, `/about`.
- **Backend** is a standard NestJS app: one module per domain (courses, enrollments, modules/quizzes, profiles, providers, badges, learning-paths, notifications, bookmarks, leaderboard, activity). Each module follows the usual NestJS controller → service → TypeORM entity/repository shape.
- **Auth** is entirely Supabase's: the frontend talks to Supabase Auth directly (email/password + Google OAuth) and attaches the resulting JWT as a Bearer token on every backend request. The backend never stores passwords — `SupabaseAuthGuard` (`backend/src/auth/supabase-auth.guard.ts`) verifies each token locally against Supabase's public JWKS endpoint (via `jose`), so verification costs no per-request round trip to Supabase. `RequireTrainerGuard` additionally restricts trainer-only endpoints.
- **Rate limiting**: `@nestjs/throttler` is wired globally in `app.module.ts` (100 requests/minute/IP) as a blanket backstop, since `SupabaseAuthGuard` itself is opt-in per controller rather than global.
- **PDF certificates** are generated server-side with `pdf-lib`, using an embedded DejaVu Sans font bundle so non-Latin learner names render correctly.

## Database

Postgres, hosted on Supabase. Two separate things share it:

1. **`auth.users`** — owned entirely by Supabase Auth (signup, login, password reset, Google OAuth). The backend never writes to this table directly.
2. **The app's own tables** (`profiles`, `courses`, `enrollments`, etc.) — owned by TypeORM. A Postgres trigger (migration `AddProfileCreationTrigger`) creates a matching `profiles` row whenever a new `auth.users` row appears, so the app-side profile always exists once someone signs up.

`synchronize` is off everywhere — **all schema changes go through TypeORM migrations** in `backend/src/migrations/`, run in order via `npm run migration:run`. Row-Level Security policies are also defined at the Postgres level (`AddRowLevelSecurityPolicies` migration) as defense-in-depth alongside the TypeORM-guarded API.

A few schema points worth knowing before making changes:
- `profiles.providerId` is a single scalar column — a trainer can belong to at most **one** provider/team at a time (v1 limitation, called out directly in the `Profile` entity and in `seed-providers.ts`).
- Course hours support fractional values (`AllowFractionalCourseHours` migration) with a column transformer on `Course.hours` to avoid float-precision drift.
- Points, not "minutes", are the unit for daily goals and the leaderboard — an earlier minutes-based system was renamed/rescaled wholesale (see the `RenameActivityEventsMinutesToPoints` / `RenameProfilesDailyGoalMinToPoints` migrations).

## Demo data / seeding

`backend/src/seeds/` has one script per layer, run in dependency order by `npm run seed:all`:

1. `seed:accounts` — creates demo Supabase Auth users (learners + trainers) split across three tracks: Technical, Business, Leadership.
2. `seed:courses` — 40 courses across those tracks, each with modules, quizzes (MCQ + short-answer), FAQs, credits, and skill tags.
3. `seed:providers` — groups trainers into provider "teams" and links each team's owned courses.
4. `seed:learning-paths` — bundles courses into curated learning paths, one path per team.
5. `seed:forum-posts` — seeds forum threads/replies across every course module.
6. `seed:activity` — the big one: simulates realistic enrollments, module/quiz progress, grades, points, badges, bookmarks, ratings, and leaderboard opt-ins using a seeded PRNG so results are varied but reproducible across reseeds. Mirrors the real point/grade formulas used by `EnrollmentsService`/`ModulesService` exactly, and recalculates course ratings at the end the same way the live app does.

Every seed script is idempotent at the table level — it checks whether its target table already has rows and skips if so. To do a clean reseed: `npm run wipe:test-data -- --confirm` first, then `npm run seed:all`.

## Features

What's actually built and working, by area:

**Auth & onboarding** — Email/password and Google OAuth signup and login (via Supabase Auth), role selection (learner/trainer) at signup with a later role-change flow, forgot-password/reset-password flow, first-time goal-setting onboarding modal for both roles.

**Homepage / Discover** — Hero section, "Popular this month" and "New on Encyclopedia" course rails, personalized Recommended/Trending sections, a Learning Paths teaser, and a Leaderboard teaser.

**Catalogue** — Full-text search (title, provider, skills), filtering, pagination, bookmarking, "Recommended for you", and a Learning Paths grid — all backed by the real API.

**Course detail** — Basic info, blurb, module agenda, sources/credits, per-course FAQ, and enrol/already-enrolled state.

**Learning screen** — Per-module video (YouTube embed, with an optional real-duration lookup via the YouTube Data API to estimate module time), per-module private notes with debounced autosave, MCQ + auto-graded short-answer quizzes (retakeable), a live grades panel that flags modules under the 70% pass threshold, a computed overall course grade, and a threaded per-module discussion forum (post/reply/edit).

**Completion & certificates** — Course completion triggers a rating/review prompt; a real PDF certificate (two-tier, grade-dependent) is generated server-side and is downloadable once a course is complete.

**Dashboard** — Progress overview (in-progress/completed/certificates), a weekly calendar with working week navigation, points-based daily goals (learner-configurable), streak tracking, weekly learning stats, a skills profile built from completed courses, earned badges, bookmarked ("Saved") courses, and learning-path progress.

**Trainer Studio** — Course CRUD including modules, videos, quizzes (authored inline, including at course-creation time), FAQs and credits; ownership scoped to the trainer or their provider team; search/filter over owned courses; a stats overview panel; per-course analytics (enrollment counts, completion rate, pacing); a Team tab (create/join a provider via invite code, manage members, leave a team); and a Learning Path editor (build/reorder/remove courses in a path).

**Leaderboard** — Points-based ranking across opted-in learners, with a settings toggle to opt in/out.

**Notifications** — Bell icon with unread count and a dropdown, covering badge awards, course completions, and forum replies.

**Badges** — Automatically awarded on a handful of triggers (e.g. course completion, quiz performance, forum participation).

**Settings** — Change display name, change password, edit daily goal, toggle leaderboard visibility.

**Cross-cutting work** — Full responsive/mobile support (Tailwind, audited at three breakpoints), accessible names on every icon-only control, Lighthouse-driven performance work (code-splitting, image formats/preload, deferred non-critical fetches, CLS fixes), request-length limits (`MaxLength`) on every user-text DTO with matching frontend `maxLength`s, and a real Jest/Vitest test suite (backend service specs for every module; frontend component tests for auth, onboarding, settings, and trainer-team flows).

## Backend module map

| Module | Responsibility |
|---|---|
| `courses` | Course CRUD, ownership guard, video-duration lookup, course analytics |
| `modules` | Module content, quiz authoring/grading, notes, forum (shares this module's folder rather than having their own top-level module) |
| `enrollments` | Enrol/unenrol/retake, progress tracking, grade calc, certificate generation, ratings/reviews |
| `profiles` | The app-side user record: name, role, daily goal, leaderboard opt-in, provider link |
| `providers` | Trainer "teams": invite codes, membership, course ownership scoping |
| `learning-paths` | Curated course bundles + path enrollment/derived progress |
| `badges` | Badge award rules + evaluation, triggered from quiz/forum/course-completion events |
| `notifications` | Generalized notification records + unread count |
| `bookmarks` | Saved courses |
| `leaderboard` | Points-based ranking |
| `activity` | View-time tracking and point redistribution across a session |
| `auth` (no module, guards only) | `SupabaseAuthGuard` (JWT verification), `RequireTrainerGuard` |

Entities not owning their own top-level module — `quiz/`, `forum/`, `notes/` — are grouped inside `modules/` since that's the only place they're written to.

## Frontend structure

- `screens/` — one file per route: `HomeScreen`, `CatalogueScreen`, `DashboardScreen`, `LearningScreen`, `LeaderboardScreen`, `SettingsScreen`, `AboutScreen`, `PrivacyScreen`, plus `screens/trainer/` for `TrainerScreen`, `TrainerCourseEditor`, `TeamTab`, `CourseAnalyticsView`, `LearningPathEditor`.
- `components/layout/` — `AppSidebar`, `AppTopbar`, `MarketingHeader`, `Footer`.
- `components/modals/` — `AuthModal`, `ResetPasswordModal`, `RoleOnboardingModal`, `GoalOnboardingModal`, `CourseDetailModal`, `LearningPathDetailModal`.
- `components/common/Primitives.jsx` — shared building blocks, including the `EmptyState`/`ErrorState` pattern used across every screen.
- `context/AuthContext.jsx` — Supabase session state, exposed via a hook.
- `lib/` — `supabaseClient.js` (Supabase client init), `courseGrade.js` (grade calc, unit-tested and kept in sync with the backend's formula), `userDisplay.js` (name-formatting helpers).
- `App.jsx` — owns almost all data-fetching and mutation handlers, wired down as props into the screens; also defines all routes and route guards (e.g. `LearningRoute`).
- `*.test.jsx` / `*.test.js` files sit next to the code they test (Vitest + Testing Library).

## Deployment

**Frontend → Vercel.** `frontend/vercel.json` handles SPA routing (rewrites every path to `index.html`) and sets long-lived cache headers on `/assets/*`. Build command is `npm run build`, output directory `dist`. Set the three `VITE_APP_*` env vars in the Vercel project settings, pointed at the deployed backend and the Supabase project.

**Backend → GCP Cloud Run.** There's no `Dockerfile` in this repo, which means the Cloud Run service is almost certainly configured for a source-based deploy (Cloud Run/Buildpacks auto-detects Node, runs `npm install` + a start command). **Confirm the exact Cloud Run service configuration (build command, start command, region, env vars) with whoever set it up** — it isn't captured in-repo and isn't something this guide can verify from the code alone. Whatever the deploy mechanism, the running process needs the same `backend/.env` variables set (as Cloud Run environment variables/secrets, not a committed file), plus `DEPLOYED_FRONTEND_URL` pointed at the real Vercel domain so CORS allows it through.

## Known limitations

- A trainer can belong to only one provider/team at a time (`profiles.providerId` is a single scalar — see [Database](#database)).
- The Dashboard's "analytics" surface for learners is a single weekly stats card, not a dedicated reporting view (Trainer Studio's course analytics is the more complete reporting surface, and it's trainer-only).
- Search lives on the Catalogue page, not the Homepage itself.
- Onboarding after signup is limited to the role-selection and goal-setting modals — there's no separate guided tour.
- `frontend/src/data/courses.js` currently only holds the homepage testimonials content — despite the filename, it is not a source of course data (that all comes from the API).
