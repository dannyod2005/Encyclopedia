import { useState } from "react";
import { createPortal } from "react-dom";
import { PlayCircle, CheckCircle2, Award, ChevronLeft, ChevronRight, Flame, Medal, Bookmark, Trophy, X, RotateCcw } from "lucide-react";

import { EncyclopediaArch, ScreenMessage } from "../components/common/Primitives";
import { getDisplayName, getFirstName } from "../lib/userDisplay";
import { useFocusTrap } from "../hooks/useFocusTrap";
/* ---------- Screen: Dashboard ---------- */

// #296 — 1500, not 300: matches the recalibrated signup default (see
// SettingsScreen's DAILY_GOAL_PRESETS comment for why).
const DEFAULT_ACTIVITY_SUMMARY = { streak: 0, pointsThisWeek: 0, dailyGoalPoints: 1500, goalHitDays: 0, week: [] };

// (461 — site-wide CLS audit, dashboard-scrollbar fix follow-up) — this
// used to be a fixed 340px cap shared between the loading skeleton and
// the real notStarted/continuing/complete list content below, so the
// left column's height was identical whether it was showing placeholders
// or real rows, regardless of how many rows a given learner actually
// had. That fixed height meant this panel was capped well short of the
// right column's own height (badges/skills/saved/leaderboard teaser),
// leaving unused space below it, and produced a visible internal
// scrollbar as soon as the three lists combined passed 340px — common,
// since that's three independently variable-length lists in one panel.
// Replaced with a flex-based layout (see the left column wrapper below)
// so the panel fills whatever height the right column actually drives
// instead of a hardcoded number — the loading skeleton and real content
// use the identical flex shape, so they still land on the same height as
// each other (the CLS-audit guarantee this constant used to provide),
// just no longer a fixed value.

