import { useState } from "react";
import { Search, Milestone, Bookmark, ChevronDown, ChevronUp } from "lucide-react";

import { Stars, CategoryDot, PageHeader } from "../components/common/Primitives";
import { MarketingHeader } from "../components/layout/MarketingHeader";

// #190 — a curated row, not a dumping ground for every course in the
// learner's goal category: some categories have far more than this many
// courses, and showing all of them here would just duplicate a big chunk
// of the grid immediately below it. Sorted by rating (nulls last) before
// slicing, so what makes the cut is at least a reasonable proxy for
// "good," not just catalogue order.
const RECOMMENDED_LIMIT = 6;

// A batch of learning paths (e.g. 9) used to fill the whole viewport
// above the fold, same underlying problem #344 fixed for the search bar
// (it just moved search above this section instead of capping it). Same
// limit/pattern as RECOMMENDED_LIMIT above — two grid rows by default,
// with an explicit "Show all" toggle rather than silently hiding paths.
const LEARNING_PATHS_LIMIT = 6;

export function CatalogueScreen({
  loggedIn,
  onGo,
  onOpenCourse,
  onAuth,
  enrolledIds,
  courses,
  loading = false,
  goal = null,
  learningPaths = [],
  onOpenPath,
  enrolledPathIds = [],
  pathsLoading = false,
  bookmarkedIds = [],
  onToggleBookmark,
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [pathsExpanded, setPathsExpanded] = useState(false);
  const cats = ["All", "Technical", "Business", "Leadership"];

  const visiblePaths = pathsExpanded ? learningPaths : learningPaths.slice(0, LEARNING_PATHS_LIMIT);

  const byCategory = filter === "All" ? courses : courses.filter((c) => c.category === filter);
  const query = search.trim().toLowerCase();
  const filtered = query
    ? byCategory.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.provider.toLowerCase().includes(query) ||
          (c.skills ?? []).some((s) => s.toLowerCase().includes(query)),
      )
    : byCategory;

  // #184 — the subheading used to always show the unfiltered
  // courses.length, even once a search or category chip narrowed the
  // grid down. Reflect whatever's actually showing instead, only
  // falling back to the generic "N courses across..." blurb when
  // nothing's filtered.
  const hasActiveFilter = filter !== "All" || query.length > 0;
  const filteredSubheading = (() => {
    const n = filtered.length;
    const trackLabel = filter === "All" ? "course" : `${filter} course`;
    const base = `${n} ${trackLabel}${n === 1 ? "" : "s"}`;
    return query ? `${base} matching "${search.trim()}".` : `${base}.`;
  })();

  // #190 — goal-category match, the "simplest, no new data needed" signal
  // from the issue. Deliberately doesn't touch `filtered`/the main grid at
  // all: this is an additive "Recommended for you" strip above the
  // unchanged full list, not a reorder — the issue calls that out as the
  // safer option, and it's what keeps search/filter's existing behavior
  // (and the acceptance criteria's "current behavior, unchanged" fallback
  // for no-goal learners) completely untouched below it. Only shown when
  // nothing's actively filtered: search/filter fully overriding
  // personalization, rather than blending with it, is what the acceptance
  // criteria's "when no search/filter is active" means in practice.
  //
  // #324 — excludes anything already in enrolledIds (covers in-progress
  // and completed alike, same array the "Enrolled" badge reads from):
  // a learner with a lot of history in one goal category was seeing a
  // "for you" strip that was mostly courses they'd already done.
  const recommended = (!goal || hasActiveFilter)
    ? []
    : courses
        .filter((c) => c.category === goal && !enrolledIds.includes(c.id))
        .slice()
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
        .slice(0, RECOMMENDED_LIMIT);

  // #190 — shared by the Recommended strip and the main grid so the two
  // don't drift out of sync visually; a course can legitimately appear in
  // both (this is a "for you" callout layered on top of the full list,
  // not a filter removing it from below).
  function renderCourseCard(c) {
    const isEnrolled = enrolledIds.includes(c.id);
    // #230 — a learner "saving" a course without enrolling. Only rendered
    // when the caller actually wired up bookmarking (loggedIn learner with
    // onToggleBookmark passed in) — logged-out/marketing view of this same
    // card renders exactly as it did before this feature.
    const isBookmarked = bookmarkedIds.includes(c.id);
    return (
      <div key={c.id} className="enc-card" style={{ padding: 18, display: "flex", flexDirection: "column", position: "relative" }}>
        {/* #360 — "stretched button": an invisible button covering the
            whole card is the real Tab stop / Enter-Space target for
            opening the course. Can't just make the whole card a <button>
            because the bookmark toggle below is already its own real,
            independently-focusable <button> — a button nested inside
            another button is invalid HTML and screen readers handle it
            inconsistently. zIndex keeps this under the bookmark button
            (which gets its own zIndex bump below) so bookmarking still
            works as its own independent click/Tab stop. */}
        <button
          type="button"
          onClick={() => onOpenCourse(c)}
          aria-label={`Open ${c.title}`}
          style={{ position: "absolute", inset: 0, background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", zIndex: 1 }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CategoryDot color={c.color} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{c.category}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isEnrolled && <span className="enc-badge" style={{ background: "var(--success-tint)", color: "var(--success)" }}>Enrolled</span>}
            {/* #258 — real button (was a bare clickable icon); aria-label
                reflects current saved state, same reasoning as the
                password-visibility toggles.
                #360 — position/zIndex sit this above the card-cover button
                above so it stays independently clickable/tabbable. */}
            {onToggleBookmark && (
              <button
                type="button"
                aria-label={isBookmarked ? "Remove bookmark" : "Save course"}
                aria-pressed={isBookmarked}
                onClick={() => onToggleBookmark(c, isBookmarked)}
                style={{ position: "relative", zIndex: 2, background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <Bookmark
                  size={16}
                  color={isBookmarked ? "var(--gold-dark)" : "var(--slate-light)"}
                  fill={isBookmarked ? "var(--gold-dark)" : "none"}
                />
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{c.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 10 }}>{c.provider}</div>
        <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5, marginBottom: 16, flex: 1 }}>{c.blurb}</div>
        <hr className="enc-hairline" style={{ margin: "0 0 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Stars rating={c.rating} />
          <span style={{ fontSize: 12, color: "var(--slate-light)", fontFamily: "var(--font-mono)" }}>{c.hours}h · {c.level}</span>
        </div>
      </div>
    );
  }

  // #367 — same padding/line-count/shape as renderCourseCard above, for the
  // same reason as HomeScreen/DashboardScreen's skeletons: this page's
  // whole content area (search bar aside) used to swap from a single
  // "Loading catalogue…" line straight to a full grid once `courses`
  // resolved — the single biggest layout shift Lighthouse could have
  // flagged here, worse than Home's since the whole grid (not just two
  // sections) was appearing at once. Six placeholders approximates a
  // first screenful at the 3-column breakpoint without knowing the real
  // (filtered) count ahead of time.
  function renderCourseCardSkeleton(i) {
    return (
      <div key={i} className="enc-card" aria-hidden="true" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--line)" }} />
            <div style={{ width: 64, height: 11, borderRadius: 4, background: "var(--line)" }} />
          </div>
        </div>
        <div style={{ width: "80%", height: 15.5, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
        <div style={{ width: "45%", height: 12.5, borderRadius: 4, background: "var(--line)", marginBottom: 12 }} />
        <div style={{ width: "100%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
        <div style={{ width: "70%", height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 16 }} />
        <hr className="enc-hairline" style={{ margin: "0 0 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ width: 70, height: 12, borderRadius: 4, background: "var(--line)" }} />
          <div style={{ width: 50, height: 12, borderRadius: 4, background: "var(--line)" }} />
        </div>
      </div>
    );
  }

  // #224 — a slimmer card than renderCourseCard: no rating/hours/level
  // line since a path doesn't carry any of its own (those are per-course),
  // just how many courses it bundles plus whatever description the
  // trainer wrote.
  function renderPathCard(p) {
    const isEnrolled = enrolledPathIds.includes(p.id);
    // #360 — was <div onClick>: not focusable. No nested interactive
    // elements in this card (unlike renderCourseCard's bookmark button),
    // so a plain <button> wrapping the whole thing is enough — no need
    // for the stretched-button trick.
    return (
      <button key={p.id} type="button" className="enc-card" onClick={() => onOpenPath(p)} style={{ padding: 18, display: "flex", flexDirection: "column", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Milestone size={13} color="var(--gold-dark)" />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{p.courses.length} courses</span>
          </div>
          {isEnrolled && <span className="enc-badge" style={{ background: "var(--success-tint)", color: "var(--success)" }}>Enrolled</span>}
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{p.title}</div>
        <div style={{ fontSize: 13, color: "var(--slate)", lineHeight: 1.5, flex: 1 }}>{p.description}</div>
      </button>
    );
  }

  return (
    <div className="enc-page-enter">
      {!loggedIn && <MarketingHeader onGo={onGo} onAuth={onAuth} />}
      {/* #336 — shared .enc-page-scaled primitive (global.css) instead of a
          hardcoded maxWidth, so this page grows at the same large
          breakpoint as My Learning/Learning instead of staying fixed. */}
      <div className="enc-page-scaled" style={{ "--enc-page-base": "1160px", padding: "36px 28px 60px" }}>
        {/* #213 — was an inline h1/p; now the shared PageHeader primitive
            (same 30px/font-display/600 title, same subtitle styling) so
            Dashboard/Discover can match this scale exactly instead of
            each hand-rolling their own heading size.
            #364 — title only kept when logged out: logged-in visitors
            already see "Catalogue" in AppTopbar, so repeating it here is
            pure duplication. Logged-out visitors get no topbar at all
            (AppShell only renders it when loggedIn), so this is their
            only page title — keep it for that case. */}
        <PageHeader
          title={loggedIn ? undefined : "Course catalogue"}
          subtitle={
            loading
              ? "Loading courses…"
              : hasActiveFilter
                ? filteredSubheading
                : `${courses.length} courses across technical, business, and leadership tracks.`
          }
        />

        {/* #344 — was below the Learning paths/Recommended sections, so a
            learner had to scroll past both (worse the more paths or
            recommended courses existed) before reaching search. Moved to
            directly under the page header so it's always the first thing
            visible, regardless of how much renders below it.
            #104 — stacked on mobile, side-by-side from md up; flex-
            direction is the only breakpoint-dependent property here, so
            it's the only thing on Tailwind classes.
            #367 — pulled out of the `loading` branch below: search/filter
            depend only on local state (`cats` is a static list), not on
            `courses`, so there's no reason this couldn't render — and stay
            interactive — immediately instead of waiting behind the same
            gate as the course grid. */}
        <div className="flex flex-col items-stretch md:flex-row md:items-center" style={{ gap: 18, marginBottom: 24 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 11 }} />
            <input
              className="enc-input"
              placeholder="Search by title or provider"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* #360 — was <span onClick>: not focusable/keyboard-operable.
              Real button + aria-pressed, same fix as Trainer Studio's
              ownership filter. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setFilter(c)} aria-pressed={filter === c}
                style={{ font: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 100, cursor: "pointer",
                  background: filter === c ? "var(--ink)" : "var(--paper-2)", color: filter === c ? "var(--paper)" : "var(--slate)",
                  border: "1px solid var(--line)" }}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
            {[0, 1, 2, 3, 4, 5].map(renderCourseCardSkeleton)}
          </div>
        ) : (
          <>
            {/* #224 — "Learning paths": its own section, entirely separate
                from the course search/category filter above (a path isn't
                a course, so it doesn't belong in that grid or its filter
                predicate). Hidden while paths are still loading or there
                simply aren't any yet.
                #344 — capped at LEARNING_PATHS_LIMIT (same pattern as
                Recommended below) with an explicit "Show all" toggle, so a
                large batch of paths doesn't fill the whole viewport above
                the course grid. */}
            {!pathsLoading && learningPaths.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Learning paths</div>
                <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 14 }}>
                  Guided, multi-course sequences curated by trainers.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
                  {visiblePaths.map(renderPathCard)}
                </div>
                {learningPaths.length > LEARNING_PATHS_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setPathsExpanded((v) => !v)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, marginTop: 14,
                      background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit",
                      fontSize: 13, fontWeight: 600, color: "var(--gold-dark)",
                    }}
                  >
                    {pathsExpanded
                      ? <>Show fewer paths <ChevronUp size={14} /></>
                      : <>Show all {learningPaths.length} paths <ChevronDown size={14} /></>}
                  </button>
                )}
                <hr className="enc-hairline" style={{ margin: "28px 0 0" }} />
              </div>
            )}

            {/* #190 — "Recommended for you": additive, above the untouched
                full grid below. Hidden entirely once search/filter narrows
                the view, or for any learner/trainer with no goal set. */}
            {recommended.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Recommended for you</div>
                <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 14 }}>
                  Based on your {goal} goal.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
                  {recommended.map(renderCourseCard)}
                </div>
                <hr className="enc-hairline" style={{ margin: "28px 0 0" }} />
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="enc-card" style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
                No courses match "{search}".
              </div>
            ) : (
              // #104 — column count is the only breakpoint-dependent property
              // (1 up to sm, 2 from sm, 3 from md), so it's the only thing on
              // Tailwind classes; gap stays inline like everywhere else.
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3" style={{ gap: 18 }}>
                {filtered.map(renderCourseCard)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}