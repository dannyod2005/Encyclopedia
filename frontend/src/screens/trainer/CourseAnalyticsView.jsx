import { useEffect, useState } from "react";
import { ChevronLeft, Users, CheckCircle2, Target, AlertTriangle, Clock } from "lucide-react";

import { ScreenMessage } from "../../components/common/Primitives";

// #227 — trainer-facing view of how learners enrolled in one of their
// courses are actually doing: enrollment count, average completion %,
// average quiz score %, and a per-learner breakdown table with
// inactive/behind-pace flags. Fetch-on-mount with a cancelled guard, same
// shape as TeamTab's onFetchProvider effect — onFetchAnalytics is
// recreated every App.jsx render, so it's deliberately left out of the
// dependency array.
export function CourseAnalyticsView({ course, onBack, onFetchAnalytics }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // #454 — bumping this re-runs the fetch effect below, so the error
  // state's "Try again" button actually does something.
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onFetchAnalytics(course.id)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        // #454 — was `err.message || "Failed to load analytics."`,
        // rendering raw network/JS error text straight to the page.
        if (!cancelled) {
          console.error("Failed to load course analytics:", err);
          setError("Couldn't load analytics for this course — please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, reloadTick]);

  function formatLastActive(iso) {
    if (!iso) return "never";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const stat = { flex: 1, minWidth: 140, padding: 16 };

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth (also picks up margin:auto, which this page was missing —
    // same centering gap #204/#212 fixed on Dashboard/Learning).
    /* (tablet-padding fix) — horizontal padding now comes from the
       shared .enc-outer-pad scale instead of a flat 32px at every
       width; vertical stays inline. */
    <div className="enc-page-enter enc-page-scaled enc-outer-pad" style={{ paddingTop: 28, paddingBottom: 60, "--enc-page-base": "900px" }}>
      {/* #360 — was <div onClick>: not a real link/button. */}
      <button type="button" onClick={onBack} style={{ font: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 14 }}>
        <ChevronLeft size={15} /> Back to Trainer studio
      </button>
      <div style={{ fontSize: 19, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 4 }}>
        {course.title || "(untitled course)"}
      </div>
      <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 20 }}>Learner progress and quiz performance for this course.</div>

      {/* (461 — site-wide CLS audit) — was a single centered "Loading
          analytics…" line swapping to 3 stat cards + a variable-length
          learner list once resolved — same mismatch class as the other
          pages. Skeleton now mirrors the real stat-card shape, and the
          learner list gets the same fixed-height/scroll treatment as
          Dashboard's course lists (learner count is as unknowable ahead
          of time as any other enrollment-driven list in this app). */}
      {loading ? (
        <div aria-hidden="true">
          <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="enc-card" style={stat}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--line)", marginBottom: 10 }} />
                <div style={{ width: 28, height: 22, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                <div style={{ width: 70, height: 12, borderRadius: 4, background: "var(--line)" }} />
              </div>
            ))}
          </div>
          <div style={{ width: 90, height: 13, borderRadius: 4, background: "var(--line)", marginBottom: 12 }} />
          <div className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < 2 ? "1px solid var(--line)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ width: "35%", height: 14, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
                  <div style={{ width: "50%", height: 12, borderRadius: 4, background: "var(--line)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <ScreenMessage variant="error" message={error} onRetry={() => setReloadTick((t) => t + 1)} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
            {/* #385 — Enrolled switched to --blue-tint/--blue-dark: a
                lower-traffic, trainer-only page, so a good spot to trial
                a bit more blue without touching the main learner
                Dashboard's own stat row (which stays gold). */}
            <div className="enc-card" style={stat}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Users size={15} color="var(--blue-dark)" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{analytics.enrollmentCount}</div>
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Enrolled</div>
            </div>
            <div className="enc-card" style={stat}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--success-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <CheckCircle2 size={15} color="var(--success)" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{analytics.averageCompletionPct}%</div>
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Avg. completion</div>
            </div>
            <div className="enc-card" style={stat}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--coral-tint)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Target size={15} color="var(--coral)" />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>
                {analytics.averageQuizScorePct === null ? "—" : `${analytics.averageQuizScorePct}%`}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Avg. quiz score</div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 12 }}>Learners</div>

          <div className="enc-card" style={{ padding: 0, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
            {analytics.learners.length === 0 ? (
              <ScreenMessage bare message="No one has enrolled in this course yet." />
            ) : (
              analytics.learners.map((l, i) => (
                <div key={l.enrollmentId} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < analytics.learners.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      {l.name}
                      {l.flags.inactive && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--slate)", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 100, padding: "2px 8px" }}>
                          <Clock size={10} /> Inactive
                        </span>
                      )}
                      {l.flags.behindPace && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--coral)", background: "var(--coral-tint)", borderRadius: 100, padding: "2px 8px" }}>
                          <AlertTriangle size={10} /> Behind pace
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>
                      {l.status === "complete" ? "Completed" : `${l.progressPct}% complete`} · last active {formatLastActive(l.lastAccessed)}
                      {l.quizAverageScorePct !== null && ` · quiz avg ${l.quizAverageScorePct}%`}
                    </div>
                  </div>
                  <div style={{ width: 90 }}>
                    <div style={{ height: 5, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${l.progressPct}%`, background: l.status === "complete" ? "var(--success)" : "var(--gold)" }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