// #398 — onGo added: Dashboard previously had no navigation callback at
// all (HomeScreen's own onGo covers its logged-in "Continue" card, but
// nothing here), so the empty "Continue learning" state below had no
// way to send a learner to the Catalogue. Same prop name/shape as
// HomeScreen's onGo (a single key -> route callback), wired the same
// way from App.jsx, so any other section on this screen that turns out
// to need navigation later can reuse it rather than inventing another
// prop.
export function DashboardScreen({ enrolled, badges = [], badgesLoading = false, pathEnrollments = [], pathEnrollmentsLoading = false, bookmarks = [], bookmarksLoading = false, onToggleBookmark, onOpenCourse, onStartLearning, courses, onViewCertificate, onRetake, user, goal = null, profileLoaded = true, activitySummary = DEFAULT_ACTIVITY_SUMMARY, activitySummaryLoading = false, loading = false, error = false, onRetry, calendarWeekOffset = 0, onPrevWeek, onNextWeek, leaderboardOptIn = false, onOpenLeaderboard, onGo }) {
  const firstName = getFirstName(getDisplayName(user));
  // #365 — was also shared with a plain Unenroll flow triggered from the
  // Not-started/Continue-learning cards below (kebab menu, then an
  // Edit-mode toggle). Unenroll now lives inside LearningScreen instead
  // (opening a course is the natural place to leave it — see that
  // screen's own header), so this state/modal only ever handles Retake
  // on a completed course now; kept the original naming's shape (pending
  // item + error + busy flag, same trio TrainerScreen's delete-course
  // confirm uses) rather than introducing a parallel one.
  const [retakingCourse, setRetakingCourse] = useState(null);
  const [retakeError, setRetakeError] = useState(null);
  const [retaking, setRetaking] = useState(false);

  // #360 — no deferred-unmount here (unlike the standalone modal
  // components): the modal is a simple `retakingCourse &&` conditional
  // mount, so active ties directly to that same truthiness.
  const retakeDialogRef = useFocusTrap(!!retakingCourse);

  const inProgress = enrolled.filter((e) => e.status === "in-progress");
  const complete = enrolled.filter((e) => e.status === "complete");
  // #86 — "in-progress" (not yet complete) splits into two display groups:
  // genuinely started (progress > 0) vs. enrolled but never opened
  // (progress === 0, no lastAccessed yet — the two are set together in
  // the same backend call, so either is an equivalent signal). Kept as a
  // separate split from `inProgress` above rather than redefining it, so
  // non-complete enrollment, same as before — only the list rendering
  // distinguishes the two.
  const enrolledCourseCount = inProgress.length + complete.length;
  const notStarted = inProgress.filter((e) => e.progress === 0);
  const continuing = inProgress.filter((e) => e.progress > 0);

  // #226 — learner skills profile: unique skill tags aggregated from every
  // completed course. Same courses.find(...) lookup already used for the
  // "Completed" list above, so this naturally inherits its behavior for a
  // completed enrollment whose course was later deleted from the
  // catalogue (c is undefined, filtered out — see EnrolledCourseDto's
  // deliberately minimal shape, which carries no skills field).
  const skillsLearned = Array.from(
    new Set(
      complete.flatMap((e) => courses.find((x) => x.id === e.courseId)?.skills ?? []),
    ),
  );

  // #230 — bookmarked-but-not-enrolled courses (or bookmarked while also
  // enrolled — bookmarking has no effect on enrollment state either way,
  // per the issue's acceptance criteria, so no filtering against
  // `enrolled` here). Same courses.find(...) + drop-if-missing pattern as
  // every other section on this screen (a bookmark whose course has since
  // been soft-deleted from the catalogue just silently disappears here,
  // same as a completed enrollment would for skillsLearned above).
  const savedCourses = bookmarks
    .map((b) => courses.find((x) => x.id === b.courseId))
    .filter(Boolean);

  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthLabel = activitySummary.week[0]
    ? new Date(`${activitySummary.week[0].date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  async function handleViewCertificate(enrollmentId) {
    try {
      await onViewCertificate(enrollmentId);
    } catch (err) {
      console.error("Failed to load certificate:", err.message);
    }
  }

  // #300/#365 — hits the combined retake endpoint (unenrol + re-enrol as
  // one action, see EnrollmentsService.retake). No longer branches on an
  // isComplete flag — this modal only ever fires from the Completed
  // section's Retake button now.
  async function handleConfirmRetake() {
    setRetaking(true);
    setRetakeError(null);
    try {
      await onRetake(retakingCourse.enrollmentId);
      setRetakingCourse(null);
    } catch (err) {
      setRetakeError(err.message || "Failed to retake.");
    } finally {
      setRetaking(false);
    }
  }

  // #204/#213 — Catalogue/Discover center their content (maxWidth +
  // margin: "0 auto"); this only ever had the maxWidth half, so on a wide
  // viewport it hugged the left edge instead of centering like the rest
  // of the app (#204). maxWidth was later raised from 1080 to 1160 to
  // match Catalogue/Discover exactly (#213) — the 2fr/1fr stats+calendar
  // layout below just gets a little more breathing room at that width,
  // nothing structural needed changing.
  //
  // #332 — the 1160 cap held even on very large monitors, leaving a big
  // fixed gutter either side. Moved to the shared .enc-page-wide class
  // (global.css) so >=1440px viewports get more usable width instead;
  // below that breakpoint this renders identically to before.
  return (
    /* (tablet-padding fix) — horizontal padding now comes from the
       shared .enc-outer-pad scale instead of a flat 32px at every
       width; vertical stays inline. */
    <div className="enc-page-enter enc-page-wide enc-outer-pad" style={{ paddingTop: 28, paddingBottom: 28 }}>
      {/* #364 — was <PageHeader title="My learning" />: AppTopbar already
          shows that exact text as this route's h1, so this was a plain
          duplicate rather than added context (unlike Catalogue's
          subtitle, say). Dropped entirely rather than kept as a bare
          wrapper — the greeting card right below already carries its
          own personalized context (name, goal, streak). */}
      <div className="enc-card" style={{ padding: "20px 24px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Good morning, {firstName}</div>
          {/* #107 — goal is null until a learner picks one via the
              onboarding modal (or if they skipped it); hidden entirely
              once we actually know there isn't one.
              (461 follow-up) — goal/leaderboardOptIn come from the same
              profile fetch, which defaults goal to null and
              leaderboardOptIn to false before it resolves (see App.jsx's
              goalLoaded) — so a learner who *does* have a goal set used
              to see this line pop in after a beat, same 0-default class
              of bug. profileLoaded (App.jsx's goalLoaded) distinguishes
              "not fetched yet" from "fetched, confirmed no goal" so this
              only ever renders a skeleton for a learner who's actually
              going to get a real line here. */}
          {!profileLoaded ? (
            <div aria-hidden="true" style={{ width: 130, height: 13, borderRadius: 4, background: "var(--line)", marginTop: 6 }} />
          ) : goal ? (
            <div style={{ fontSize: 13, color: "var(--slate)", marginTop: 2 }}>Your goal: <b style={{ color: "var(--ink)" }}>{goal}</b></div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--gold-tint)", padding: "8px 14px", borderRadius: 100 }}>
          <Flame size={16} color="var(--gold-dark)" />
          {/* (461 follow-up) — activitySummary defaults to streak: 0 until
              its own fetch resolves (see App.jsx's activitySummaryLoading),
              independently of `loading` (courses/enrolled) above — so this
              used to always flash "0-day streak" first. Same pill size
              either way, just a placeholder bar instead of "0-day streak"
              while unresolved. */}
          {activitySummaryLoading ? (
            <div aria-hidden="true" style={{ width: 70, height: 13, borderRadius: 4, background: "var(--gold-dark)", opacity: 0.3 }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold-dark)" }}>{activitySummary.streak}-day streak</span>
          )}
        </div>
      </div>

      {/* #104 — single column on mobile, 2fr/1fr from md up; column layout
          is the only breakpoint-dependent property here. */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr]" style={{ gap: 20 }}>
        {/* (dashboard-scrollbar fix) — a grid item stretches to match the
            row's height by default (align-items: stretch), so this column
            is already as tall as the right column below once that column
            is taller — the missing piece was that this div's own content
            didn't use that extra height. display:flex + flexDirection:
            column lets the list panel inside (flex:1, below) fill it,
            instead of the panel stopping at a fixed height and leaving
            unused space beneath it. */}
        {/* (grid-blowout fix) — this column is a CSS Grid item (parent:
            grid grid-cols-1 md:grid-cols-[2fr_1fr] above), and grid items
            default to min-width/min-height: auto, which resolves to the
            item's own *content's* min-content size, not 0 — every
            "scroll internally instead of growing the page" trick further
            down this column (flex:1 + minHeight:0 + overflowY:auto on the
            course-list panel below) only works once the item itself stops
            being forced open by that default. Without minWidth/minHeight:0
            here, the column's automatic minimum is the full unscrolled
            height of every "Start my learning"/"Continue learning"/
            "Completed" row combined (unbounded by how many courses a
            learner has), so the grid row — and the whole page — stretched
            to fit that instead of clipping, which is what made the right
            column look pressed against the edge with no padding
            (min-width:auto let this column's content push past its 2fr
            share on narrow tablet widths, squeezing the 1fr column) and
            made the page stretch taller than the viewport on refresh once
            real content replaced the loading skeleton (sidebar/topbar
            correctly track 100dvh of the real viewport; this column didn't
            have a matching ceiling). */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {loading ? (
            // #367 — was a single short "Loading your learning…" card,
            // nowhere near the height of the real stat-cards + list-rows
            // content it's replaced by once `enrolled`/`courses` resolve —
            // Lighthouse's CLS audit flagged exactly this column
            // (div.grid.grid-cols-1.md:grid-cols-[2fr_1fr]) as the biggest
            // shift on this page. Can't know a learner's real row counts
            // ahead of time, but three stat-card placeholders + three list
            // rows approximates a typical dashboard's footprint far closer
            // than a single line of text did, so the real content swapping
            // in doesn't move the page by nearly as much.
            <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="enc-card" style={{ flex: 1, minWidth: 140, padding: 16 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--line)", marginBottom: 10 }} />
                    <div style={{ width: 28, height: 22, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                    <div style={{ width: 70, height: 12, borderRadius: 4, background: "var(--line)" }} />
                  </div>
                ))}
              </div>
              {/* (461 — site-wide CLS audit, dashboard-scrollbar fix
                  follow-up) — notStarted/continuing/complete are three
                  separate, independently variable-length lists that all
                  render in this same column once loaded, so no fixed row
                  count could ever approximate the real total. This panel
                  and the real content's equivalent (below) both use
                  flex:1 to fill whatever height the flex column above
                  gives them, so the skeleton and real content still land
                  on the same height as each other by construction — no
                  longer a shared fixed pixel value, but the same
                  mechanism applied identically to both. minHeight:0 is
                  required for a flex child to actually shrink/scroll
                  instead of forcing its content's full size upward. */}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="enc-card" style={{ padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--line)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ width: "55%", height: 14.5, borderRadius: 4, background: "var(--line)", marginBottom: 8 }} />
                      <div style={{ width: "35%", height: 12.5, borderRadius: 4, background: "var(--line)" }} />
                    </div>
                    <div style={{ width: 110, height: 44, borderRadius: 10, background: "var(--line)", flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          ) : error ? (
            // #289 — courses/enrolled failing (or just timing out — see
            // fetchWithTimeout in App.jsx) used to leave this stuck on the
            // "Loading…" branch above forever, since neither loading flag
            // ever resolved. Now that they always resolve, a real failure
            // lands here instead: a friendly message and a retry button
            // rather than silently showing nothing or requiring a full
            // reload.
            // #454 — this was the original hand-rolled version of the
            // pattern now shared via ScreenMessage (see Primitives.jsx) —
            // every other screen's failed-to-load state now matches this
            // one instead of drifting into its own styling/copy.
            <ScreenMessage variant="error" message="Couldn't load your learning — please try again." onRetry={onRetry} />
          ) : (
          <>
          <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
            {[
              { label: "In progress", value: inProgress.length, icon: PlayCircle, tint: "var(--gold-tint)", fg: "var(--gold-dark)" },
              { label: "Completed", value: complete.length, icon: CheckCircle2, tint: "var(--success-tint)", fg: "var(--success)" },
              { label: "Certificates", value: complete.length, icon: Award, tint: "var(--coral-tint)", fg: "var(--coral)" },
            ].map((s) => (
              <div key={s.label} className="enc-card" style={{ flex: 1, minWidth: 140, padding: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: s.tint, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                  <s.icon size={15} color={s.fg} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{s.value}</div>
                <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* (461 — site-wide CLS audit, dashboard-scrollbar fix follow-up)
              — notStarted/continuing/complete are three independently
              variable-length lists; wrapping all three in one panel means
              this column's total height never depends on how many rows a
              given learner actually has — it scrolls internally past that
              point instead of growing the page. Was a fixed maxHeight
              (340px) shared with the loading skeleton above; now flex:1
              so it fills whatever height the right column's own content
              actually drives (via the flex column wrapper higher up +
              CSS Grid's default row-stretch behavior) instead of a
              hardcoded number that left the panel shorter than the right
              column and produced a scrollbar as soon as the three lists
              combined passed 340px. enc-scroll-hidden keeps this
              scrollable without showing a visible scrollbar. */}
          <div className="enc-scroll-hidden" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {notStarted.length > 0 && (
            <>
              {/* #rename-not-started-section-label — "Not started" read as
                  flat/administrative next to the warmer greeting above;
                  same section, same contents (enrolled, progress === 0),
                  just a more inviting label. */}
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 12 }}>Start my learning</div>
              {notStarted.map((e) => {
                const c = courses.find((x) => x.id === e.courseId);
                if (!c) return null;
                return (
                  // #365 — a full-height slab, a same-row coral icon, a
                  // per-card kebab menu, and a shared Edit-mode toggle all
                  // fought the gold Start button for attention or added
                  // extra clicking. Settled on: a single large gold
                  // button, the only accent color on the card — Unenroll
                  // moved into LearningScreen instead (opening a course is
                  // the natural place to leave it, matching how Udemy/
                  // Coursera keep it inside the course rather than on the
                  // list card).
                  <div key={e.courseId} className="enc-card gap-2 sm:gap-4" style={{ padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center" }}>
                    <EncyclopediaArch progress={0} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* (dashboard-phone fix) — was unbounded: with no
                          overflow control, a long title didn't wrap
                          cleanly inside this flex row's shrunk space, it
                          spilled past its own box and visually collided
                          with the Start button next to it. Truncating to
                          one line with an ellipsis (same pattern as
                          LearningScreen's grades-panel module names)
                          keeps the row a fixed height and the button
                          clear of it at any width. */}
                      <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                      {/* (dashboard-card-encouraging-subtitle) — "not started
                          yet" undercut the "Start my learning" section
                          header's own deliberately inviting rename (see the
                          comment above this section) by sitting right next
                          to the Start button and reading as a mild guilt-trip
                          instead of an invitation. Client-requested copy
                          swap, same tone as that earlier rename. */}
                      <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>
                        {c.modules.length} module{c.modules.length === 1 ? "" : "s"} · ready to learn
                      </div>
                    </div>
                    {/* #restyle-dashboard-start-button — dark ink fill,
                        white text (enc-btn-primary), chosen after
                        comparing against gold-toned variants live on
                        this dashboard. Shared with the Resume button
                        below.
                        (dashboard-phone fix) — padding/font-size moved
                        from a flat inline value to responsive Tailwind
                        classes (inline styles can't respond to
                        breakpoints) so this button is smaller on a phone,
                        where the fixed 14px/28px padding at 15.5px bold
                        text left too little room next to the title. Sizes
                        from sm up are unchanged from the original. */}
                    <button
                      className="enc-btn enc-btn-primary px-4 py-2.5 text-sm sm:px-7 sm:py-3.5 sm:text-[15.5px]"
                      style={{ flexShrink: 0, fontWeight: 700, borderRadius: 10, gap: 8 }}
                      onClick={() => onStartLearning(c)}
                    >
                      Start <ChevronRight size={18} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* #410 — "Continue learning" used to render an empty-state
              catalogue prompt any time continuing.length === 0, even
              when notStarted.length > 0 (i.e. the learner already has
              an enrolled, actionable course sitting in "Start my
              learning" directly above). That's redundant/confusing —
              there's already a "Start" button right there, so telling
              the learner to go "browse the catalogue" points them
              somewhere else instead. "Start my learning" above already
              hides itself entirely when it has nothing to show
              (notStarted.length > 0 && (...) wrapper); this mirrors
              that same hide-when-redundant behavior here: only render
              this section+header when there's something in progress to
              list, or when there's truly nothing pending anywhere
              (notStarted also empty) — in which case the catalogue
              prompt is the only useful thing left to show. */}
          {(continuing.length > 0 || notStarted.length === 0) && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", margin: notStarted.length > 0 ? "24px 0 12px" : "0 0 12px" }}>Continue learning</div>
              {continuing.length === 0 ? (
                // #398 — was a flat "Nothing in progress yet." with no way
                // out. HomeScreen already solves this same empty state with
                // an encouraging message + a direct Catalogue link (see its
                // "Nothing in progress right now" card) — matching that copy
                // here rather than HomeScreen's other branch ("you haven't
                // started a course yet"), since that one would read as wrong
                // for a learner who has Start-my-learning or Completed
                // courses in the sections right above/below this one; this
                // message is scoped to "nothing in progress" specifically,
                // not "never touched this app." (#410 — only reachable now
                // when notStarted is also empty, i.e. genuinely nothing
                // pending anywhere.)
                <div className="enc-card" style={{ padding: 16, marginBottom: 12, fontSize: 13, color: "var(--slate-light)" }}>
                  Nothing in progress right now —{" "}
                  <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", color: "var(--gold-dark)", fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer" }}>browse the catalogue</button> to start something new.
                </div>
              ) : (
                continuing.map((e) => {
                  const c = courses.find((x) => x.id === e.courseId);
                  if (!c) return null;
                  return (
                    // #365 — same single-accent treatment as the Not-started
                    // row above.
                    <div key={e.courseId} className="enc-card gap-2 sm:gap-4" style={{ padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center" }}>
                      <EncyclopediaArch progress={e.progress} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* (dashboard-phone fix) — see the matching Start
                            button/row above: unbounded title text could
                            overflow its shrunk box and overlap the Resume
                            button on a phone. Truncated to one line with
                            an ellipsis instead. */}
                        <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                        <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>
                          {Math.round(e.progress * c.modules.length)} of {c.modules.length} modules · last opened {e.lastAccessed}
                        </div>
                        <div style={{ height: 5, background: "var(--line)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${e.progress * 100}%`, background: "var(--gold)" }} />
                        </div>
                      </div>
                      {/* (dashboard-phone fix) — same responsive
                          padding/font-size as the Start button above (this
                          is the button its own comment already calls out
                          as sharing that styling). */}
                      <button
                        className="enc-btn enc-btn-primary px-4 py-2.5 text-sm sm:px-7 sm:py-3.5 sm:text-[15.5px]"
                        style={{ flexShrink: 0, fontWeight: 700, borderRadius: 10, gap: 8 }}
                        onClick={() => onStartLearning(c)}
                      >
                        Resume <ChevronRight size={18} />
                      </button>
                    </div>
                  );
                })
              )}
            </>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", margin: "24px 0 12px" }}>Completed</div>
          {complete.map((e) => {
            const c = courses.find((x) => x.id === e.courseId);
            if (!c) return null;
            return (
              <div key={e.courseId} className="enc-card gap-2 sm:gap-4" style={{ padding: 16, marginBottom: 12, display: "flex", alignItems: "center" }}>
                <div style={{ width: 48, height: 30, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle2 size={22} color="var(--success)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* (dashboard-phone fix) — same truncation as the
                      Start/Resume rows above; this div was missing
                      minWidth:0 too, so it couldn't shrink at all. */}
                  <div style={{ fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>Completed {e.lastAccessed} · certificate issued</div>
                </div>
                {/* (dashboard-phone fix) — two labelled buttons
                    (View certificate/Retake) needed more width than a
                    phone row could give them next to the title. Labels
                    hide below sm (icon + aria-label only, same
                    icon-only-needs-an-accessible-name convention #258
                    used elsewhere — see Trainer Studio's course-row
                    buttons for the identical pattern).
                    (dashboard-tablet-buttons fix) — sm (640px) was too
                    low a bar here specifically: unlike Trainer Studio's
                    row (which spans nearly the full page), this row sits
                    inside Dashboard's left grid column, which is only
                    ~2/3 of the page's content width from md up — so at
                    tablet viewports (iPad Mini 768, Surface Pro 960) the
                    actual row width was still phone-like even though the
                    viewport itself had cleared sm.
                    (dashboard-tablet-buttons fix, round 2) — lg (1024px)
                    still wasn't enough: iPad Pro 13 (1024-1366) falls
                    just past lg but its own 2/3-column share still barely
                    shows any course-title text once both labels return.
                    Raised again to a dedicated wide (1440px) breakpoint —
                    same threshold global.css already uses to grow the
                    page's own max-width, i.e. actual large-desktop room,
                    not just "past the biggest common tablet." */}
                <button className="enc-btn enc-btn-ghost" aria-label="View certificate" onClick={() => handleViewCertificate(e.id)}>
                  <Award size={14} /> <span className="hidden wide:inline">View certificate</span>
                </button>
                {/* #300 — was "Unenroll": a finished course's most likely
                    next action is doing it again, not leaving it, and
                    "unenroll" read oddly for something already completed.
                    Still coral — resetting progress and losing certificate
                    access until it's completed again are real consequences
                    worth a confirm, same as before. */}
                {onRetake && (
                  <button
                    className="enc-btn enc-btn-ghost"
                    aria-label="Retake"
                    style={{ color: "var(--coral)" }}
                    onClick={() => { setRetakingCourse({ enrollmentId: e.id, title: c.title }); setRetakeError(null); }}
                  >
                    <RotateCcw size={14} /> <span className="hidden wide:inline">Retake</span>
                  </button>
                )}
              </div>
            );
          })}
          </div>
          </>
          )}
        </div>

        <div>
          <div className="enc-card" style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              {/* (461 follow-up) — monthLabel already falls back to the
                  real current month/year (not a placeholder-looking
                  string) when week[0] isn't in yet, so no skeleton needed
                  here — swapping "September 2026" for the same real
                  "September 2026" once data resolves isn't a shift. */}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {/* #183 — pages the day grid to an adjacent 7-day week;
                    "next" stops at the real current week — there's
                    nothing to look ahead to yet. */}
                {/* #258 — real buttons (were bare clickable icons). Next-
                    week now uses native `disabled` at the current week
                    rather than just an undefined onClick + styled-to-look-
                    disabled color/cursor — a real disabled button is
                    correctly skipped in tab order and announced as
                    disabled by screen readers, which the old div/icon
                    version had no way to convey at all. */}
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={onPrevWeek}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
                >
                  <ChevronLeft size={14} color="var(--slate-light)" />
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  disabled={calendarWeekOffset >= 0}
                  onClick={onNextWeek}
                  style={{ background: "none", border: "none", padding: 0, cursor: calendarWeekOffset >= 0 ? "not-allowed" : "pointer", display: "inline-flex", lineHeight: 0 }}
                >
                  <ChevronRight size={14} color={calendarWeekOffset >= 0 ? "var(--line)" : "var(--slate-light)"} />
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, textAlign: "center" }}>
              {days.map((d, i) => <div key={i} style={{ fontSize: 11, color: "var(--slate-light)" }}>{d}</div>)}
              {/* (461 follow-up) — activitySummary defaults to week: []
                  until its own fetch resolves, independently of this
                  screen's main `loading` flag, so this row rendered
                  nothing at all for a beat and then popped in 7 day cells,
                  growing the card and shifting the divider/"Daily goal"
                  text/"This week" card below it — a real, user-visible
                  shift Danny flagged directly. Same fix as everywhere else
                  in #461: render 7 same-sized placeholder cells (identical
                  padding/fontSize/border-radius to the real ones, just no
                  background/text) whenever week data isn't in yet, so this
                  row is exactly one cell tall from first paint regardless
                  of fetch timing. */}
              {activitySummary.week.length === 0
                ? Array.from({ length: 7 }).map((_, i) => (
                    <div
                      key={i}
                      aria-hidden="true"
                      style={{ fontSize: 12, padding: "5px 0", borderRadius: 6 }}
                    >
                      &nbsp;
                    </div>
                  ))
                : activitySummary.week.map((day) => {
                    const isToday = day.date === todayKey;
                    return (
                      <div key={day.date} style={{
                        fontSize: 12, padding: "5px 0", borderRadius: 6,
                        background: isToday ? "var(--gold)" : day.goalHit ? "var(--gold-tint)" : "transparent",
                        // #385 — reverted to the original hardcoded #2B1E06 for
                        // "today" alongside --gold's revert back to its warm
                        // value (see the :root history note in global.css) —
                        // this went var(--ink) -> white and back across the
                        // accent's several changes this pass. Non-today cells
                        // keep --ink, which holds comfortably on both
                        // transparent and the restored --gold-tint.
                        color: isToday ? "#2B1E06" : "var(--ink)", fontWeight: isToday ? 700 : 400,
                      }}>{new Date(`${day.date}T00:00:00Z`).getUTCDate()}</div>
                    );
                  })}
            </div>
            <hr className="enc-hairline" style={{ margin: "16px 0" }} />
            {/* #255 — used to be a click-to-edit pill picker right here;
                editing now lives on the Account Settings screen (see
                SettingsScreen's Preferences card), so this is just a
                read-only reflection of the current value. */}
            {/* (461 follow-up) — dailyGoalPoints already defaults to the
                real signup default (1500), so no shift there, but
                goalHitDays defaults to 0 and used to flash "0 of 7 days
                hit this week" before resolving — a literal 0-default,
                exactly the class of bug flagged. */}
            <div style={{ fontSize: 12.5, color: "var(--slate)" }}>
              Daily goal · {activitySummary.dailyGoalPoints} pts
            </div>
            {activitySummaryLoading ? (
              <div aria-hidden="true" style={{ width: 110, height: 12.5, borderRadius: 4, background: "var(--line)", marginTop: 4 }} />
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>{activitySummary.goalHitDays} of 7 days hit this week</div>
            )}
          </div>

          <div className="enc-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>This week</div>
            {/* (461 follow-up) — pointsThisWeek defaults to 0 in
                activitySummary until its own fetch resolves, same as
                streak/goalHitDays above. */}
            {activitySummaryLoading ? (
              <div aria-hidden="true" style={{ width: 60, height: 26, borderRadius: 4, background: "var(--line)", marginBottom: 4 }} />
            ) : (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 500 }}>{activitySummary.pointsThisWeek}<span style={{ fontSize: 13, color: "var(--slate-light)" }}> pts</span></div>
            )}
            <div style={{ fontSize: 12, color: "var(--slate-light)" }}>learning points logged</div>
            <hr className="enc-hairline" style={{ margin: "16px 0" }} />
            {/* (461 follow-up) — enrolledCourseCount derives from `enrolled`
                (the same courses/enrolled fetch `loading` already gates the
                left column on), so this read "Enrolled in 0 courses" every
                time until that resolved — this card lives in the right
                column, which wasn't gated on `loading` at all before. */}
            {loading ? (
              <div aria-hidden="true" style={{ width: 100, height: 12.5, borderRadius: 4, background: "var(--line)" }} />
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--slate)" }}>Enrolled in {enrolledCourseCount} course{enrolledCourseCount === 1 ? "" : "s"}</div>
            )}

            {/* #231/#255 — the opt-in toggle itself moved to Account
                Settings (see SettingsScreen's Preferences card); this stays
                as just the "View leaderboard" link, shown once opted in —
                opting out is what makes a learner disappear from it, so
                there's nothing useful to view before that. */}
            {/* #360 — was <div onClick>: not a real link/button, unreachable
                by keyboard. Same fix as the identical control already
                converted in Settings (#349). */}
            {/* (461 follow-up) — leaderboardOptIn comes from the same
                profile fetch as goal above, defaulting to false until it
                resolves — same pop-in risk for an opted-in learner.
                Gated on profileLoaded the same way. */}
            {!profileLoaded ? (
              <>
                <hr className="enc-hairline" style={{ margin: "16px 0" }} />
                <div aria-hidden="true" style={{ width: 120, height: 12.5, borderRadius: 4, background: "var(--line)" }} />
              </>
            ) : leaderboardOptIn && onOpenLeaderboard ? (
              <>
                <hr className="enc-hairline" style={{ margin: "16px 0" }} />
                <button
                  type="button"
                  onClick={onOpenLeaderboard}
                  style={{ font: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--gold-dark)", fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer" }}
                >
                  <Trophy size={13} color="var(--gold-dark)" />
                  View leaderboard →
                </button>
              </>
            ) : null}
          </div>

          {/* (461 — site-wide CLS audit) — badges/skills/paths/saved all
              used to follow a "hidden until non-empty" convention with no
              loading skeleton at all: fine for a learner who never has
              any (stays hidden forever, no transition to shift anything),
              but for a learner who eventually gets real data, the card
              popped in from zero height the instant the fetch resolved —
              same class of bug as Home's "Recommended for you" collapse,
              just inverted (growing in rather than collapsing out). Each
              card below now always reserves the same slot: a skeleton
              while its *Loading prop is true, real content once loaded,
              or a same-slot empty message if it resolves with nothing —
              never an abrupt appear/disappear after first paint. */}
          <div className="enc-card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Badges</div>
            {badgesLoading ? (
              <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[0, 1].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--line)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ width: "50%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                      <div style={{ width: "75%", height: 11.5, borderRadius: 4, background: "var(--line)" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : badges.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>No badges earned yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* #385 — badge-icon chips switched to --blue-tint/--blue-dark:
                    a standalone, non-interactive icon repeated in a list,
                    away from the primary Dashboard stat row above (which
                    stays gold) — a contained, low-traffic spot to trial a
                    bit more of the logo's blue without thinning out gold
                    where it matters most (see global.css's :root comment). */}
                {badges.map((b) => (
                  <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Medal size={15} color="var(--blue-dark)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{b.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--slate-light)" }}>
                        {b.description} · Earned {new Date(b.earnedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* #226 — skillsLearned is derived from `complete` (the same
              enrolled/courses data the left column uses), so it follows
              the shared `loading` prop rather than a dedicated flag of
              its own. */}
          <div className="enc-card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Skills</div>
            {loading ? (
              <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[52, 68, 44].map((w, i) => (
                  <div key={i} style={{ width: w, height: 24, borderRadius: 999, background: "var(--line)" }} />
                ))}
              </div>
            ) : skillsLearned.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Complete a course to start building your skills list.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {skillsLearned.map((s) => (
                  <span
                    key={s}
                    // (mobile-overflow fix) — same skill-chip treatment as
                    // the trainer editor/course modal.
                    style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px", maxWidth: "100%", overflowWrap: "break-word" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* #224 — completedCount/totalCount/status arrive precomputed
              from the backend (see LearningPathEnrollmentsService), so
              this is pure display, same as how the course progress bars
              in the left column never compute anything themselves either. */}
          <div className="enc-card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Learning paths</div>
            {pathEnrollmentsLoading ? (
              <div aria-hidden="true">
                <div style={{ width: "60%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                <div style={{ width: "40%", height: 11.5, borderRadius: 4, background: "var(--line)", marginBottom: 8 }} />
                <div style={{ height: 5, background: "var(--line)", borderRadius: 3 }} />
              </div>
            ) : pathEnrollments.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Not enrolled in any learning paths yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {pathEnrollments.map((pe) => (
                  <div key={pe.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: "break-word" }}>{pe.title}</span>
                      {pe.status === "complete" && <CheckCircle2 size={14} color="var(--success)" style={{ flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginBottom: 6 }}>
                      {pe.completedCount} of {pe.totalCount} course{pe.totalCount === 1 ? "" : "s"} complete
                    </div>
                    <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${pe.totalCount > 0 ? (pe.completedCount / pe.totalCount) * 100 : 0}%`,
                        background: pe.status === "complete" ? "var(--success)" : "var(--gold)",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* #230 — unbookmarking from here reuses the exact same
              onToggleBookmark the Catalogue card's icon calls — this
              card is just another place that toggle is exposed, not a
              separate code path. */}
          <div className="enc-card" style={{ padding: 18, marginTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Saved</div>
            {bookmarksLoading ? (
              <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[0, 1].map((i) => (
                  <div key={i}>
                    <div style={{ width: "60%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                    <div style={{ width: "35%", height: 11.5, borderRadius: 4, background: "var(--line)" }} />
                  </div>
                ))}
              </div>
            ) : savedCourses.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Nothing saved yet — bookmark a course from Catalogue to find it here.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {savedCourses.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* #360 — was <div onClick>: not focusable. A sibling
                        of the remove-bookmark button below, not a parent,
                        so a plain <button> here doesn't create the
                        nested-button problem the Catalogue card's cover
                        button had to work around. */}
                    <button
                      type="button"
                      onClick={() => onOpenCourse(c)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", font: "inherit", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: "break-word" }}>{c.title}</div>
                      <div style={{ fontSize: 11.5, color: "var(--slate-light)", overflowWrap: "break-word" }}>{c.provider}</div>
                    </button>
                    {/* #258 — real button (was a bare clickable icon);
                        every course in this list is already saved, so the
                        action here is always "remove." */}
                    {onToggleBookmark && (
                      <button
                        type="button"
                        aria-label="Remove bookmark"
                        onClick={() => onToggleBookmark(c, true)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0, flexShrink: 0 }}
                      >
                        <Bookmark size={15} color="var(--gold-dark)" fill="var(--gold-dark)" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* #255/#300/#301/#365 — same modal shape as TrainerScreen's
          delete-course confirmation (backdrop click/X/Cancel all close
          it, guarded by !retaking so a click mid-request can't dismiss
          and lose the error). Retake-only now that plain Unenroll has
          moved to LearningScreen — no more isComplete branching. The
          copy is explicit that quiz answers/notes carry over, since
          EnrollmentsService.retake deliberately doesn't wipe them — a
          learner who wants a clean slate has to redo each module's quiz
          individually.
          #301 — portaled to document.body: this screen's root div carries
          enc-page-enter for the page-load animation, which leaves a
          `transform` applied via animation-fill-mode: both even after the
          animation finishes. Any ancestor with a transform becomes a new
          containing block for a `position: fixed` descendant, so without
          the portal this backdrop was sized to that (narrower, shorter)
          root div instead of the real viewport — it only ever dimmed part
          of the screen instead of covering it. Rendering outside that
          subtree entirely is the durable fix, not a one-off tweak to this
          animation. */}
      {retakingCourse && createPortal(
        <div
          onClick={() => !retaking && setRetakingCourse(null)}
          className="enc-modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={retakeDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card enc-modal-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-retake-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-retake-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>
                Retake this course?
              </div>
              {/* #258 — real button (was a bare clickable icon). */}
              <button
                type="button"
                aria-label="Close"
                disabled={retaking}
                onClick={() => setRetakingCourse(null)}
                style={{ background: "none", border: "none", padding: 0, cursor: retaking ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            {/* (mobile-overflow fix) — same as the Trainer Studio
                delete-confirm modals: a course title with no natural
                break point can otherwise force this modal wider than
                the viewport on mobile. */}
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20, overflowWrap: "break-word" }}>
              Your progress on <strong>{retakingCourse.title}</strong> will reset to start it again. Your existing quiz answers and notes stay in place unless you retake each quiz individually, and you'll lose access to the current certificate until you complete the course again.
            </div>
            {retakeError && (
              <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>{retakeError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" disabled={retaking} onClick={() => setRetakingCourse(null)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff", opacity: retaking ? 0.7 : 1 }}
                disabled={retaking}
                onClick={handleConfirmRetake}
              >
                {retaking ? "Retaking…" : "Retake"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}