import { useEffect, useState } from "react";
import { GraduationCap, Presentation } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";

const OPTIONS = [
  { value: "learner", label: "Learner", blurb: "Take courses and track your own progress.", icon: GraduationCap },
  { value: "trainer", label: "Trainer", blurb: "Create courses and manage a team's access.", icon: Presentation },
];

// #186 — shown once for an account whose profiles.role is still NULL,
// which today only happens for a Google sign-up (no role-toggle step
// before the OAuth redirect, unlike AuthModal's email signup form — see
// the MakeProfileRoleNullable migration). No "skip" here on purpose,
// unlike GoalOnboardingModal: goal is optional flavor the rest of the app
// already treats a missing value as a fine permanent state, but role is
// the value RequireTrainerGuard authorizes against and AppShell uses to
// decide what nav/routes even render — leaving it unset isn't a safe
// no-op the way skipping a goal is, so this always resolves to a real
// choice. Same "always mounted, closing animates before disappearing"
// shape as GoalOnboardingModal/AuthModal (#105).
export function RoleOnboardingModal({ open, onSelect }) {
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
      console.error("Failed to save role:", err.message);
      setSubmitting(false); // let them retry rather than getting stuck
    }
  }

  return (
    <div className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#16233Db3", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}>
      <div
        ref={dialogRef}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 440, padding: "28px 28px 24px" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-role-modal-title"
        tabIndex={-1}
      >
        <div id="enc-role-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, marginBottom: 6 }}>
          How will you use Encyclopedia?
        </div>
        <div style={{ fontSize: 13.5, color: "var(--slate)", marginBottom: 20 }}>
          One quick choice - this decides what you see next.
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
      </div>
    </div>
  );
}
