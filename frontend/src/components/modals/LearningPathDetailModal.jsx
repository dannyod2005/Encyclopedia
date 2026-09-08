import { useEffect, useState } from "react";
import { CheckCircle2, X, ArrowRight, Milestone } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";

/* ---------- Learning path detail modal ---------- */

// #224 — same "never actually unmounts, closing is just `path` going
// null" convention as CourseDetailModal (see that file's comment for the
// full reasoning behind visiblePath/closing).
export function LearningPathDetailModal({ path, onClose, onEnrol, onGoToDashboard, isEnrolled, enrolling, onOpenCourse }) {
  const [visiblePath, setVisiblePath] = useState(path);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (path) {
      setVisiblePath(path);
      setClosing(false);
      return;
    }
    if (visiblePath) {
      setClosing(true);
      const timer = setTimeout(() => setVisiblePath(null), 160);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // #360 — active tied to visiblePath (what actually controls whether
  // this dialog's DOM node is mounted), same reasoning as
  // CourseDetailModal's identical wiring.
  const dialogRef = useFocusTrap(!!visiblePath);

  if (!visiblePath) return null;
  return (
    <div onClick={onClose} className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#16233Db3", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 560, maxHeight: "86vh", overflowY: "auto", padding: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-path-modal-title"
        tabIndex={-1}
      >
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Milestone size={14} color="var(--gold-dark)" />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Learning path · {visiblePath.courses.length} courses</span>
            </div>
            <h2 id="enc-path-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, margin: 0 }}>{visiblePath.title}</h2>
          </div>
          {/* #258 — real button (was a bare clickable icon). */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0, flexShrink: 0 }}
          >
            <X size={20} color="var(--slate)" />
          </button>
        </div>

        <div style={{ padding: "20px 28px" }}>
          {visiblePath.description && (
            <p style={{ fontSize: 14.5, color: "var(--ink-70)", lineHeight: 1.6, marginBottom: 22 }}>{visiblePath.description}</p>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 10 }}>Courses, in order</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 6 }}>
            {/* #360 — was <div onClick>: not focusable. */}
            {visiblePath.courses.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={onOpenCourse ? () => onOpenCourse(c) : undefined}
                disabled={!onOpenCourse}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", width: "100%", textAlign: "left", font: "inherit", background: "none", border: "none", borderBottom: i < visiblePath.courses.length - 1 ? "1px solid var(--line)" : "none", cursor: onOpenCourse ? "pointer" : "default" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--slate-light)", width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--slate-light)" }}>{c.provider} · {c.hours}h</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Sticky footer, same convention as CourseDetailModal (#75). */}
        <div style={{ position: "sticky", bottom: 0, background: "var(--paper-2)", borderTop: "1px solid var(--line)", padding: "16px 28px" }}>
          <button className="enc-btn enc-btn-gold"
            style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 15, opacity: enrolling ? 0.6 : 1, cursor: enrolling ? "default" : "pointer" }}
            disabled={enrolling}
            onClick={() => (isEnrolled ? onGoToDashboard() : onEnrol(visiblePath))}>
            {enrolling
              ? <>Enrolling…</>
              : isEnrolled
              ? <><CheckCircle2 size={16} /> Already enrolled — go to My learning</>
              : <>Enrol in path <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
