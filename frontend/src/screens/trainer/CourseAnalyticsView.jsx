import { useEffect, useState } from "react";
import { ChevronLeft, Users, CheckCircle2, Target, AlertTriangle, Clock } from "lucide-react";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onFetchAnalytics(course.id)
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id]);

  function formatLastActive(iso) {
    if (!iso) return "never";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const stat = { flex: 1, minWidth: 140, padding: 16 };

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth (also picks up margin:auto, which this page was missing —
    // same centering gap #204/#212 fixed on Dashboard/Learning).
    <div className="enc-page-enter enc-page-scaled" style={{ padding: "28px 32px 60px", "--enc-page-base": "900px" }}>
      {/* #360 — was <div onClick>: not a real link/button. */}
      <button type="button" onClick={onBack} style={{ font: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 14 }}>
        <ChevronLeft size={15} /> Back to Trainer studio
      </button>
      <div style={{ fontSize: 19, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 4 }}>
        {course.title || "(untitled course)"}
      </div>
      <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 20 }}>Learner progress and quiz performance for this course.</div>

      {loading ? (
        <div className="enc-card" style={{ padding: 40, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
          Loading analytics…
        </div>
      ) : error ? (
        <div className="enc-card" style={{ padding: 24, fontSize: 13.5, color: "var(--coral)", textAlign: "center" }}>
          {error}
        </div>
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

          <div className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
            {analytics.learners.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
                No one has enrolled in this course yet.
              </div>
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
