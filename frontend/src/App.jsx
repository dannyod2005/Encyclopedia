import React, { useState, useEffect, useMemo } from "react";
import {
  BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation, useSearchParams
} from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./context/AuthContext";

import { AppSidebar } from "./components/layout/AppSidebar";
import { AppTopbar } from "./components/layout/AppTopbar";
import { Footer } from "./components/layout/Footer";

import { CourseDetailModal } from "./components/modals/CourseDetailModal";
import { LearningPathDetailModal } from "./components/modals/LearningPathDetailModal";
import { AuthModal } from "./components/modals/AuthModal";
import { GoalOnboardingModal } from "./components/modals/GoalOnboardingModal";
import { RoleOnboardingModal } from "./components/modals/RoleOnboardingModal";
import { ResetPasswordModal } from "./components/modals/ResetPasswordModal";

// #367 — HomeScreen and DashboardScreen are the two most-landed-on routes
// (logged-out "/" and the post-login default), so they stay eagerly
// bundled to avoid adding a chunk-fetch delay to the most common first
// paint. Everything else below is route-level code-split via React.lazy:
// Lighthouse's "reduce unused JavaScript" finding on the Dashboard route
// specifically flagged LearningScreen and TrainerCourseEditor (nested in
// TrainerScreen) as shipped-but-unused bytes on that page — this is what
// stops that. .then(m => ({ default: m.X })) is needed because these are
// named exports, not default exports, and React.lazy only accepts a
// loader that resolves to a `default` — no changes to the target files.
import { HomeScreen } from "./screens/HomeScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
const PrivacyScreen = React.lazy(() => import("./screens/PrivacyScreen").then((m) => ({ default: m.PrivacyScreen })));
const AboutScreen = React.lazy(() => import("./screens/AboutScreen").then((m) => ({ default: m.AboutScreen })));
const CatalogueScreen = React.lazy(() => import("./screens/CatalogueScreen").then((m) => ({ default: m.CatalogueScreen })));
const LeaderboardScreen = React.lazy(() => import("./screens/LeaderboardScreen").then((m) => ({ default: m.LeaderboardScreen })));
const SettingsScreen = React.lazy(() => import("./screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));
const LearningScreen = React.lazy(() => import("./screens/LearningScreen").then((m) => ({ default: m.LearningScreen })));
const TrainerScreen = React.lazy(() => import("./screens/trainer/TrainerScreen").then((m) => ({ default: m.TrainerScreen })));

/* ---------------------------------------------------------------
   KEYSTONE LEARNING — clickable prototype (now routed)
--------------------------------------------------------------- */

function screenKeyFromPath(pathname) {
  if (pathname.startsWith("/catalogue")) return "catalogue";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/learning")) return "learning";
  if (pathname.startsWith("/leaderboard")) return "leaderboard";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/trainer")) return "trainer";
  // #345/#346 — neither is a sidebar nav item (both are reached via the
  // footer, not primary nav), just need their own key so the topbar
  // title reads correctly instead of falling through to the
  // "home"/"Discover" default.
  if (pathname.startsWith("/privacy")) return "privacy";
  if (pathname.startsWith("/about")) return "about";
  return "home";
}

// #207 — sessionStorage key for a course a logged-out learner clicked
// "Enrol" on. pendingCourse (React state) is enough for the email-signup
// flow, which resolves synchronously in the same page load, but Google
// sign-in (#186) is a full-page redirect that clears all in-memory state
// including pendingCourse — this is the survives-a-redirect mirror of it,
// consumed by the effect near completeEnrol below.
const PENDING_ENROL_STORAGE_KEY = "ks_pendingEnrolCourseId";

// Backend returns lastAccessed as an ISO timestamp or null (a fresh
// enrollment has never been "accessed" yet). Format to something short
// for display; DashboardScreen just interpolates this string raw.
function formatLastAccessed(iso) {
  if (!iso) return "not yet";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// #110 — Course.rating is a Postgres decimal column, which the pg driver
// (via TypeORM, no transformer defined) returns as a string, not a
// number — same quirk as Enrollment.progress (see the comment where
// enrolled state is set below). Every current frontend usage of rating
// happens to tolerate a string (Math.round auto-coerces, plain JSX
// display doesn't care about type), so nothing was visibly broken, but
// that's incidental, not a guarantee — same "parse once at the API
// boundary" fix applied here for consistency with progress, so
// course.rating is an actual number everywhere downstream from here.
function normalizeCourse(c) {
  return { ...c, rating: c.rating == null ? null : Number(c.rating) };
}

// #289 — plain fetch() has no timeout: if a connection hangs (e.g. the
// backend dev server restarting mid-request, or any other half-open
// socket that never gets a response) the returned Promise just never
// settles, so .then/.catch/.finally never run and a loading flag gated
// on this fetch stays true forever — no error, just an infinite spinner
// that nothing but a full page reload can clear. This wraps fetch with
// an AbortController so a hung request eventually rejects like a normal
// failure instead of hanging indefinitely, which is what actually lets
// the .catch/.finally below do their job.
function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timeoutId),
  );
}

/* ---------- Layout shell (sidebar + topbar) for logged-in app routes ---------- */
function AppShell({ loggedIn, role, onLogout, title, children, user, goal, notifications, unreadCount, onOpenNotification }) {
  const location = useLocation();
  const screen = screenKeyFromPath(location.pathname);
  const navigate = useNavigate();

  const showSidebar = loggedIn;

  // #104 — the sidebar is always in the DOM (needed so it can slide in/out
  // on mobile rather than mount/unmount), just off-canvas by default below
  // the md breakpoint. This state only controls that mobile open/closed
  // state; on md+ the sidebar ignores it entirely (see AppSidebar).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function go(key) {
    setMobileNavOpen(false);
    navigate(key === "home" ? "/" : `/${key}`);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {showSidebar && (
        <AppSidebar
          screen={screen}
          onGo={go}
          role={role}
          onLogout={onLogout}
          user={user}
          goal={goal}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      )}
      {/* #347 — this column wasn't a flex column, so Footer (added in
          #337) just sat right after {children} in normal document flow
          instead of pinning to the bottom on any page shorter than the
          viewport (Leaderboard, Settings, etc.) — the outer row's
          minHeight:100vh stretched this column to full height, but
          nothing inside it used that space. Making it a column with the
          {children} wrapper set to flex:1 lets that wrapper grow to fill
          the leftover space, pushing Footer down to the actual bottom
          regardless of how much content is above it. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {showSidebar && (
          <AppTopbar
            title={title}
            onMenuClick={() => setMobileNavOpen(true)}
            notifications={notifications}
            unreadCount={unreadCount}
            onOpenNotification={onOpenNotification}
          />
        )}
        {/* #366 — was a plain div: the routed page content had no landmark
            a screen reader user could jump straight to (Lighthouse's
            "Document does not have a main landmark" finding). AppSidebar's
            nav and AppTopbar above are their own landmarks (nav/header
            equivalents), so <main> here marks the one remaining region —
            the actual page content — without wrapping those too. */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {children}
        </main>
        {/* #337 — site-wide footer, rendered once here so every routed
            page picks it up automatically instead of each screen adding
            its own. #345 — onGo reuses the same navigate-by-key function
            passed to AppSidebar above, now that "Privacy & GDPR" has a
            real page to link to. */}
        <Footer onGo={go} />
      </div>
    </div>
  );
}

