import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

import { PageHeader } from "../components/common/Primitives";

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
        if (!cancelled) setError(err.message || "Failed to load the leaderboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth, so this page grows (modestly, from its own 720 base) at
    // the same large breakpoint as the rest of the app.
    <div className="enc-page-enter enc-page-scaled" style={{ padding: "28px 32px 60px", "--enc-page-base": "720px" }}>
      {/* #364 — title dropped: this route is always reached logged-in
          (RequireAuth), so AppTopbar already shows "Leaderboard" as the
          page title. Subtitle stays — it's context, not a duplicate. */}
      <PageHeader subtitle="Ranked by learning points logged this week. Only learners who've opted in appear here." />

      {loading ? (
        <div className="enc-card" style={{ padding: 40, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
          Loading leaderboard…
        </div>
      ) : error ? (
        <div className="enc-card" style={{ padding: 24, fontSize: 13.5, color: "var(--coral)", textAlign: "center" }}>
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="enc-card" style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
          No one has opted in yet. Opt in from your dashboard to be the first.
        </div>
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
                  <div style={{ fontSize: 12, color: "var(--slate-light)" }}>
                    Out of {entries.length} learner{entries.length === 1 ? "" : "s"} on the leaderboard
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
                {myEntry.weeklyPoints} <span style={{ fontSize: 12, fontWeight: 600, color: "var(--slate-light)" }}>pts</span>
              </div>
            </div>
          )}

          <div className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
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
                  <div style={{ flex: 1, fontSize: medal ? 14.5 : 13.5, fontWeight: e.isSelf ? 700 : 600 }}>
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
    </div>
  );
}
