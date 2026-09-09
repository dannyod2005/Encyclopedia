import { useEffect, useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";

// #187 — shown when AuthContext reports a PASSWORD_RECOVERY session: the
// user followed the link from their reset email and is back on the app
// with a temporary but real session already established. This is the
// "actually set the new password" half of the flow; AuthModal's forgot
// tab is the "request the email" half. No "skip" — closing without
// setting a new password just leaves the old one in place (the recovery
// session itself doesn't change anything), so the X is a genuine dismiss,
// not a "come back later" prompt like GoalOnboardingModal's skip.
// Same "always mounted, closing animates before disappearing" shape as
// the other modals (#105).
export function ResetPasswordModal({ open, onSubmit, onClose }) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      setPassword("");
      setConfirm("");
      setTouched(false);
      setSubmitting(false);
      setError(null);
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

  const pwValid = password.length >= 8;
  const matches = password === confirm;
  const canSubmit = pwValid && matches;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(password);
      // On success the parent flips `open` to false via clearPasswordRecovery,
      // which the effect above picks up to play the close animation.
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const field = { marginBottom: 16 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 };
  const inputWrap = { position: "relative" };
  const errorText = { fontSize: 11.5, color: "var(--coral)", marginTop: 5 };

  return (
    <div className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}>
      <div
        ref={dialogRef}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 400, padding: "28px 28px 24px" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-reset-pw-modal-title"
        tabIndex={-1}
      >
        <div id="enc-reset-pw-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, marginBottom: 6 }}>
          Set a new password
        </div>
        <div style={{ fontSize: 13.5, color: "var(--slate)", marginBottom: 20 }}>
          Choose a new password for your account.
        </div>

        <form onSubmit={handleSubmit}>
          <div style={field}>
            <label style={label} htmlFor="enc-new-pw">New password</label>
            <div style={inputWrap}>
              <Lock size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input id="enc-new-pw" type={showPw ? "text" : "password"} className="enc-input" style={{ paddingRight: 40 }}
                placeholder="At least 8 characters" autoComplete="new-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              {/* #258 — real button, aria-label flips with toggle state. */}
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((v) => !v)}
                style={{ position: "absolute", right: 13, top: 12, background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                {showPw
                  ? <EyeOff size={15} color="var(--slate-light)" />
                  : <Eye size={15} color="var(--slate-light)" />}
              </button>
            </div>
            {touched && !pwValid && <div style={errorText}>Password must be at least 8 characters.</div>}
          </div>

          <div style={{ ...field, marginBottom: 6 }}>
            <label style={label} htmlFor="enc-confirm-pw">Confirm password</label>
            <div style={inputWrap}>
              <Lock size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input id="enc-confirm-pw" type={showPw ? "text" : "password"} className="enc-input"
                placeholder="Re-enter your new password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {touched && pwValid && !matches && <div style={errorText}>Passwords don't match.</div>}
          </div>

          {error && <div style={{ ...errorText, marginBottom: 12 }}>{error}</div>}

          <button type="submit" className="enc-btn enc-btn-gold" style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 15, marginTop: 10, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Please wait…" : "Set new password"}
          </button>

          {/* #360 — was <div onClick>: not a real link/button. */}
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            style={{ display: "block", width: "100%", font: "inherit", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", background: "none", border: "none", padding: 0, marginTop: 18, cursor: submitting ? "default" : "pointer" }}
          >
            Not now
          </button>
        </form>
      </div>
    </div>
  );
}
