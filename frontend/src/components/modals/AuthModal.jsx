import React, { useState } from "react";
import { X, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useFocusTrap } from "../../hooks/useFocusTrap";

// #105 — same "always mounted, sometimes null" shape as CourseDetailModal:
// this component doesn't unmount, it just returns null once `mode` clears.
// `visible`/`closing` let the close animation play for one more beat
// before the render actually drops, regardless of which of the several
// closes (X, backdrop, successful submit) triggered it.
export function AuthModal({ mode, onClose, onSubmit }) {
  const [tab, setTab] = useState(mode || "login");
  const [showPw, setShowPw] = useState(false);
  const [values, setValues] = useState({ name: "", email: "", password: "", role: "learner" });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [confirmEmailMessage, setConfirmEmailMessage] = useState(null);
  // #187 — "forgot password" is a third tab, but deliberately not one of
  // the values `mode` can be (App.jsx only ever opens this modal to
  // "login" or "signup") — it's reached by clicking the link from within
  // an already-open login tab, so it's local UI state rather than
  // something the parent needs to know how to open directly into.
  const [resetMessage, setResetMessage] = useState(null);
  const [visible, setVisible] = useState(!!mode);
  const [closing, setClosing] = useState(false);

  React.useEffect(() => {
    if (mode) {
      setTab(mode);
      setTouched(false);
      setSubmitting(false);
      setAuthError(null);
      setConfirmEmailMessage(null);
      setResetMessage(null);
      setVisible(true);
      setClosing(false);
      return;
    }
    if (visible) {
      setClosing(true);
      const timer = setTimeout(() => setVisible(false), 160);
      return () => clearTimeout(timer);
    }
    // Deliberately scoped to `mode` only; see comment above the
    // component for why `visible` must stay out of this array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // #360 — active tied to `visible` (what actually controls whether
  // this dialog's DOM node is mounted), same reasoning as
  // CourseDetailModal's identical wiring.
  const dialogRef = useFocusTrap(visible);

  if (!visible) return null;

  const emailValid = /\S+@\S+\.\S+/.test(values.email);
  const pwValid = values.password.length >= 8;
  const nameValid = tab === "login" || values.name.trim().length > 1;
  const canSubmit = tab === "forgot" ? emailValid : emailValid && pwValid && nameValid;

  function update(field, v) {
    setValues((prev) => ({ ...prev, [field]: v }));
  }

  // #187 — shared by every tab switch (login/signup/forgot, and "back to
  // log in" from the forgot tab) so stale error/success text from
  // whichever tab you were just on never bleeds into the next one.
  function switchTab(next) {
    setTab(next);
    setTouched(false);
    setAuthError(null);
    setConfirmEmailMessage(null);
    setResetMessage(null);
  }

  // #186 — full-page redirect to Google, then back. There's no session to
  // hand to onSubmit() synchronously the way the email flow has one: the
  // redirect leaves this component (and pendingCourse/auth-modal state)
  // behind entirely, and the returning session is picked up by
  // AuthContext's onAuthStateChange listener instead once the browser is
  // back on the app. Any account without a role yet (a first-time Google
  // sign-up — see MakeProfileRoleNullable) gets asked via the separate
  // role-onboarding modal once App.jsx's profile fetch confirms it, not here.
  async function handleGoogleSignIn() {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message || "Something went wrong. Please try again.");
  }

  // #187 — resetPasswordForEmail() always succeeds with no error even for
  // an email that doesn't have an account (Supabase's standard
  // enumeration-safe behaviour), so the confirmation message is
  // deliberately identical either way — same "check your email" framing
  // as signup's confirmEmailMessage above, and it doesn't leak whether the
  // address is registered. redirectTo matches the Google OAuth flow (#186):
  // land back on the app, where AuthContext's onAuthStateChange picks up
  // the resulting PASSWORD_RECOVERY session and App.jsx shows
  // ResetPasswordModal to actually set the new password.
  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setAuthError(null);
    setConfirmEmailMessage(null);
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      if (tab === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;

        setResetMessage("Check your email for a link to reset your password.");
        setSubmitting(false);
        return;
      }

      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: { name: values.name, role: values.role },
          },
        });
        if (error) throw error;

        if (!data.session) {
          // Email confirmation required — no session yet.
          setConfirmEmailMessage(
            "Check your email to confirm your account, then log in.",
          );
          setSubmitting(false);
          return;
        }

        onSubmit(data.session);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;

        onSubmit(data.session);
      }
    } catch (err) {
      setAuthError(err.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const field = {
    marginBottom: 16,
  };
  const label = {
    display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6,
  };
  const inputWrap = { position: "relative" };
  const errorText = { fontSize: 11.5, color: "var(--coral)", marginTop: 5 };

  return (
    <div onClick={onClose} className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}>
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 400, padding: 0, overflow: "hidden" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-auth-modal-title"
        tabIndex={-1}
      >
        <div style={{ padding: "24px 28px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            {/* #385 — real logo (wordmark is baked into the image).
                #385 (perf follow-up) — logo-full-web.png, a pre-scaled/
                quantized copy of the 1581x285 master sized for how small
                this ever renders (22px here); see MarketingHeader.jsx's
                comment for the full reasoning. width= alongside height=
                so the modal doesn't reflow once the image decodes. */}
            <div style={{ display: "flex", alignItems: "center" }}>
              <img src="/logo-full-web.png" alt="Encyclopedia" width={122} height={22} style={{ height: 22, width: 122, display: "block" }} />
            </div>
            {/* #258 — real button (was a bare clickable icon). */}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
            >
              <X size={19} color="var(--slate)" />
            </button>
          </div>

          {/* #187 — tab strip hides itself on the forgot-password tab: it's
              reached from within "Log in", not a peer of it, and "Back to
              log in" below covers the way back out. */}
          {/* #360 — was two <div onClick>: not focusable, no role/selected
              state. Real button, role="tab" + aria-selected inside a
              role="tablist", same fix as Trainer Studio/Learning screen. */}
          {tab !== "forgot" && (
            <div role="tablist" style={{ display: "flex", gap: 20, borderBottom: "1px solid var(--line)" }}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "login"}
                className={`enc-tab ${tab === "login" ? "active" : ""}`}
                onClick={() => switchTab("login")}
                style={{ background: "none", border: "none", font: "inherit" }}
              >
                Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signup"}
                className={`enc-tab ${tab === "signup" ? "active" : ""}`}
                onClick={() => switchTab("signup")}
                style={{ background: "none", border: "none", font: "inherit" }}
              >
                Create account
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "22px 28px 26px" }}>
          <div id="enc-auth-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 19, marginBottom: 4 }}>
            {tab === "login" ? "Welcome back" : tab === "signup" ? "Start learning free" : "Reset your password"}
          </div>
          <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 20 }}>
            {tab === "login"
              ? "Log in to pick up where you left off."
              : tab === "signup"
                ? "No credit card required — cancel anytime."
                : "Enter your account email and we'll send you a reset link."}
          </div>

          {tab === "signup" && (
            <div style={field}>
              <label style={label} htmlFor="enc-name">Full name</label>
              <div style={inputWrap}>
                <User size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
                <input id="enc-name" className="enc-input" placeholder="Jordan Lee" autoComplete="name"
                  value={values.name} onChange={(e) => update("name", e.target.value)} />
              </div>
              {touched && !nameValid && <div style={errorText}>Enter your name.</div>}
            </div>
          )}

          {tab === "signup" && (
            <div style={field}>
              <label style={label}>Account type</label>
              {/* #360 — was <span onClick>: not focusable/keyboard-operable.
                  Real button + aria-pressed. */}
              <div style={{ display: "flex", gap: 8 }}>
                {[["learner", "Learner"], ["trainer", "Trainer"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => update("role", v)} aria-pressed={values.role === v}
                    style={{
                      flex: 1, textAlign: "center", font: "inherit", fontSize: 13, fontWeight: 600, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                      border: "1px solid var(--line)",
                      background: values.role === v ? "var(--ink)" : "var(--paper-2)",
                      color: values.role === v ? "var(--paper)" : "var(--slate)",
                    }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={field}>
            <label style={label} htmlFor="enc-email">Email address</label>
            <div style={inputWrap}>
              <Mail size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input id="enc-email" type="email" className="enc-input" placeholder="you@company.com" autoComplete="email"
                value={values.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            {touched && !emailValid && <div style={errorText}>Enter a valid email address.</div>}
          </div>

          {tab !== "forgot" && (
            <div style={{ ...field, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={label} htmlFor="enc-pw">Password</label>
                {/* #360 — was <span onClick>: not a real link/button. */}
                {tab === "login" && (
                  <button
                    type="button"
                    onClick={() => switchTab("forgot")}
                    style={{ font: "inherit", fontSize: 12, fontWeight: 600, color: "var(--gold-dark)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 6 }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div style={inputWrap}>
                <Lock size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
                <input id="enc-pw" type={showPw ? "text" : "password"} className="enc-input" style={{ paddingRight: 40 }}
                  placeholder={tab === "signup" ? "At least 8 characters" : "Your password"}
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                  value={values.password} onChange={(e) => update("password", e.target.value)} />
                {/* #258 — real button, aria-label flips with the toggle
                    state so it always describes the action a click will
                    take, not just "eye icon". */}
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
          )}

          {authError && <div style={{ ...errorText, marginBottom: 12 }}>{authError}</div>}
          {confirmEmailMessage && (
            <div style={{ fontSize: 12.5, color: "var(--success)", marginBottom: 12 }}>{confirmEmailMessage}</div>
          )}
          {resetMessage && (
            <div style={{ fontSize: 12.5, color: "var(--success)", marginBottom: 12 }}>{resetMessage}</div>
          )}

          <button type="submit" className="enc-btn enc-btn-gold" style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 15, marginTop: 10, opacity: submitting ? 0.7 : 1 }}>
            {submitting
              ? "Please wait…"
              : tab === "login" ? "Log in" : tab === "signup" ? "Create free account" : "Send reset link"}
          </button>

          {/* #187 — Google sign-in isn't relevant to a password reset (a
              Google-only account has no password to reset in the first
              place), so this whole block — divider, button, and the
              "passwords are securely handled" footer below — is
              login/signup-only. */}
          {tab !== "forgot" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
                <hr className="enc-hairline" style={{ flex: 1 }} /><span style={{ fontSize: 11.5, color: "var(--slate-light)" }}>OR</span><hr className="enc-hairline" style={{ flex: 1 }} />
              </div>
              <button type="button" className="enc-btn enc-btn-ghost" style={{ width: "100%", justifyContent: "center", padding: "10px 0" }}
                onClick={handleGoogleSignIn}>
                <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.1z"/><path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75z"/></svg>
                Continue with Google
              </button>

              <div style={{ fontSize: 11.5, color: "var(--slate-light)", textAlign: "center", marginTop: 18, lineHeight: 1.5 }}>
                Real accounts — passwords are securely handled by Supabase Auth.
              </div>
            </>
          )}

          {tab === "forgot" && (
            <div
              onClick={() => switchTab("login")}
              style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", marginTop: 18, cursor: "pointer" }}
            >
              Back to log in
            </div>
          )}
        </form>
      </div>
    </div>
  );
}