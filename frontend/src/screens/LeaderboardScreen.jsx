import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

import { PageHeader, ScreenMessage } from "../components/common/Primitives";

// #231/#246 — global, opt-in leaderboard ranked by weekly learning points.
// Fetch-on-mount with a cancelled guard, same shape as
// CourseAnalyticsView's onFetchAnalytics effect — onFetchLeaderboard is
// recreated every App.jsx render, so it's deliberately left out of the
// dependency array.
// #348 — rank => [icon color, size]. Only ranks 1-3 get a differentiated
// treatment (gold/silver/bronze); everything else stays the plain
// number it already was. Kept as a lookup rather than inline ternaries
// in the row below so the row markup itself stays readable.
const MEDAL_STYLE = {
  1: { color: "#C4922F", size: 17 },
  2: { color: "#9AA5B1", size: 15 },
  3: { color: "#B87333", size: 15 },
};

export function LeaderboardScreen({ onFetchLeaderboard }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // #454 — bumping this re-runs the fetch effect below, giving the
  // error state below a working "Try again" button. Same reload-tick
  // pattern App.jsx already uses for Dashboard's retryDashboard.
  const [reloadTick, setReloadTick] = useState(0);

  // #348 — the current learner's own row, if they're opted in. Already
  // present in `entries` (isSelf), so this is just a lookup, not a
  // second fetch — used for the "your rank" summary card above the list.
  const myEntry = entries.find((e) => e.isSelf);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onFetchLeaderboard()
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        // #454 — was `err.message || "Failed to load the leaderboard."`,
        // rendering raw network/JS error text (e.g. "Failed to fetch")
        // straight to the page in coral. Always the friendly fallback now;
        // the fetch failure itself is still logged for debugging.
        if (!cancelled) {
          console.error("Failed to load leaderboard:", err);
          setError("Couldn't load the leaderboard — please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth, so this page grows (modestly, from its own 720 base) at
    // the same large breakpoint as the rest of the app.
    /* (tablet-padding fix) — horizontal padding now comes from the
       shared .enc-outer-pad scale instead of a flat 32px at every
       width; vertical stays inline. */
    /* (leaderboard-height fix, round 2) — the flat paddingBottom (first
       60, then 18) never actually let the footer land at the true
       bottom of a tall viewport: AppShell's <main> (App.jsx) is flex:1
       in the sidebar column but has no minHeight:0, so on a page whose
       own content is shorter than the leftover space, main couldn't
       shrink to exactly that leftover amount — it kept growing to at
       least this page's own natural content height, occasionally still
       coming up short of the real viewport and forcing a scrollbar with
       Footer half below the fold, even while whitespace was visible
       above it. Fixed at the source (App.jsx gets minHeight:0 on
       <main>) and completed here: this root is now itself a flex column
       filling main's now-correctly-resolved height (minHeight:"100%"),
       with a flex-grow spacer (below, after the list) standing in for
       the flat paddingBottom — it absorbs whatever leftover space
       main actually has, so Footer lands exactly at the bottom on
       devices with room to spare, and collapses to the same 18px floor
       as the personal-rank card's own marginBottom on devices without. */
    <div className="enc-page-enter enc-page-scaled enc-outer-pad" style={{ display: "flex", flexDirection: "column", minHeight: "100%", paddingTop: 28, "--enc-page-base": "720px" }}>
      {/* #364 — title dropped: this route is always reached logged-in
          (RequireAuth), so AppTopbar already shows "Leaderboard" as the
          page title. Subtitle stays — it's context, not a duplicate. */}
      <PageHeader subtitle="Ranked by learning points logged this week. Only learners who've opted in appear here." />

      {/* (461 — site-wide CLS audit) — was a single centered "Loading
          leaderboard…" line swapping to a rank list of unknowable length
          (depends on how many learners have opted in) once resolved.
          Skeleton now mirrors the real row shape, and the real list gets
          a fixed max-height + internal scroll, same reasoning as
          Dashboard's course lists and Course Analytics' learner list. */}
      {loading ? (
        <div aria-hidden="true" className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
              <div style={{ width: 26, height: 13.5, borderRadius: 4, background: "var(--line)" }} />
              <div style={{ width: 15 }} />
              <div style={{ flex: 1, height: 13.5, borderRadius: 4, background: "var(--line)" }} />
              <div style={{ width: 40, height: 13, borderRadius: 4, background: "var(--line)" }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <ScreenMessage variant="error" message={error} onRetry={() => setReloadTick((t) => t + 1)} />
      ) : entries.length === 0 ? (
        <ScreenMessage message="No one has opted in yet. Opt in from your dashboard to be the first." />
      ) : (
        <>
          {/* #348 — "your rank" summary, so a learner can see where they
              stand without hunting for their own row further down the
              list. Only rendered when they're actually opted in and
              present in `entries` — same "hidden until relevant"
              convention as the rest of the app's optional cards. */}
          {myEntry && (
            <div
              className="enc-card"
              style={{
                padding: "18px 20px", marginBottom: 18, background: "var(--gold-tint)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, lineHeight: 1, color: "var(--gold-dark)" }}>
                  #{myEntry.rank}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Your rank this week</div>
                  {/* #445 — --slate-light on --gold-tint measured at 4.39:1,
                      just under WCAG AA's 4.5:1 for this text size. --slate
                      on the same background is 4.88:1. Scoped to just this
                      card — --slate-light elsewhere in the app sits on
                      --paper, where it already passes at 4.93:1. */}
                  <div style={{ fontSize: 12, color: "var(--slate)" }}>
                    Out of {entries.length} learner{entries.length === 1 ? "" : "s"} on the leaderboard
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
                {myEntry.weeklyPoints} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--slate)" }}>pts</span>
              </div>
            </div>
          )}

          {/* (leaderboard-height fix) — was a flat 320px, well short of
              even the 10 test accounts already opted in, so the list
              scrolled internally while the whitespace below it (down to
              the page's own 60px paddingBottom) made the page look like
              it had barely any data. With the seed accounts staying
              opted in indefinitely, 10 rows is a realistic steady-state
              floor rather than an edge case, so sized to fit exactly 10
              rather than a number chosen to look good empty. Row heights
              aren't uniform (medal rows — ranks 1-3 — render 16px
              padding + the 17px trophy icon; plain rows render 14px
              padding + a 13.5px text line) plus a 1px border-bottom
              between each of the 9 gaps: 3*(32+17) + 7*(28+16.2) + 9 ≈
              468px.
              (leaderboard-height fix, round 3) — no marginBottom here
              anymore: Footer itself (Footer.jsx) already adds a fixed
              marginTop:40 before its own top border, same as every other
              page in the app relies on for breathing room above it. This
              card was stacking an extra 18px on top of that (58px total
              fixed space before Footer's visible edge), which was
              exactly enough on 1-2 borderline viewport heights to force
              a scrollbar that wouldn't otherwise have been needed. The
              flex-grow spacer below now owns 100% of the variable
              trailing space with a floor of 0 (down from 18), so those
              heights get every spare pixel back; Footer's own 40px still
              provides the same visual separation every other page gets. */}
          <div className="enc-card" style={{ padding: 0, overflow: "hidden", maxHeight: 468, overflowY: "auto" }}>
            {entries.map((e, i) => {
              const medal = MEDAL_STYLE[e.rank];
              return (
                <div
                  key={e.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: medal ? "16px 18px" : "14px 18px",
                    borderBottom: i < entries.length - 1 ? "1px solid var(--line)" : "none",
                    background: e.isSelf ? "var(--gold-tint)" : "transparent",
                  }}
                >
                  <div style={{
                    width: 26, textAlign: "center", fontFamily: "var(--font-mono)",
                    fontSize: medal ? 15 : 13.5, fontWeight: 600,
                    color: medal ? medal.color : "var(--slate-light)",
                  }}>
                    {e.rank}
                  </div>
                  {medal ? <Trophy size={medal.size} color={medal.color} /> : <div style={{ width: 15 }} />}
                  {/* (mobile-overflow fix) — a learner's display name is
                      user-set at signup and could be long/unspaced;
                      minWidth:0 lets this column shrink and overflowWrap
                      lets the name itself break instead of pushing the
                      points column off the row. */}
                  <div style={{ flex: 1, minWidth: 0, fontSize: medal ? 14.5 : 13.5, fontWeight: e.isSelf ? 700 : 600, overflowWrap: "break-word" }}>
                    {e.name}{e.isSelf ? " (you)" : ""}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--slate)" }}>
                    {e.weeklyPoints} pts
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* (leaderboard-height fix, round 2/3) — flex-grow spacer standing
          in for the old flat paddingBottom, floor 0 (see round 3's
          comment on the list card above for why it's 0 and not 18):
          grows to fill whatever's left of this column's (now correctly
          shrink/grow-able) height and shrinks back to nothing when there
          isn't any — rendered unconditionally (outside the loading/
          error/empty-state branch above) so every state gets the same
          consistent behavior, not just the populated list. */}
      <div style={{ flex: 1 }} aria-hidden="true" />
    </div>
  );
}