/* ---------- Route guards ---------- */
function RequireAuth({ loggedIn, children }) {
  const location = useLocation();
  if (!loggedIn) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RequireTrainer({ role, children }) {
  if (role !== "trainer") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

/* ---------- Learning screen wrapper: resolves :courseId -> course object ---------- */
function LearningRoute({ courses, enrolled, coursesLoading, enrolledLoading, onSaveProgress, onSubmitRating, onLogModuleView, onFetchQuiz, onSubmitQuiz, onFetchQuizResults, onFetchNote, onSaveNote, onFetchPosts, onCreatePost, onEditPost, currentUserId, onUnenrol }) {
  const { courseId } = useParams();
  const navigate = useNavigate();
  // #229 — a notification click-through lands here as
  // /learning/:courseId?module=<id>&tab=forum; both are optional and
  // LearningScreen falls back to its normal defaults when absent, so
  // every other caller of this route (Dashboard's "Resume"/"Start", etc.)
  // is completely unaffected.
  const [searchParams] = useSearchParams();
  const course = courses.find((c) => String(c.id) === courseId);
  const enrollment = enrolled.find((e) => e.courseId === courseId);

  // #181 — `courses` (the public catalogue fetch) and `enrolled` (needed
  // both for the enrollment lookup below and, via `coursesForLearners`,
  // for courses a learner is enrolled in that have since left the public
  // catalogue) are both still empty on a fresh page load — a hard reload
  // or direct navigation to this URL — until their fetches resolve. A
  // "not found" redirect here can't be trusted until both have actually
  // loaded; earlier this fired on that empty-array startup state instead
  // of waiting, bouncing straight to /dashboard before the real data ever
  // arrived. Show a loading state instead, and only redirect once loading
  // is done and the course still genuinely isn't found.
  if (!course) {
    if (coursesLoading || enrolledLoading) {
      return (
        <div className="enc-card" style={{ padding: 40, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
          Loading course…
        </div>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <LearningScreen
      course={course}
      enrollment={enrollment}
      onSaveProgress={onSaveProgress}
      onSubmitRating={onSubmitRating}
      onLogModuleView={onLogModuleView}
      onFetchQuiz={onFetchQuiz}
      onSubmitQuiz={onSubmitQuiz}
      onFetchQuizResults={onFetchQuizResults}
      onFetchNote={onFetchNote}
      onSaveNote={onSaveNote}
      onFetchPosts={onFetchPosts}
      onCreatePost={onCreatePost}
      onEditPost={onEditPost}
      currentUserId={currentUserId}
      onBack={() => navigate("/dashboard")}
      onUnenrol={onUnenrol}
      initialModuleId={searchParams.get("module")}
      initialTab={searchParams.get("tab")}
    />
  );
}

/* ---------- Root ---------- */
function EncyclopediaPrototype() {
  const navigate = useNavigate();
  const location = useLocation();

  const { user, session, loading: authLoading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const loggedIn = !!user;
  const role = user?.user_metadata?.role || "learner";

  const [selectedCourse, setSelectedCourse] = useState(null);
  const [enrolled, setEnrolled] = useState([]);
  const [badges, setBadges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [enrolling, setEnrolling] = useState(false); // #154 — the in-flight POST /enrollments request, so CourseDetailModal's Enrol button can disable/show pending state instead of allowing a double-click.
  const [toast, setToast] = useState(null);
  const [authMode, setAuthMode] = useState(null); // null | "login" | "signup"
  const [pendingCourse, setPendingCourse] = useState(null);
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [enrolledLoading, setEnrolledLoading] = useState(true);
  // #289 — courses/enrolled are the two fetches DashboardScreen's "My
  // learning" loading state is gated on (loading={coursesLoading ||
  // enrolledLoading}); errors on either previously left it stuck showing
  // "Loading your learning…" forever with no way back except a full page
  // reload. dashboardRetryTick is a shared "try again" trigger: bumping
  // it re-runs both effects below without needing separate retry state
  // per fetch, since the fix (a hung request, or a real failure) is the
  // same either way — just re-request both.
  const [coursesError, setCoursesError] = useState(false);
  const [enrolledError, setEnrolledError] = useState(false);
  const [dashboardRetryTick, setDashboardRetryTick] = useState(0);
  const retryDashboard = () => setDashboardRetryTick((n) => n + 1);
  // #224 — learning paths follow the exact same public-list/private-
  // enrollment split as courses/enrolled above: `learningPaths` is the
  // public GET /learning-paths list (no auth), `pathEnrollments` is this
  // learner's own GET /learning-path-enrollments (auth, reset on logout).
  const [selectedPath, setSelectedPath] = useState(null);
  const [learningPaths, setLearningPaths] = useState([]);
  const [learningPathsLoading, setLearningPathsLoading] = useState(true);
  const [pathEnrollments, setPathEnrollments] = useState([]);
  const [enrollingPath, setEnrollingPath] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  // #183 — which 7-day week the Dashboard's mini-calendar is showing,
  // in weeks relative to the current one (0 = this week, -1 = last
  // week, ...). Lives here rather than in DashboardScreen so it resets
  // naturally on logout along with the rest of this section's state.
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [activitySummary, setActivitySummary] = useState({
    streak: 0,
    pointsThisWeek: 0,
    dailyGoalPoints: 1500, // #296 — matches the recalibrated signup default
    goalHitDays: 0,
    week: [],
  });
  // #107 — profiles.goal: null until a learner picks one via the
  // onboarding modal below (or never, if they skip — that's a permanent,
  // fine end state, not a "loading" one). goalLoaded distinguishes "not
  // fetched yet" from "fetched, confirmed null" so the trigger effect below
  // never fires on a stale/pre-fetch value.
  const [learnerGoal, setLearnerGoal] = useState(null);
  const [goalLoaded, setGoalLoaded] = useState(false);
  const [showGoalOnboarding, setShowGoalOnboarding] = useState(false);
  // #186 — profiles.role, fetched alongside goal below (same /profiles/me
  // call). NULL only ever happens for a Google sign-up that hasn't picked
  // learner/trainer yet — see MakeProfileRoleNullable. Kept separate from
  // `role` (the user_metadata-derived value used for gating everywhere
  // else) since this one specifically tracks "what does the DB say right
  // now," which is what the trigger effect below needs to know.
  const [profileRole, setProfileRole] = useState(null);
  const [showRoleOnboarding, setShowRoleOnboarding] = useState(false);
  // #231 — profiles.leaderboardOptIn, fetched alongside goal/role below
  // (same /profiles/me call). Defaults false so a not-yet-fetched or
  // logged-out state never optimistically reads as "opted in".
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);

  useEffect(() => {
    setCoursesError(false);
    fetchWithTimeout(`${process.env.REACT_APP_API_URL}/courses`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => setCourses(data.map(normalizeCourse)))
      .catch((err) => {
        console.error("Failed to load courses:", err.message);
        setCoursesError(true);
      })
      .finally(() => setCoursesLoading(false));
  }, [dashboardRetryTick]);
  // Fetch the logged-in user's real enrollments (#19), replacing the old
  // ENROLLED_DEFAULT mock. Re-runs whenever login state changes; clears
  // back to [] on logout rather than leaving stale data from a previous
  // session visible.
  useEffect(() => {
    if (!loggedIn || !session) {
      setEnrolled([]);
      setEnrolledLoading(false);
      setEnrolledError(false);
      return;
    }

    setEnrolledLoading(true);
    setEnrolledError(false);
    fetchWithTimeout(`${process.env.REACT_APP_API_URL}/enrollments`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // progress arrives as a string (Postgres decimal via pg driver,
        // same quirk seen with Course.rating) — convert once here so
        // DashboardScreen's arithmetic (e.progress * 100, etc.) works
        // without needing changes there.
        setEnrolled(
          data.map((e) => ({
            ...e,
            progress: Number(e.progress),
            lastAccessed: formatLastAccessed(e.lastAccessed),
          })),
        );
      })
      .catch((err) => {
        console.error("Failed to load enrollments:", err.message);
        setEnrolled([]);
        setEnrolledError(true);
      })
      .finally(() => setEnrolledLoading(false));
  }, [loggedIn, session, dashboardRetryTick]);

  // #224 — public list of learning paths, same fetch-on-mount shape as
  // courses above.
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/learning-paths`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setLearningPaths)
      .catch((err) => console.error("Failed to load learning paths:", err.message))
      .finally(() => setLearningPathsLoading(false));
  }, []);

  // #224 — this learner's path enrollments (with live completedCount/
  // totalCount/status from the backend). Same re-run-on-login-change/
  // reset-on-logout pattern as enrolled above.
  useEffect(() => {
    if (!loggedIn || !session) {
      setPathEnrollments([]);
      return;
    }

    fetch(`${process.env.REACT_APP_API_URL}/learning-path-enrollments`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setPathEnrollments)
      .catch((err) => {
        console.error("Failed to load learning path enrollments:", err.message);
        setPathEnrollments([]);
      });
  }, [loggedIn, session]);

  // #225 — this learner's earned badges, for the Dashboard's badges card.
  // Same re-run-on-login-change/reset-on-logout pattern as enrollments
  // above. No dedicated loading flag: the card only renders once there's
  // at least one badge (see DashboardScreen), so briefly showing nothing
  // while this resolves reads the same as "no badges yet" rather than
  // needing its own loading state.
  useEffect(() => {
    if (!loggedIn || !session) {
      setBadges([]);
      return;
    }

    fetch(`${process.env.REACT_APP_API_URL}/badges/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setBadges)
      .catch((err) => {
        console.error("Failed to load badges:", err.message);
        setBadges([]);
      });
  }, [loggedIn, session]);

  // #229 — forum-reply notifications, for the topbar bell. Same
  // on-login-change fetch shape as badges above. This app has no polling
  // precedent anywhere (every fetch here is on-mount/on-navigation or
  // fired directly by a user action) — a new notification becomes visible
  // the next time this effect re-runs (login, reload, or a route change
  // that remounts the relevant screen), not the instant it's created on
  // the server. A deliberate v1 scope boundary, not an oversight.
  useEffect(() => {
    if (!loggedIn || !session) {
      setNotifications([]);
      return;
    }

    fetch(`${process.env.REACT_APP_API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setNotifications)
      .catch((err) => {
        console.error("Failed to load notifications:", err.message);
        setNotifications([]);
      });
  }, [loggedIn, session]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // #292 — fire-and-forget refresh after an action that can create a new
  // notification server-side (course completion, most concretely) — same
  // "silently leave state stale on failure rather than surface it"
  // reasoning as refetchActivitySummary below. Unlike the on-login effect
  // above, a failure here does NOT reset notifications to [] — that reset
  // only makes sense for a fresh mount with no known state yet; wiping an
  // already-populated bell because one follow-up refetch hiccuped would
  // be worse than just leaving it stale until the next natural refetch.
  async function refetchNotifications() {
    if (!session) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      setNotifications(await res.json());
    } catch (err) {
      console.error("Failed to refresh notifications:", err.message);
    }
  }

  // #230 — this learner's saved-without-enrolling courses, for the
  // Catalogue card toggle and the Dashboard's Saved section. Same
  // on-login-change fetch/reset shape as badges/notifications above.
  useEffect(() => {
    if (!loggedIn || !session) {
      setBookmarks([]);
      return;
    }

    fetch(`${process.env.REACT_APP_API_URL}/bookmarks`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setBookmarks)
      .catch((err) => {
        console.error("Failed to load bookmarks:", err.message);
        setBookmarks([]);
      });
  }, [loggedIn, session]);

  const bookmarkedIds = bookmarks.map((b) => b.courseId);

  // #230 — single toggle for both the Catalogue card's icon and the
  // Dashboard Saved section's icon: `isBookmarked` tells it which
  // direction to go, optimistically updated in local state first so the
  // icon flips immediately rather than waiting on the round trip (a
  // failed request just re-fetches to correct it, same "don't block the
  // UI on a best-effort follow-up" reasoning as markNotificationRead).
  async function toggleBookmark(course, isBookmarked) {
    if (!session) return;
    try {
      if (isBookmarked) {
        setBookmarks((prev) => prev.filter((b) => b.courseId !== course.id));
        const res = await fetch(`${process.env.REACT_APP_API_URL}/bookmarks/${course.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      } else {
        setBookmarks((prev) => [...prev, { id: `pending-${course.id}`, courseId: course.id, createdAt: new Date().toISOString() }]);
        const res = await fetch(`${process.env.REACT_APP_API_URL}/bookmarks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ courseId: course.id }),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const saved = await res.json();
        setBookmarks((prev) => prev.map((b) => (b.courseId === course.id ? saved : b)));
      }
    } catch (err) {
      console.error("Failed to toggle bookmark:", err.message);
      // Re-sync from the server rather than guessing what the optimistic
      // update above should roll back to.
      fetch(`${process.env.REACT_APP_API_URL}/bookmarks`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then(setBookmarks)
        .catch(() => {});
    }
  }

  // #229 — best-effort: if the PATCH fails, the notification just stays
  // marked unread locally rather than blocking navigation on it — the
  // learner still gets taken to the right forum post either way, which is
  // the part that actually matters.
  async function markNotificationRead(notificationId) {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const updated = await res.json();
      setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch (err) {
      console.error("Failed to mark notification read:", err.message);
    }
  }

  // #257 — click-through target now depends on type: forum_reply still
  // deep-links straight to the forum tab of the module it's about;
  // badge_earned has no course/module of its own, so it goes to
  // Dashboard's badges card instead; course_completed goes to the course
  // itself rather than the forum tab specifically, since there's no
  // module in play.
  function handleOpenNotification(notification) {
    if (!notification.read) markNotificationRead(notification.id);
    if (notification.type === "badge_earned") {
      navigate("/dashboard");
      return;
    }
    if (notification.type === "course_completed") {
      navigate(`/learning/${notification.courseId}`);
      return;
    }
    navigate(`/learning/${notification.courseId}?module=${notification.moduleId}&tab=forum`);
  }

  // Real streak / points-this-week / daily-goal data (#37, #246), replacing
  // the old LEARNER mock. Re-runs on login state change like enrollments
  // above; resets to a neutral empty shape on logout.
  useEffect(() => {
    if (!loggedIn || !session) {
      setActivitySummary({
        streak: 0,
        pointsThisWeek: 0,
        dailyGoalPoints: 1500, // #296 — matches the recalibrated signup default
        goalHitDays: 0,
        week: [],
      });
      setCalendarWeekOffset(0);
      return;
    }

    // #183 — weekOffset pages the calendar's day grid only; the backend
    // keeps streak/pointsThisWeek/goalHitDays pinned to the real
    // current week regardless, so those don't flicker as the calendar is
    // browsed.
    fetch(`${process.env.REACT_APP_API_URL}/activity/summary?weekOffset=${calendarWeekOffset}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setActivitySummary)
      .catch((err) => console.error("Failed to load activity summary:", err.message));
  }, [loggedIn, session, calendarWeekOffset]);

  // #107 — learner's goal (profiles.goal), replacing the old LEARNER.goal
  // mock. Same re-run/reset-on-logout pattern as activitySummary above.
  // A 404 here (shouldn't normally happen — handle_new_user() always
  // creates a profile row) is treated the same as "no goal set" rather
  // than surfaced as an error. goalLoaded only flips true once we actually
  // know the answer (a thrown/network error leaves it false, deliberately
  // — see the trigger effect below for why that matters), and resets to
  // false on logout so a stale "loaded" flag can't survive into a
  // different account's session.
  //
  // #fix-stale-token-onboarding-modal — used to be `res.ok ? res.json() :
  // null`, which folded EVERY non-ok response into the same "empty
  // profile" path as a real 404, including a 401 from a stale/expired
  // token (e.g. another tab's global sign-out invalidating this one — see
  // handleLogout's own fix above). That set profileRole to null and
  // goalLoaded to true on a plain auth failure, which is exactly what the
  // role/goal-onboarding triggers below are watching for — an
  // unauthorized account with a real role looked identical to a brand
  // new one. Only a genuine 404 gets treated as "no profile row yet" now;
  // anything else throws into the existing catch, which already leaves
  // goalLoaded false rather than misreporting an answer.
  useEffect(() => {
    if (!loggedIn || !session) {
      setLearnerGoal(null);
      setGoalLoaded(false);
      setProfileRole(null);
      setLeaderboardOptIn(false);
      return;
    }

    fetch(`${process.env.REACT_APP_API_URL}/profiles/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (res.ok) return res.json();
        if (res.status === 404) return null;
        throw new Error(`Failed to load profile (${res.status})`);
      })
      .then((profile) => {
        setLearnerGoal(profile?.goal ?? null);
        setProfileRole(profile?.role ?? null);
        setLeaderboardOptIn(profile?.leaderboardOptIn ?? false);
        setGoalLoaded(true);
      })
      .catch((err) => console.error("Failed to load profile:", err.message));
  }, [loggedIn, session]);

  // #107 — shows the onboarding modal once conditions are actually known
  // to be true, rather than only right after a signup event: signing up
  // doesn't always yield an immediate session (Supabase's "confirm your
  // email" flow means the first real session for a lot of accounts is a
  // later *login*, not the signup itself), so gating this on a signup-only
  // callback silently never showed it for any account that had to confirm
  // its email first. Deriving it from "logged in and we've confirmed the
  // profile has no goal" instead fires correctly regardless of how that
  // session came about, and naturally covers pre-existing accounts (e.g.
  // the seeded demo learners) too. Only runs once per login — skipping
  // doesn't change any of this effect's dependencies, so it won't
  // re-trigger itself for the rest of the session; it'll offer again next
  // login/reload as long as goal is still unset.
  //
  // #189 — no longer gated on role === "learner". A trainer account can
  // enrol in and take courses just like a learner (Trainer Studio is an
  // additional capability layered on top, not a separate account type),
  // so they should get asked for a goal too — it only ever affects their
  // own learner-facing views (Catalogue/Dashboard), never Trainer Studio.
  // #186 — role must be resolved first: a fresh Google sign-up has both
  // role and goal null, and showing both onboarding modals at once would
  // stack two full-screen backdrops. Gating this on `profileRole !== null`
  // means it simply doesn't fire until the role effect below has run its
  // course (either role was already set — the normal email-signup case,
  // so this behaves exactly as before — or the learner/trainer picker just
  // resolved it), at which point goal onboarding proceeds same as always.
  useEffect(() => {
    if (loggedIn && goalLoaded && learnerGoal === null && profileRole !== null) {
      setShowGoalOnboarding(true);
    }
  }, [loggedIn, goalLoaded, learnerGoal, profileRole]);

  // #186 — mirrors the goal-onboarding trigger above: fires once we've
  // actually confirmed (via the /profiles/me fetch) that this account has
  // no role yet, rather than off a signup-specific callback — same
  // reasoning as #107's comment above, and it covers the Google OAuth
  // redirect-return case for free since that's just another way `session`
  // ends up set.
  useEffect(() => {
    if (loggedIn && goalLoaded && profileRole === null) {
      setShowRoleOnboarding(true);
    }
  }, [loggedIn, goalLoaded, profileRole]);

  // Fire-and-forget refresh after an action that logs activity server-side
  // (module completed, quiz submitted, note saved, forum post made) — so
  // the dashboard reflects it without needing a full reload. A failure
  // here shouldn't surface to the user; it just means the dashboard stays
  // slightly stale until the next natural refetch.
  async function refetchActivitySummary() {
    if (!session) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/activity/summary?weekOffset=${calendarWeekOffset}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      setActivitySummary(await res.json());
    } catch (err) {
      console.error("Failed to refresh activity summary:", err.message);
    }
  }

  // #188/#246 — DashboardScreen's inline editor calls this. Refetches the
  // whole summary afterward rather than patching
  // activitySummary.dailyGoalPoints in place: goalHit per day (and
  // therefore goalHitDays) is computed server-side against
  // dailyGoalPoints, so a new goal value changes more than just the
  // number shown — refetching is what keeps the calendar's highlighted
  // days and "N of 7 days hit" in sync with it, same as any other action
  // that calls refetchActivitySummary above.
  async function updateDailyGoal(dailyGoalPoints) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me/daily-goal`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ dailyGoalPoints }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    await refetchActivitySummary();
  }

  // #231 — Dashboard settings toggle calls this. Unlike updateDailyGoal,
  // nothing else on this screen derives from leaderboardOptIn, so there's
  // no equivalent "refetch a whole summary" step needed — just reflect
  // the new value locally once the write succeeds.
  async function updateLeaderboardOptIn(optIn) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me/leaderboard-opt-in`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ optIn }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    setLeaderboardOptIn(optIn);
  }

  // #255 — Account Settings' name field. Writes both sides that carry a
  // "name": the backend Profile row (what other users see — forum post
  // authors, course review authors) via PATCH, and Supabase auth's own
  // user_metadata (what this user sees about *themselves* — the sidebar
  // greeting/avatar, via getDisplayName) via updateUser. The auth update
  // fires a USER_UPDATED event that AuthContext's onAuthStateChange
  // already listens for, so `user` (and everything deriving from it)
  // refreshes on its own — no separate setUser call needed here. Backend
  // write goes first and is the one that throws on failure before
  // touching auth state, so a failed save never leaves the two sources
  // half-synced.
  async function updateName(name) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me/name`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const { error } = await supabase.auth.updateUser({ data: { name } });
    if (error) throw new Error(error.message);

    setToast("Name updated");
    setTimeout(() => setToast(null), 2600);
  }

  // #255 — Account Settings' password field. Same call
  // ResetPasswordModal's forgot-password flow makes (supabase.auth.
  // updateUser({ password })) — the only difference is how the session
  // that authorizes it got there (a normal logged-in session here, vs. a
  // PASSWORD_RECOVERY session from the reset-email link there). Supabase
  // itself doesn't require re-entering the current password for this
  // call as long as the session is valid.
  async function changePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);

    setToast("Password updated");
    setTimeout(() => setToast(null), 2600);
  }

  // #231 — the Leaderboard screen's own fetch-on-mount, same
  // on-demand-per-screen shape as fetchCourseAnalytics: nothing else in
  // the app needs this data, so it isn't fetched globally on login like
  // badges/notifications/bookmarks are.
  async function fetchLeaderboard() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/leaderboard`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  const screen = screenKeyFromPath(location.pathname);

  const enrolledIds = enrolled.map((e) => e.courseId);

  // `courses` is the public catalogue (GET /courses) — deliberately
  // excludes soft-deleted courses (#41). But an enrolled learner's
  // dashboard/learning screen shouldn't lose access just because a
  // trainer deleted the course later, so fall back to the lightweight
  // course snapshot embedded on the enrollment itself (see
  // EnrolledCourseDto on the backend) for any id the catalogue doesn't
  // have. Only used for the learner-facing screens below — Trainer Studio
  // and the public catalogue correctly keep using `courses` as-is.
  const coursesForLearners = useMemo(() => {
    const catalogueIds = new Set(courses.map((c) => c.id));
    return [
      ...courses,
      ...enrolled
        .map((e) => e.course)
        .filter((c) => c && !catalogueIds.has(c.id)),
    ];
  }, [courses, enrolled]);

  useEffect(() => {
    const learningCourse =
      screen === "learning" ? coursesForLearners.find((c) => `/learning/${c.id}` === location.pathname) : null;
    const titles = {
      home: "Encyclopedia Learning",
      catalogue: "Catalogue — Encyclopedia",
      dashboard: "My Learning — Encyclopedia",
      learning: learningCourse ? `${learningCourse.title} — Encyclopedia` : "Encyclopedia",
      trainer: "Trainer Studio — Encyclopedia",
    };
    document.title = titles[screen] || "Encyclopedia";
  }, [screen, location.pathname, coursesForLearners]);

  async function saveCourse(draft) {
    const isNew = !draft.id;
    const url = isNew
      ? `${process.env.REACT_APP_API_URL}/courses`
      : `${process.env.REACT_APP_API_URL}/courses/${draft.id}`;

    const res = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(draft.payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message || `Request failed: ${res.status}`;
      throw new Error(message);
    }

    const saved = normalizeCourse(await res.json());

    setCourses((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
    setToast(`Saved "${saved.title}"`);
    setTimeout(() => setToast(null), 2600);
    return saved;
  }

  // Soft delete (#41) — backend just stamps deleted_at rather than
  // removing the row, so existing enrollments/progress aren't touched.
  // Here that just means removing it from the local catalogue list.
  async function deleteCourse(courseId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/courses/${courseId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    setCourses((prev) => prev.filter((c) => c.id !== courseId));
    setToast("Course deleted");
    setTimeout(() => setToast(null), 2600);
  }

  // #224 — same POST-if-new/PUT-if-existing + upsert-by-id shape as
  // saveCourse above. No normalizeCourse-style pass needed: the learning
  // path response DTO carries no decimal columns of its own (the nested
  // `courses` array is already normalized Course data from the same
  // /courses response shape, but re-fetching GET /learning-paths on the
  // next load is what keeps that in sync — this optimistic upsert is only
  // ever as fresh as what the create/update response itself returned).
  async function savePath(draft) {
    const isNew = !draft.id;
    const url = isNew
      ? `${process.env.REACT_APP_API_URL}/learning-paths`
      : `${process.env.REACT_APP_API_URL}/learning-paths/${draft.id}`;

    const res = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(draft.payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message || `Request failed: ${res.status}`;
      throw new Error(message);
    }

    const saved = await res.json();

    setLearningPaths((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    setToast(`Saved "${saved.title}"`);
    setTimeout(() => setToast(null), 2600);
    return saved;
  }

  // Soft delete, same shape as deleteCourse above.
  async function deletePath(pathId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/learning-paths/${pathId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    setLearningPaths((prev) => prev.filter((p) => p.id !== pathId));
    setToast("Learning path deleted");
    setTimeout(() => setToast(null), 2600);
  }

  async function saveProgress(enrollmentId, completedModules) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments/${enrollmentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ completedModules }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const updated = await res.json();
    setEnrolled((prev) =>
      prev.map((e) =>
        e.id === updated.id
          ? { ...updated, progress: Number(updated.progress), lastAccessed: formatLastAccessed(updated.lastAccessed) }
          : e,
      ),
    );
    refetchActivitySummary();
    // #292 — a save can be the one that pushes this enrollment to
    // 'complete' server-side, which creates a course_completed
    // notification (and possibly a badge_earned one) as a side effect.
    // Refetching here is what makes that show up in the bell right away
    // instead of only after the next login/reload.
    refetchNotifications();
  }

  // #106 — same pattern as saveProgress: PATCH the enrollment, merge the
  // returned row into `enrolled` by id so LearningScreen's `enrollment`
  // prop picks up the new rating on its next render without a refetch.
  // #228 — reviewText is optional (defaults to "" from LearningScreen's
  // reviewDraft state); the backend normalizes an empty string to null,
  // so this stays a no-op body-wise for the pure-star-rating case that
  // worked before #228.
  async function submitRating(enrollmentId, rating, reviewText = "") {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments/${enrollmentId}/rating`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ rating, reviewText }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const updated = await res.json();
    setEnrolled((prev) =>
      prev.map((e) =>
        e.id === updated.id
          ? { ...updated, progress: Number(updated.progress), lastAccessed: formatLastAccessed(updated.lastAccessed) }
          : e,
      ),
    );

    // #wire-course-rating-to-submissions — EnrolledCourseDto (the `course`
    // embedded on the response above) deliberately excludes rating —
    // it's a minimal per-learner snapshot, not the catalogue shape (see
    // its comment). And `courses` itself is only ever fetched once, on
    // initial load (the effect above is gated on dashboardRetryTick, not
    // on anything rating-related), so without this the Catalogue card and
    // CourseDetailModal would keep showing the pre-submission average
    // until a full page reload. Re-fetch just this one course (public
    // GET /courses/:id, already includes the freshly recalculated
    // average) and patch it into `courses` rather than re-fetching the
    // whole catalogue. Failure here shouldn't read as "rating submission
    // failed" — the rating itself already saved above — so this is
    // caught and logged on its own rather than left to bubble up to
    // LearningScreen's handleSubmitRating catch block.
    try {
      const courseRes = await fetch(`${process.env.REACT_APP_API_URL}/courses/${updated.courseId}`);
      if (courseRes.ok) {
        const freshCourse = normalizeCourse(await courseRes.json());
        setCourses((prev) => prev.map((c) => (c.id === freshCourse.id ? freshCourse : c)));
      }
    } catch (err) {
      console.error("Failed to refresh course rating after submission:", err.message);
    }
  }

  // #124 — fire-and-forget ping so the backend has a per-day "this module
  // was open" marker to split a module's completion points across later
  // (see ActivityService.logModuleView/logModuleCompletion). No response
  // body, no local state to update — LearningScreen calls this once per
  // module focus and doesn't need to await anything beyond error logging.
  async function logModuleView(moduleId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  }

  async function fetchNote(moduleId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/notes`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function saveNote(moduleId, content) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/notes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const result = await res.json();
    refetchActivitySummary();
    return result;
  }

  function openAuth(mode) {
    setAuthMode(mode);
  }

  // #318 — sessionOverride, same reasoning as completeEnrol below: called
  // synchronously from completeEnrol/completeEnrolPath right after a
  // guest's signup/login resolves, in the same tick, before AuthContext's
  // own `session` state has caught up. Without this, the enrollment POST
  // (which does get the fresh session) succeeds, but this refetch silently
  // no-ops on the stale null `session` — no error, just a dashboard that
  // doesn't show the new enrollment until something else re-triggers it.
  async function refetchEnrollments(sessionOverride = session) {
    if (!sessionOverride) return;
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments`, {
      headers: { Authorization: `Bearer ${sessionOverride.access_token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setEnrolled(
      data.map((e) => ({
        ...e,
        progress: Number(e.progress),
        lastAccessed: formatLastAccessed(e.lastAccessed),
      })),
    );
  }

  // #318 — sessionOverride, same reasoning as refetchEnrollments above.
  async function refetchPathEnrollments(sessionOverride = session) {
    if (!sessionOverride) return;
    const res = await fetch(`${process.env.REACT_APP_API_URL}/learning-path-enrollments`, {
      headers: { Authorization: `Bearer ${sessionOverride.access_token}` },
    });
    if (!res.ok) return;
    setPathEnrollments(await res.json());
  }

  // #224 — same shape as completeEnrol below, but enrolling in a path also
  // cascade-enrolls the learner in each of its constituent courses
  // server-side (see LearningPathEnrollmentsService), so both
  // pathEnrollments and enrolled need refetching afterward to pick up the
  // new state in one pass.
  // #318 — sessionOverride, same reasoning as completeEnrol above.
  async function completeEnrolPath(path, sessionOverride = session) {
    const alreadyEnrolled = pathEnrollments.some((pe) => pe.pathId === path.id);
    if (alreadyEnrolled) {
      setSelectedPath(null);
      navigate("/dashboard");
      return;
    }

    setEnrollingPath(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/learning-path-enrollments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionOverride.access_token}`,
        },
        body: JSON.stringify({ pathId: path.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Request failed: ${res.status}`);
      }

      await Promise.all([
        refetchPathEnrollments(sessionOverride),
        refetchEnrollments(sessionOverride),
      ]);
      setToast(`Enrolled in "${path.title}"`);
      setTimeout(() => setToast(null), 2600);
    } catch (err) {
      setToast(`Couldn't enrol: ${err.message}`);
      setTimeout(() => setToast(null), 3200);
    } finally {
      setEnrollingPath(false);
    }

    setSelectedPath(null);
    navigate("/dashboard");
  }

  // #318 — sessionOverride, not just the AuthContext `session`: called
  // synchronously from handleAuthSubmit right after a guest's signup/login
  // resolves, in the same tick — AuthContext's own `session` state is only
  // updated via its onAuthStateChange listener's setSession call, which
  // can't take effect until the next render, so it's still the pre-login
  // (null) value at that exact moment. handleAuthSubmit already has the
  // real, just-returned session in hand and passes it straight through
  // here rather than letting this function fall back to that stale
  // context value. Every other call site (already-logged-in Enrol clicks,
  // #207's sessionStorage-recovery effect) omits the second argument and
  // gets the default — those all run on a later render, once the context
  // session is genuinely fresh.
  async function completeEnrol(course, sessionOverride = session) {
    if (enrolledIds.includes(course.id)) {
      setSelectedCourse(null);
      navigate("/dashboard");
      return;
    }

    setEnrolling(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionOverride.access_token}`,
        },
        body: JSON.stringify({ courseId: course.id }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Request failed: ${res.status}`);
      }

      await refetchEnrollments(sessionOverride);
      setToast(`Enrolled in "${course.title}"`);
      setTimeout(() => setToast(null), 2600);
    } catch (err) {
      setToast(`Couldn't enrol: ${err.message}`);
      setTimeout(() => setToast(null), 3200);
    } finally {
      setEnrolling(false);
    }

    setSelectedCourse(null);
    navigate("/dashboard");
  }

  // #255 — leave a course. DELETE follows deleteCourse's shape below
  // exactly (no body, throw on !res.ok with the server's message), but
  // updates local state via refetchEnrollments + refetchPathEnrollments
  // (Promise.all, same as completeEnrolPath above) rather than a plain
  // local filter — unenrolling from a course that's part of an enrolled
  // learning path can also shift that path's derived progress, so both
  // need a fresh read from the server rather than being patched by hand
  // here.
  async function unenrolCourse(enrollmentId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments/${enrollmentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    await Promise.all([refetchEnrollments(), refetchPathEnrollments()]);
    setToast("Unenrolled");
    setTimeout(() => setToast(null), 2600);
  }

  // #300 — "Retake" on a completed course: hits the combined
  // POST /enrollments/:id/retake endpoint (see EnrollmentsService.retake)
  // rather than doing the DELETE-then-POST as two separate calls from
  // here, so there's no window where a network drop between them could
  // leave the learner unenrolled with nothing. Same refetch shape as
  // unenrolCourse above — a retaken course can also be part of an
  // enrolled learning path, whose derived progress needs the same fresh
  // read.
  async function retakeCourse(enrollmentId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments/${enrollmentId}/retake`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    await Promise.all([refetchEnrollments(), refetchPathEnrollments()]);
    setToast("Course reset — ready to retake");
    setTimeout(() => setToast(null), 2600);
  }

  // #207 — the other half of the sessionStorage mirror set in handleEnrol:
  // picks up a pending enrollment that survived a Google OAuth redirect
  // (which clears pendingCourse along with all other in-memory state,
  // unlike the synchronous email-signup path handleAuthSubmit handles
  // directly). Runs whenever loggedIn/coursesLoading change, but the key
  // is removed the moment it's read regardless of what happens next — a
  // course that's since been deleted just silently drops the pending
  // enrollment rather than retrying — so this only ever acts once per
  // stored value and can't loop or leak into a later signup.
  useEffect(() => {
    if (!loggedIn || coursesLoading) return;
    const pendingId = sessionStorage.getItem(PENDING_ENROL_STORAGE_KEY);
    if (!pendingId) return;
    sessionStorage.removeItem(PENDING_ENROL_STORAGE_KEY);
    const course = courses.find((c) => c.id === pendingId);
    if (course) completeEnrol(course);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, coursesLoading]);

  async function fetchQuiz(moduleId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/quiz`);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function submitQuiz(moduleId, answers) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/quiz/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ answers }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const result = await res.json();
    refetchActivitySummary();
    // #291 — a perfect score can earn the perfect_quiz_score badge
    // server-side, which creates a notification as a side effect. Same
    // reasoning as saveProgress's refetch below: without this, the bell
    // stays stale until some unrelated later refetch happens to fire.
    refetchNotifications();
    return result;
  }

  async function fetchCourseQuizResults(courseId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/courses/${courseId}/quiz-results`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  // #228 — public like fetchPosts below: CourseDetailModal shows reviews to
  // anyone browsing the catalogue, logged in or not, so this needs no auth
  // header.
  async function fetchCourseReviews(courseId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/courses/${courseId}/reviews`);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function fetchPosts(moduleId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/forum`);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function createPost(moduleId, content, parentPostId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/forum`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      // parentPostId omitted entirely (not sent as null) when this is a
      // top-level post — the backend DTO's @IsOptional() only skips
      // validation for a genuinely missing key, not an explicit null.
      body: JSON.stringify(parentPostId ? { content, parentPostId } : { content }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const result = await res.json();
    refetchActivitySummary();
    // #291 — a post/reply can create a notification server-side: the
    // first-ever-post badge, or (for replies specifically) notifying the
    // parent post's author. Same reasoning as submitQuiz/saveProgress —
    // without this the bell doesn't update until an unrelated refetch.
    refetchNotifications();
    return result;
  }

  async function editPost(moduleId, postId, content) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/forum/${postId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    // No activity refetch here — editing isn't new activity, deliberately
    // (an unlimited edit loop shouldn't be a way to farm streak points).
    return res.json();
  }

  // #143 — course form's locked provider field. Reads from the backend
  // (profiles.name) rather than the client-cached Supabase user_metadata
  // set once at signup — the two happen to match today, but only the
  // backend value stays correct once a profile-editing feature exists.
  async function fetchMyProfile() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  // #107 — called by GoalOnboardingModal when a learner taps a category.
  // Throws on failure (the modal catches it and lets them retry) rather
  // than swallowing the error, unlike most fire-and-forget calls in this
  // file — this one has a visible loading/retry state in its caller.
  async function updateGoal(goal) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ goal }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const updated = await res.json();
    setLearnerGoal(updated.goal);
    setShowGoalOnboarding(false);
  }

  function skipGoalOnboarding() {
    setShowGoalOnboarding(false);
  }

  // #186 — called by RoleOnboardingModal when a Google sign-up picks
  // learner or trainer. Writes both halves of the role split found while
  // building this: `profiles.role` (what RequireTrainerGuard actually
  // authorizes trainer-only endpoints against) via the backend, and
  // Supabase Auth's user_metadata.role (what the `role` variable above —
  // and therefore all frontend nav/route gating — reads) via updateUser().
  // The updateUser() call fires a USER_UPDATED auth-state-change event that
  // AuthContext's existing listener already picks up, so `user` refreshes
  // on its own with no extra plumbing here.
  async function updateRole(role) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/profiles/me/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const { error } = await supabase.auth.updateUser({ data: { role } });
    if (error) throw error;

    const updated = await res.json();
    setProfileRole(updated.role);
    setShowRoleOnboarding(false);
  }

  // #139 — Team tab. GET /providers/me 404s for "not a member of a
  // provider" (see ProvidersService.getMine) — that's a normal, expected
  // state here (the no-provider view), not an error, so it's translated
  // to null rather than thrown.
  async function fetchMyProvider() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/providers/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function createProvider(name) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  async function joinProvider(inviteCode) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/providers/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ inviteCode }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  async function regenerateInviteCode() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/providers/invite-code/regenerate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    return res.json();
  }

  async function leaveProvider() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/providers/leave`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }
  }

  // #227 — trainer-only, course-owner-gated on the backend
  // (RequireCourseOwnerGuard, same stack as PUT/DELETE /courses/:id) —
  // exposes individual learners' names/progress, so this is never a public
  // fetch like fetchCourseReviews above.
  async function fetchCourseAnalytics(courseId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/courses/${courseId}/analytics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  // #259 — the cross-course rollup that powers Trainer Studio's stats
  // panel. Same trainer-only gating as fetchCourseAnalytics above, but not
  // course-owner-gated (there's no single course id to check ownership
  // against) — the backend scopes the counts to whatever this caller owns
  // or shares via their own provider.
  async function fetchTrainerOverview() {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/courses/trainer-overview`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function fetchQuizForEdit(moduleId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/quiz/edit`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function saveQuiz(moduleId, payload) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/modules/${moduleId}/quiz`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message || `Request failed: ${res.status}`;
      throw new Error(message);
    }

    return res.json();
  }

  // #275 — course editor calls this per module as the trainer edits its
  // video URL, to show a computed time estimate instead of requiring a
  // manual guess. Never throws: an unsupported/unrecognized source, a
  // missing server-side API key, and a network error are all represented
  // the same way ({ supported: false }) by the backend, so the caller
  // always has a value to fall back to rather than a rejected promise to
  // catch.
  async function fetchVideoDuration(url) {
    const res = await fetch(
      `${process.env.REACT_APP_API_URL}/courses/video-duration?url=${encodeURIComponent(url)}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    );
    if (!res.ok) return { supported: false, seconds: null };
    return res.json();
  }

  function handleAuthSubmit(session) {
    setAuthMode(null);
    if (pendingCourse) {
      // #318 — pass this parameter (the session AuthModal just got back
      // from Supabase) explicitly, rather than letting completeEnrol fall
      // back to its default. This function runs synchronously, in the
      // same tick as the signup/login response — AuthContext's own
      // `session` state hasn't been updated by its onAuthStateChange
      // listener yet at this exact point (that's a React state update,
      // which needs a render to take effect), so completeEnrol's default
      // parameter would still resolve to the pre-login (null) value here.
      completeEnrol(pendingCourse, session);
      setPendingCourse(null);
      // #207 — this (synchronous email-signup) path resolves the pending
      // enrollment directly, so the sessionStorage mirror handleEnrol set
      // is no longer needed — clear it so a later, unrelated signup on
      // this browser can't pick up a stale value.
      sessionStorage.removeItem(PENDING_ENROL_STORAGE_KEY);
    } else if (pendingPath) {
      // #224 — mirrors the pendingCourse branch above, but deliberately
      // without #207's sessionStorage mirror: a logged-out learner picking
      // Google sign-in (a full-page redirect that clears this in-memory
      // state) will lose a pending path enrol and just land on Catalogue
      // needing to click Enrol again. Documented, known gap rather than
      // silently attempted — scoped out to keep this feature's surface
      // area contained.
      //
      // #318 — passing `session` explicitly here for the same reason as
      // the completeEnrol call above: this had the identical stale-session
      // bug (the old comment here claiming "the synchronous email-signup
      // path here works fine" was wrong — it hit the same failure as
      // completeEnrol, just for path enrollment instead of course
      // enrollment).
      completeEnrolPath(pendingPath, session);
      setPendingPath(null);
    } else {
      navigate("/dashboard");
    }
  }

  async function handleLogout() {
    // #fix-stale-token-onboarding-modal — signOut()'s default scope is
    // "global", which revokes this account's session everywhere it's
    // logged in (any other tab/device), not just this one — logging out
    // here to switch accounts was silently kicking out every other
    // session for the same account too. "local" only clears this tab's
    // session, matching what "Log out" actually reads as to the user.
    await supabase.auth.signOut({ scope: "local" });
    navigate("/");
  }

  // #187 — called by ResetPasswordModal once the PASSWORD_RECOVERY session
  // (from clicking the emailed reset link) is used to actually set a new
  // password. Throws on failure — same "let the modal show the error and
  // allow retry" contract as updateGoal/updateRole above — rather than
  // swallowing it here.
  async function handleSetNewPassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    clearPasswordRecovery();
    setToast("Password updated");
    setTimeout(() => setToast(null), 2600);
  }

  function handleEnrol(course) {
    if (!loggedIn) {
      setPendingCourse(course);
      setSelectedCourse(null);
      setAuthMode("signup");
      // #207 — mirrored to sessionStorage so the enrollment can still be
      // completed if the learner picks Google from the auth modal (see
      // PENDING_ENROL_STORAGE_KEY above).
      sessionStorage.setItem(PENDING_ENROL_STORAGE_KEY, course.id);
      return;
    }
    completeEnrol(course);
  }

  function handleEnrolPath(path) {
    if (!loggedIn) {
      setPendingPath(path);
      setSelectedPath(null);
      setAuthMode("signup");
      return;
    }
    completeEnrolPath(path);
  }

  function handleStartLearning(course) {
    navigate(`/learning/${course.id}`);
  }

  async function viewCertificate(enrollmentId) {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/enrollments/${enrollmentId}/certificate`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Request failed: ${res.status}`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
    // Revoke after a delay rather than immediately — the new tab needs
    // time to actually load the blob URL before it's invalidated.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }

  // #247 — "home" (screenKeyFromPath's fallback for "/") is now included
  // here too: it used to be hardcoded as "Home" directly on the "/"
  // route's AppShell below, which had silently drifted out of sync with
  // AppSidebar's own label for that same nav item ("Discover") — the
  // topbar title and the sidebar's active nav item should always say the
  // same thing for whatever page is actually showing.
  const shellTitle =
    screen === "dashboard" ? "My learning" :
    screen === "catalogue" ? "Catalogue" :
    screen === "learning" ? (coursesForLearners.find((c) => `/learning/${c.id}` === location.pathname)?.title ?? "") :
    screen === "leaderboard" ? "Leaderboard" :
    screen === "settings" ? "Account settings" :
    screen === "trainer" ? "Trainer studio" :
    screen === "privacy" ? "Privacy & GDPR" :
    screen === "about" ? "About us" :
    screen === "home" ? "Discover" : "";

  if (authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ fontSize: 13, color: "var(--slate-light)" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="enc-root">
      {/* #367 — single Suspense boundary for every lazy-loaded route above;
          a route-level fallback (rather than one per-screen) since only one
          route is ever mounted at a time here. Kept visually consistent
          with the authLoading state above it. */}
      <React.Suspense
        fallback={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <div style={{ fontSize: 13, color: "var(--slate-light)" }}>Loading…</div>
          </div>
        }
      >
      <Routes>
        <Route
          path="/"
          element={
            loggedIn ? (
              <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                {/* #247 — the logged-in-only discovery sections (Recommended/
                    New on Encyclopedia/Learning paths/Leaderboard teaser) reuse
                    the exact same data + handlers already wired up for
                    Catalogue/Dashboard below, rather than fetching anything
                    new. The logged-out branch of HomeScreen (right below)
                    deliberately isn't touched — it doesn't need any of these. */}
                <HomeScreen
                  onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)}
                  onAuth={openAuth}
                  courses={courses}
                  loggedIn={loggedIn}
                  user={user}
                  enrolled={enrolled}
                  onOpenCourse={setSelectedCourse}
                  enrolledIds={enrolledIds}
                  goal={learnerGoal}
                  learningPaths={learningPaths}
                  onOpenPath={setSelectedPath}
                  enrolledPathIds={pathEnrollments.map((pe) => pe.pathId)}
                  leaderboardOptIn={leaderboardOptIn}
                  onFetchLeaderboard={fetchLeaderboard}
                  loading={coursesLoading}
                />
              </AppShell>
            ) : (
              // #366 — the only route that doesn't render through AppShell
              // (logged-out "/" renders HomeScreen standalone, right above
              // in the loggedIn branch it's inside AppShell's own <main>),
              // so it was the one page still missing the landmark AppShell
              // now provides everywhere else. Wrapped here rather than
              // inside HomeScreen itself, since HomeScreen is also used
              // for the logged-in "/" route nested inside AppShell's
              // <main> — a <main> in there too would nest two on that
              // path, which is invalid.
              <main>
                <HomeScreen onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)} onAuth={openAuth} courses={courses} loggedIn={loggedIn} user={user} enrolled={enrolled} />
              </main>
            )
          }
        />

        <Route
          path="/catalogue"
          element={
            <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
              <CatalogueScreen
                loggedIn={loggedIn}
                onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)}
                onAuth={openAuth}
                onOpenCourse={setSelectedCourse}
                enrolledIds={enrolledIds}
                courses={courses}
                loading={coursesLoading}
                goal={learnerGoal}
                learningPaths={learningPaths}
                onOpenPath={setSelectedPath}
                enrolledPathIds={pathEnrollments.map((pe) => pe.pathId)}
                pathsLoading={learningPathsLoading}
                bookmarkedIds={bookmarkedIds}
                onToggleBookmark={loggedIn ? toggleBookmark : undefined}
              />
            </AppShell>
          }
        />

        {/* #345 — publicly accessible like /catalogue above (no
            RequireAuth): a privacy policy needs to be readable before
            someone creates an account, and the footer link that points
            here (#337) shows on every page regardless of login state. */}
        <Route
          path="/privacy"
          element={
            <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
              <PrivacyScreen loggedIn={loggedIn} onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)} onAuth={openAuth} />
            </AppShell>
          }
        />

        {/* #346 — same public-access shape as /privacy above. */}
        <Route
          path="/about"
          element={
            <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
              <AboutScreen loggedIn={loggedIn} onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)} onAuth={openAuth} />
            </AppShell>
          }
        />

        <Route
          path="/dashboard"
          element={
            <RequireAuth loggedIn={loggedIn}>
              <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                <DashboardScreen
                  enrolled={enrolled}
                  badges={badges}
                  onOpenCourse={setSelectedCourse}
                  onStartLearning={handleStartLearning}
                  courses={coursesForLearners}
                  onViewCertificate={viewCertificate}
                  onRetake={retakeCourse}
                  user={user}
                  goal={learnerGoal}
                  activitySummary={activitySummary}
                  loading={coursesLoading || enrolledLoading}
                  error={coursesError || enrolledError}
                  onRetry={retryDashboard}
                  calendarWeekOffset={calendarWeekOffset}
                  onPrevWeek={() => setCalendarWeekOffset((n) => n - 1)}
                  onNextWeek={() => setCalendarWeekOffset((n) => n + 1)}
                  pathEnrollments={pathEnrollments}
                  bookmarks={bookmarks}
                  onToggleBookmark={toggleBookmark}
                  leaderboardOptIn={leaderboardOptIn}
                  onOpenLeaderboard={() => navigate("/leaderboard")}
                  // #398 — same shape as HomeScreen's onGo just above: a
                  // route key in, a navigate() call out. Lets the empty
                  // "Continue learning" state link straight to Catalogue.
                  onGo={(key) => navigate(key === "home" ? "/" : `/${key}`)}
                />
              </AppShell>
            </RequireAuth>
          }
        />

        <Route
          path="/leaderboard"
          element={
            <RequireAuth loggedIn={loggedIn}>
              <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                <LeaderboardScreen onFetchLeaderboard={fetchLeaderboard} />
              </AppShell>
            </RequireAuth>
          }
        />

        {/* #255 — Account settings. Same RequireAuth+AppShell wrapper shape
            as /leaderboard right above; onUpdateDailyGoal/
            onUpdateLeaderboardOptIn moved here from DashboardScreen's props
            (see DashboardScreen.jsx's own #255 comment) — the /dashboard
            route above keeps leaderboardOptIn/onOpenLeaderboard only, for
            its now-read-only "View leaderboard" link. */}
        <Route
          path="/settings"
          element={
            <RequireAuth loggedIn={loggedIn}>
              <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                <SettingsScreen
                  user={user}
                  onUpdateName={updateName}
                  onChangePassword={changePassword}
                  activitySummary={activitySummary}
                  onUpdateDailyGoal={updateDailyGoal}
                  leaderboardOptIn={leaderboardOptIn}
                  onUpdateLeaderboardOptIn={updateLeaderboardOptIn}
                  onOpenLeaderboard={() => navigate("/leaderboard")}
                />
              </AppShell>
            </RequireAuth>
          }
        />

        <Route
          path="/learning/:courseId"
          element={
            <RequireAuth loggedIn={loggedIn}>
              <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                <LearningRoute
                  courses={coursesForLearners}
                  enrolled={enrolled}
                  coursesLoading={coursesLoading}
                  enrolledLoading={enrolledLoading}
                  onSaveProgress={saveProgress}
                  onSubmitRating={submitRating}
                  onLogModuleView={logModuleView}
                  onFetchQuiz={fetchQuiz}
                  onSubmitQuiz={submitQuiz}
                  onFetchQuizResults={fetchCourseQuizResults}
                  onFetchNote={fetchNote}
                  onSaveNote={saveNote}
                  onFetchPosts={fetchPosts}
                  onCreatePost={createPost}
                  onEditPost={editPost}
                  currentUserId={user?.id}
                  onUnenrol={unenrolCourse}
                />
              </AppShell>
            </RequireAuth>
          }
        />

        <Route
          path="/trainer"
          element={
            <RequireAuth loggedIn={loggedIn}>
              <RequireTrainer role={role}>
                <AppShell loggedIn={loggedIn} role={role} onLogout={handleLogout} title={shellTitle} user={user} goal={learnerGoal} notifications={notifications} unreadCount={unreadCount} onOpenNotification={handleOpenNotification}>
                  <TrainerScreen
                    courses={courses}
                    onSaveCourse={saveCourse}
                    onDeleteCourse={deleteCourse}
                    onFetchQuizForEdit={fetchQuizForEdit}
                    onSaveQuiz={saveQuiz}
                    onFetchProvider={fetchMyProvider}
                    onFetchProfile={fetchMyProfile}
                    onFetchVideoDuration={fetchVideoDuration}
                    onCreateProvider={createProvider}
                    onJoinProvider={joinProvider}
                    onRegenerateInviteCode={regenerateInviteCode}
                    onLeaveProvider={leaveProvider}
                    currentUserId={user?.id}
                    paths={learningPaths}
                    onSavePath={savePath}
                    onDeletePath={deletePath}
                    onFetchCourseAnalytics={fetchCourseAnalytics}
                    onFetchOverview={fetchTrainerOverview}
                  />
                </AppShell>
              </RequireTrainer>
            </RequireAuth>
          }
        />

        {/* Fallback: unknown paths go home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </React.Suspense>

      <CourseDetailModal
        course={selectedCourse}
        onClose={() => setSelectedCourse(null)}
        onEnrol={handleEnrol}
        onGoToDashboard={() => { setSelectedCourse(null); navigate("/dashboard"); }}
        isEnrolled={selectedCourse ? enrolledIds.includes(selectedCourse.id) : false}
        enrolling={enrolling}
        onFetchReviews={fetchCourseReviews}
      />

      <LearningPathDetailModal
        path={selectedPath}
        onClose={() => setSelectedPath(null)}
        onEnrol={handleEnrolPath}
        onGoToDashboard={() => { setSelectedPath(null); navigate("/dashboard"); }}
        isEnrolled={selectedPath ? pathEnrollments.some((pe) => pe.pathId === selectedPath.id) : false}
        enrolling={enrollingPath}
        onOpenCourse={(course) => {
          setSelectedPath(null);
          // #360-fix — path-embedded course rows only carry the lightweight
          // relations learning-paths.service.ts loads (no modules/credits),
          // but CourseDetailModal reads both unconditionally and crashes on
          // undefined. Swap in the full catalogue copy when we have it;
          // fall back to the lightweight object for the rare case where the
          // course has since left the public catalogue.
          const fullCourse = courses.find((c) => c.id === course.id) || course;
          setSelectedCourse(fullCourse);
        }}
      />

      <AuthModal
        mode={authMode}
        onClose={() => {
          setAuthMode(null);
          setPendingCourse(null);
          setPendingPath(null);
          // #207 — closing without completing signup abandons the intent
          // to enrol; clear the sessionStorage mirror too so it can't
          // surface as a surprise auto-enrol on some later, unrelated
          // signup in this browser.
          sessionStorage.removeItem(PENDING_ENROL_STORAGE_KEY);
        }}
        onSubmit={handleAuthSubmit}
      />

      <RoleOnboardingModal
        open={showRoleOnboarding}
        onSelect={updateRole}
      />

      <ResetPasswordModal
        open={passwordRecovery}
        onSubmit={handleSetNewPassword}
        onClose={clearPasswordRecovery}
      />

      <GoalOnboardingModal
        open={showGoalOnboarding}
        onSelect={updateGoal}
        onSkip={skipGoalOnboarding}
      />

      {toast && (
        <div
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "var(--ink)", color: "var(--paper)", padding: "12px 20px",
            borderRadius: 10, fontSize: 13.5, fontWeight: 500, display: "flex",
            alignItems: "center", gap: 8, zIndex: 60,
          }}
        >
          <CheckCircle2 size={16} color="var(--gold)" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- Default export: wraps in BrowserRouter ---------- */
export default function App() {
  return (
    <BrowserRouter>
      <EncyclopediaPrototype />
    </BrowserRouter>
  );
}