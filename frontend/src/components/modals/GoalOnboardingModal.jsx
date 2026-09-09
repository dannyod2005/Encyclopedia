import { useEffect, useState } from "react";
import { Code2, Briefcase, Compass, X } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";

const OPTIONS = [
  { value: "Technical", label: "Technical", blurb: "Programming, data, and engineering skills.", icon: Code2 },
  { value: "Business", label: "Business", blurb: "Strategy, analytics, and operations.", icon: Briefcase },
  { value: "Leadership", label: "Leadership", blurb: "Managing people and leading teams.", icon: Compass },
];

// #107/#189 — shown to any account (learner or trainer — see App.jsx's
// trigger effect) the first time we've confirmed their profile has no
// goal set yet, regardless of how they logged in. Never blocks: skipping
// just leaves profiles.goal null, same state as an existing account that
// predates this feature — Dashboard and the sidebar already treat a
// missing goal as "don't show it" rather than requiring one. For a
// trainer, this only ever feeds their own learner-facing views
// (Catalogue/Dashboard) — it has no bearing on Trainer Studio.
// Same "always mounted, closing animates before actually disappearing"
// shape as AuthModal/CourseDetailModal (#105), keyed on `open` here since
// there's no external content (like a course) to preserve through the close.
export function GoalOnboardingModal({ open, onSelect, onSkip }) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      setSubmitting(false);
      return;
    }
    if (visible) {
      setClosing(true);
      const timer = setTimeout(() => setVisible(false), 160);
      return () => clearTimeout(timer);
    }
    // Deliberately scoped to `open` only; see comment above the
    // component for why `visible` must stay out of this array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // #360 — active tied to `visible` (what actually controls whether
  // this dialog's DOM node is mounted), same reasoning as
  // CourseDetailModal's identical wiring.
  const dialogRef = useFocusTrap(visible);

  if (!visible) return null;

  async function handleSelect(value) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSelect(value);
      // On success the parent flips `open` to false, which the effect
      // above picks up to play the close animation. Nothing else to do here.
    } catch (err) {
      console.error("Failed to save goal:", err.message);
      setSubmitting(false); // let them retry rather than getting stuck
    }
  }

  return (
    <div className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}>
      <div
        ref={dialogRef}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 440, padding: "28px 28px 24px" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-goal-modal-title"
        tabIndex={-1}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div id="enc-goal-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20 }}>What brings you here?</div>
          {/* #258 — real button (was a bare clickable icon). */}
          <button
            type="button"
            aria-label="Skip"
            onClick={onSkip}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0, flexShrink: 0 }}
          >
            <X size={18} color="var(--slate)" />
          </button>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--slate)", marginBottom: 20 }}>
          Pick a focus area — it shows up on your dashboard and helps point you at relevant courses.
        </div>

        {/* #360 — was <div onClick>: not focusable. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={submitting}
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10,
                  width: "100%", textAlign: "left", font: "inherit",
                  border: "1px solid var(--line)", background: "var(--paper)",
                  cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--gold-tint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={17} color="var(--gold-dark)" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>{opt.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* #360 — was <div onClick>: not a real link/button. */}
        <button
          type="button"
          disabled={submitting}
          onClick={onSkip}
          style={{ display: "block", width: "100%", font: "inherit", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", background: "none", border: "none", padding: 0, marginTop: 18, cursor: submitting ? "default" : "pointer" }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
