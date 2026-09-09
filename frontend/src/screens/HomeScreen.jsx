import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, BookOpen, Sparkles, TrendingUp, Milestone, Trophy } from "lucide-react";

import { TESTIMONIALS } from "../data/courses";
import { Stars, EncyclopediaArch, CategoryDot, PageHeader } from "../components/common/Primitives";
import { MarketingHeader } from "../components/layout/MarketingHeader";
import { getDisplayName, getFirstName } from "../lib/userDisplay";

/* ---------- Screen: Home (marketing for logged-out visitors, a
   "Discover" surface for logged-in users) ---------- */

// #247 — a curated row, not a dumping ground: same reasoning as
// Catalogue's #190 RECOMMENDED_LIMIT, just a shorter one — this page
// makes room for several sections, so each one stays tight rather than
// trying to be a second Catalogue grid.
const RECOMMENDED_LIMIT = 3;
const TRENDING_LIMIT = 3;
const PATHS_LIMIT = 2;

export function HomeScreen({
  onGo,
  onAuth,
  courses,
  loggedIn,
  user,
  enrolled = [],
  onOpenCourse,
  enrolledIds = [],
  goal = null,
  learningPaths = [],
  onOpenPath,
  enrolledPathIds = [],
  leaderboardOptIn = false,
  onFetchLeaderboard,
  // #367 — courses hasn't resolved yet (App.jsx's one-time fetch on
  // mount). Used only to size a same-footprint skeleton for the two
  // course-grid sections below while that's in flight, so they don't pop
  // in at full height once the fetch resolves (a measured CLS finding).
  // Not threaded anywhere else on this screen — Popular/Continue-learning
  // etc. already render fine against an empty `courses`/`enrolled` array.
  loading = false,
}) {
  const firstName = loggedIn ? getFirstName(getDisplayName(user)) : null;
  const inProgress = enrolled.filter((e) => e.status === "in-progress");
  const complete = enrolled.filter((e) => e.status === "complete");

  // #247 — "Recommended for you": the same goal-category signal as
  // Catalogue's #190 strip, but additionally excludes courses the
  // learner is already enrolled in. Catalogue's version deliberately
  // keeps enrolled courses in (badged "Enrolled") since it's a
  // "for you" callout layered on the full list; here, where the whole
  // point of this page is surfacing things the learner hasn't started,
  // an already-enrolled course belongs on Dashboard's "Continue
  // learning" list instead, not repeated here.
  const recommended = !loggedIn || !goal
    ? []
    : courses
        .filter((c) => c.category === goal && !enrolledIds.includes(c.id))
        .slice()
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
        .slice(0, RECOMMENDED_LIMIT);
  const recommendedIds = new Set(recommended.map((c) => c.id));

  // #247 — "New on Encyclopedia": not limited to the learner's goal category
  // (or shown at all for a learner/trainer with no goal set) — a
  // logged-out-style "what's out there" strip, minus anything already
  // surfaced above or already enrolled in.
  // #308 — sorts by createdAt descending, not rating: this section is
  // titled "New on Encyclopedia" (trending-arrow icon), but was reusing
  // "Recommended for you"'s rating sort, which has nothing to do with
  // recency. In practice that meant an old, highly-rated course sat here
  // indefinitely while genuinely new courses (no ratings yet) never
  // surfaced. createdAt is already present on every course object here —
  // CoursesController.findAll() returns the raw entity, no DTO
  // stripping — so no backend change needed.
  const trending = !loggedIn
    ? []
    : courses
        .filter((c) => !enrolledIds.includes(c.id) && !recommendedIds.has(c.id))
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, TRENDING_LIMIT);

  // #247 — same skills-from-completed-courses derivation as Dashboard's
  // #226 skills card, used here only to rank (not filter) which
  // not-yet-enrolled learning paths to surface first — a path that
  // builds on skills the learner already has is a more natural "what's
  // next" than a path picked at random.
  const skillsLearned = loggedIn
    ? Array.from(
        new Set(
          complete.flatMap((e) => courses.find((x) => x.id === e.courseId)?.skills ?? []),
        ),
      )
    : [];

  const pathsToExplore = !loggedIn
    ? []
    : learningPaths
        .filter((p) => !enrolledPathIds.includes(p.id))
        .map((p) => ({
          path: p,
          matchCount: (p.courses ?? []).reduce(
            (sum, c) => sum + (c.skills ?? []).filter((s) => skillsLearned.includes(s)).length,
            0,
          ),
        }))
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, PATHS_LIMIT)
        .map((x) => x.path);

  // #247 — leaderboard teaser, same fetch-on-mount-with-cancelled-guard
  // shape as LeaderboardScreen's own effect. Only fetched for an
  // opted-in learner — an opted-out learner never appears in the
  // rankings anyway (see LeaderboardService), so there'd be nothing of
  // theirs to show here.
  const [leaderboardEntries, setLeaderboardEntries] = useState(null);
  useEffect(() => {
    if (!loggedIn || !leaderboardOptIn || !onFetchLeaderboard) {
      setLeaderboardEntries(null);
      return;
    }
    let cancelled = false;
    onFetchLeaderboard()
      .then((data) => {
        if (!cancelled) setLeaderboardEntries(data);
      })
      .catch((err) => {
        console.error("Failed to load leaderboard teaser:", err.message);
        if (!cancelled) setLeaderboardEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn, leaderboardOptIn, onFetchLeaderboard]);
  const myRank = leaderboardEntries?.find((e) => e.isSelf) ?? null;

  // #360 — was <div onClick>: not focusable. No nested interactive
  // elements in this card, so a plain <button> wrapping the whole thing
  // is enough.
  function renderCourseCard(c) {
    return (
      <button key={c.id} type="button" className="enc-card" onClick={() => (onOpenCourse ? onOpenCourse(c) : onGo("catalogue"))} style={{ padding: 18, width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <CategoryDot color={c.color} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{c.category}</span>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>{c.title}</div>
        <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5, marginBottom: 14 }}>{c.blurb}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Stars rating={c.rating} />
          <span style={{ fontSize: 12, color: "var(--slate-light)" }}>{c.hours}h</span>
        </div>
      </button>
    );
  }

  // #367 — same padding/line-count/shape as renderCourseCard above so a
  // real card swapping in doesn't change the grid's height (the whole
  // point of showing this at all). Purely decorative — aria-hidden so
  // screen readers don't announce empty placeholder text.
  function renderCourseCardSkeleton(i) {
    return (
      <div key={i} className="enc-card" aria-hidden="true" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line)" }} />
          <div style={{ width: 64, height: 11, borderRadius: 4, background: "var(--line)" }} />
        </div>
        <div style={{ width: "85%", height: 15.5, borderRadius: 4, background: "var(--line)", marginBottom: 8 }} />
        <div style={{ width: "100%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
        <div style={{ width: "70%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 14 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: 70, height: 12, borderRadius: 4, background: "var(--line)" }} />
          <div style={{ width: 24, height: 12, borderRadius: 4, background: "var(--line)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="enc-page-enter">
      {!loggedIn && <MarketingHeader onGo={onGo} onAuth={onAuth} />}
      <section style={{ maxWidth: 1160, margin: "0 auto", padding: "64px 28px 40px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 48, alignItems: "center" }}>
        {loggedIn ? (
          <div>
            <span className="enc-badge" style={{ background: "var(--gold-tint)", color: "var(--gold-dark)" }}>Welcome back</span>
            {/* #213 — was a 46px hero h1, noticeably larger than
                Catalogue's 30px title or Dashboard's (formerly
                nonexistent) one. PageHeader brings it down to the same
                shared scale; marginTop wrapper preserves the original
                18px gap under the badge above. */}
            <div style={{ marginTop: 18 }}>
              <PageHeader
                title={`Good to see you, ${firstName}.`}
                subtitle="Pick up a course you've already started, or browse the catalogue for something new."
              />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
              <button className="enc-btn enc-btn-gold" style={{ padding: "12px 22px", fontSize: 15 }} onClick={() => onGo("dashboard")}>Go to my learning</button>
              <button className="enc-btn enc-btn-ghost" style={{ padding: "12px 22px", fontSize: 15 }} onClick={() => onGo("catalogue")}>
                Browse catalogue <ArrowRight size={15} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
              {[[String(inProgress.length), "in progress"], [String(complete.length), "completed"]].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 20 }}>{n}</div>
                  <div style={{ fontSize: 12, color: "var(--slate-light)" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* #386 — client-supplied homepage copy refresh (Home Page
                Copy.pdf): hero heading/subtext, stat labels. Badge and
                CTA button copy were unchanged in the client's mockup, so
                left as-is. .enc-badge already uppercases via CSS (see
                global.css), which is why "For growing teams" here
                matches the mockup's all-caps "FOR GROWING TEAMS" without
                needing the string itself changed. */}
            <span className="enc-badge" style={{ background: "var(--gold-tint)", color: "var(--gold-dark)" }}>For growing teams</span>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 46, lineHeight: 1.08, margin: "18px 0 16px" }}>
              Skills in-demand, not just talked about
            </h1>
            <p style={{ fontSize: 16, color: "var(--slate)", lineHeight: 1.6, maxWidth: 460 }}>
              Short, practical extra-curricular course – In entrepreneurship, AI, coding, trading and more…
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
              <button className="enc-btn enc-btn-gold" style={{ padding: "12px 22px", fontSize: 15 }} onClick={() => onAuth("signup")}>Get started free</button>
              <button className="enc-btn enc-btn-ghost" style={{ padding: "12px 22px", fontSize: 15 }} onClick={() => onGo("catalogue")}>
                Browse catalogue <ArrowRight size={15} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 34 }}>
              {[["40,000+", "learners"], ["120+", "courses"], ["4.8", "avg rating"]].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 20 }}>{n}</div>
                  <div style={{ fontSize: 12, color: "var(--slate-light)" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="enc-card" style={{ padding: 22, position: "relative" }}>
          {/* #323 — this heading used to always read "Continue where you
              left off", even for logged-out guests. The body below already
              swaps to a neutral "browse this course" list for guests (see
              #108's comment a few lines down) rather than faking personal
              progress, but the heading itself didn't follow — a guest who's
              never continued anything still saw that exact phrase. */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>
            {loggedIn ? "Continue where you left off" : "Popular right now"}
          </div>
          {loggedIn ? (
            inProgress.length > 0 ? (
              // #360 — was <div onClick>: not focusable. No nested
              // interactive elements, so a plain <button> is enough.
              inProgress.slice(0, 3).map((e) => (
                <button key={e.id} type="button" onClick={() => onGo(`learning/${e.courseId}`)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, width: "100%", textAlign: "left", font: "inherit", background: "none", border: "none", cursor: "pointer" }}>
                  <EncyclopediaArch progress={e.progress} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.course?.title ?? "Untitled course"}</div>
                    <div style={{ fontSize: 12, color: "var(--slate-light)" }}>
                      {Math.round(e.progress * (e.course?.modules?.length ?? 0))} of {e.course?.modules?.length ?? 0} modules
                    </div>
                  </div>
                  <ChevronRight size={15} color="var(--slate-light)" />
                </button>
              ))
            ) : complete.length > 0 ? (
              // #290 — distinct from the "never started anything" case
              // below: this learner has completed courses (visible in the
              // stat row just above this card), so "you haven't started a
              // course yet" would be actively wrong, not just unhelpful.
              // #360 — was <span onClick>: not a real link/button.
              <div style={{ fontSize: 13, color: "var(--slate-light)", padding: "10px 8px" }}>
                Nothing in progress right now —{" "}
                <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", color: "var(--gold-dark)", fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer" }}>browse the catalogue</button> to start something new.
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--slate-light)", padding: "10px 8px" }}>
                You haven't started a course yet —{" "}
                <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", color: "var(--gold-dark)", fontWeight: 600, background: "none", border: "none", padding: 0, cursor: "pointer" }}>browse the catalogue</button>.
              </div>
            )
          ) : (
            // #360 — was <div onClick>: not focusable.
            courses.slice(0, 3).map((c) => (
              <button key={c.id} type="button" onClick={() => onGo("catalogue")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderRadius: 10, width: "100%", textAlign: "left", font: "inherit", background: "none", border: "none", cursor: "pointer" }}>
                {/* #108 — logged-out visitors have no real enrollment/progress,
                    so this used to fake a progress ring per course id (0.62 /
                    0.1 / 0.2). A neutral "browse this course" badge instead of
                    a number that implies personal progress that doesn't exist. */}
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--gold-tint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <BookOpen size={17} color="var(--gold-dark)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--slate-light)" }}>{c.provider}</div>
                </div>
                <ChevronRight size={15} color="var(--slate-light)" />
              </button>
            ))
          )}
        </div>
      </section>

      {/* #247 — this is the page's actual job for a logged-in user: not a
          second "your own progress" view (Dashboard already owns that),
          but discovery — things the learner hasn't started yet. Each
          section below follows the same "hidden until non-empty"
          convention used across Dashboard's badges/skills/paths/saved
          cards; a learner with nothing to recommend (no goal, no
          un-enrolled paths, not opted into the leaderboard) just sees
          fewer sections, never an empty placeholder. */}
      {loggedIn && (
        // #336 — shared .enc-page-scaled primitive instead of a hardcoded
        // maxWidth, so this logged-in discovery section grows at the same
        // large breakpoint as the rest of the app. The shared marketing
        // hero above and the logged-out sections below are unaffected.
        <section className="enc-page-scaled" style={{ "--enc-page-base": "1160px", padding: "20px 28px 56px" }}>
          {/* #367 — goal is known synchronously (part of the already-loaded
              profile), so a skeleton here only shows for a learner who's
              actually going to get a real "Recommended for you" section
              once `courses` resolves — not for one who'd never see this
              section at all. */}
          {(recommended.length > 0 || (loading && goal)) && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <Sparkles size={16} color="var(--gold-dark)" />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>Recommended for you</span>
              </div>
              <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 14 }}>Based on your {goal} goal.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
                {loading ? [0, 1, 2].map(renderCourseCardSkeleton) : recommended.map(renderCourseCard)}
              </div>
            </div>
          )}

          {(trending.length > 0 || loading) && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* #385 — one small accent touch: this section's heading
                      icon uses the new --blue-dark (sampled from the logo,
                      see global.css) instead of --gold-dark, so it reads as
                      a distinct visual note from the Sparkles/Milestone
                      icons on the sections above/below rather than all
                      three looking identical. "View catalogue" stays gold
                      since it's the interactive/clickable element here —
                      --gold remains the one color reserved for anything
                      CTA-shaped; --blue is only ever a static glyph. */}
                  <TrendingUp size={16} color="var(--blue-dark)" />
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>New on Encyclopedia</span>
                </div>
                {/* #360 — was <span onClick>: not a real link/button. */}
                <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", fontSize: 13.5, fontWeight: 600, color: "var(--gold-dark)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>View catalogue →</button>
              </div>
              <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 14 }}>Courses you haven't started yet.</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
                {loading ? [0, 1, 2].map(renderCourseCardSkeleton) : trending.map(renderCourseCard)}
              </div>
            </div>
          )}

          {pathsToExplore.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Milestone size={16} color="var(--gold-dark)" />
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>Learning paths to explore</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 18 }}>
                {/* #360 — was <div onClick>: not focusable. */}
                {pathsToExplore.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="enc-card"
                    onClick={() => onOpenPath && onOpenPath(p)}
                    disabled={!onOpenPath}
                    style={{ padding: 18, width: "100%", textAlign: "left", font: "inherit", cursor: onOpenPath ? "pointer" : "default" }}
                  >
                    <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6 }}>{p.title}</div>
                    {p.description && (
                      <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5, marginBottom: 14 }}>{p.description}</div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--slate-light)" }}>
                      {(p.courses ?? []).length} course{(p.courses ?? []).length === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {myRank && (
            <div className="enc-card" style={{ padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Trophy size={16} color="var(--gold-dark)" />
                <span style={{ fontSize: 13.5 }}>
                  You're <b>#{myRank.rank}</b> of {leaderboardEntries.length} on the leaderboard this week.
                </span>
              </div>
              {/* #360 — was <span onClick>: not a real link/button. */}
              <button type="button" onClick={() => onGo("leaderboard")} style={{ font: "inherit", fontSize: 13, fontWeight: 600, color: "var(--gold-dark)", background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>
                View leaderboard →
              </button>
            </div>
          )}
        </section>
      )}

      {/* #213 — "Popular this month" and the testimonials band are both
          logged-out marketing content: a course-recommendation strip
          (redundant with Catalogue's own "Recommended for you" from #190
          once logged in) and social-proof testimonials aimed at someone
          deciding whether to sign up. Neither belongs in front of someone
          who already has an account — it's also the main reason this page
          was always taller/scrollable than Dashboard or Catalogue
          regardless of how little content a logged-in visitor actually
          had. Logged-out behavior is completely unchanged below.
          (The old demo-copy footer that used to close out this section
          is gone — #337 replaced it with the site-wide Footer rendered
          from AppShell, which every page including this one now gets.) */}
      {!loggedIn && (
        <>
          <section style={{ maxWidth: 1160, margin: "0 auto", padding: "20px 28px 56px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, margin: 0 }}>Popular this month</h2>
              {/* #360 — was <span onClick>: not a real link/button. */}
              <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", fontSize: 13.5, fontWeight: 600, color: "var(--gold-dark)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>View catalogue →</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              {courses.slice(0, 3).map(renderCourseCard)}
            </div>
          </section>

          <section style={{ background: "var(--ink)", padding: "56px 28px" }}>
            <div style={{ maxWidth: 1160, margin: "0 auto" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--paper)", marginBottom: 22 }}>What learners say</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
                {TESTIMONIALS.map((t) => (
                  <div key={t.name} style={{ background: "#1E2C4A", border: "1px solid #2A3A5C", borderRadius: 14, padding: 20 }}>
                    <Stars rating={t.rating} />
                    <p style={{ color: "#DDE2EA", fontSize: 14, lineHeight: 1.55, margin: "12px 0 16px" }}>{t.quote}</p>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--paper)" }}>{t.name}</div>
                    {/* #366 — was #8B93A0: the same pre-#351 slate-light
                        value that failed AA on --paper (~2.8:1), copy-
                        pasted here as a hardcoded hex rather than the
                        (already-fixed) --slate-light token, so #351 never
                        touched it. It happens to land at ~4.47:1 on this
                        card's #1E2C4A background — just under the 4.5:1
                        minimum for 12px text. #9BA6B8 holds ~5.5:1 here,
                        same comfortable-margin approach as #351. */}
                    <div style={{ fontSize: 12, color: "#9BA6B8" }}>{t.role}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
