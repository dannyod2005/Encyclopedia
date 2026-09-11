import { useState } from "react";
import { User, Lock, Eye, EyeOff, Trophy } from "lucide-react";

import { getDisplayName } from "../lib/userDisplay";
import { iconButtonHitArea } from "../components/common/Primitives";

// #296 — the original 150/300/450/600/900 presets (and the 300 default
// below) were calibrated on the old flat per-action point values
// (view/quiz/note/post, all 30-50 pts). They never accounted for
// module-completion points, which scale with course.hours and average
// ~1,350-1,578 pts per module across the real course catalog — so
// finishing a single module cleared every preset, including the top one,
// on 38 of 40 courses. Rescaled around that real average: well below it,
// up through roughly it, topping out just under 2x it.
const DAILY_GOAL_PRESETS = [500, 1000, 1500, 2200, 3000];

/* ---------- Screen: Account settings ---------- */

// #255 — a dedicated settings screen. Three cards: Profile (name, which
// used to have no edit path at all), Password (previously only reachable
// via the forgot-password email flow), and Preferences (daily goal +
// leaderboard opt-in, moved here from DashboardScreen's sidebar rather
// than duplicated — see DashboardScreen's own #255 comment).
export function SettingsScreen({
  user,
  onUpdateName,
  onChangePassword,
  activitySummary = { dailyGoalPoints: 1500 }, // #296 — matches the new signup default
  onUpdateDailyGoal,
  leaderboardOptIn = false,
  onUpdateLeaderboardOptIn,
  onOpenLeaderboard,
}) {
  // --- Profile name ---
  // #255 — prefilled from getDisplayName(user) (Supabase auth metadata),
  // the same value shown everywhere else a user sees their own name
  // (greeting, sidebar) — not a separate fetch of profile.name, which can
  // only ever be reached via a round trip and would just show the same
  // thing in the common case anyway (see updateName's own comment for why
  // saving writes both).
  const [name, setName] = useState(getDisplayName(user));
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);
  const [nameSaved, setNameSaved] = useState(false);

  async function handleSaveName(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || savingName) return;
    setSavingName(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await onUpdateName(trimmed);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2400);
    } catch (err) {
      setNameError(err.message || "Failed to update name.");
    } finally {
      setSavingName(false);
    }
  }

  // --- Password ---
  // #255 — same 8-char-minimum + confirm-match validation as
  // ResetPasswordModal (the forgot-password flow's equivalent form).
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwTouched, setPwTouched] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState(null);
  const [pwSaved, setPwSaved] = useState(false);

  const pwValid = password.length >= 8;
  const pwMatches = password === confirm;
  const canSubmitPw = pwValid && pwMatches;

  async function handleSavePassword(e) {
    e.preventDefault();
    setPwTouched(true);
    setPwError(null);
    if (!canSubmitPw || savingPw) return;
    setSavingPw(true);
    try {
      await onChangePassword(password);
      setPassword("");
      setConfirm("");
      setPwTouched(false);
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2400);
    } catch (err) {
      setPwError(err.message || "Failed to update password.");
    } finally {
      setSavingPw(false);
    }
  }

  // --- Preferences: daily goal + leaderboard opt-in ---
  // #255 — moved verbatim from DashboardScreen (#188/#231), same
  // handler shape, just living here instead.
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingLeaderboardOptIn, setSavingLeaderboardOptIn] = useState(false);

  async function handlePickDailyGoal(points) {
    if (savingGoal || points === activitySummary.dailyGoalPoints) return;
    setSavingGoal(true);
    try {
      await onUpdateDailyGoal(points);
    } catch (err) {
      console.error("Failed to update daily goal:", err.message);
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleToggleLeaderboardOptIn() {
    if (savingLeaderboardOptIn) return;
    setSavingLeaderboardOptIn(true);
    try {
      await onUpdateLeaderboardOptIn(!leaderboardOptIn);
    } catch (err) {
      console.error("Failed to update leaderboard opt-in:", err.message);
    } finally {
      setSavingLeaderboardOptIn(false);
    }
  }

  // Viewport-fit pass — trimmed the shared field/label spacing plus the
  // per-card padding/margins below (was 16/6, cards were 20px padding +
  // 20px gap) so the three-card form has a better shot at fitting under
  // one viewport alongside AppTopbar/Footer on a laptop-height screen.
  const field = { marginBottom: 14 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 };
  const inputWrap = { position: "relative" };
  const errorText = { fontSize: 12, color: "var(--coral)", marginTop: 6 };
  const savedText = { fontSize: 12, color: "var(--success)", marginTop: 6 };

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth, so this form grows (modestly, from its own 640 base) at
    // the same large breakpoint as the rest of the app.
    <div className="enc-page-enter enc-page-scaled" style={{ padding: "22px 32px", "--enc-page-base": "640px" }}>
      {/* #364 — was <PageHeader title="Account settings" />: AppTopbar
          already shows that same text as this route's h1, so this was a
          plain duplicate. */}
      <div className="enc-card" style={{ padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>Profile</div>
        <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 12 }}>
          Your name appears on your own greeting, plus any forum posts or course reviews you leave.
        </div>
        <form onSubmit={handleSaveName}>
          <div style={field}>
            <label style={label} htmlFor="enc-settings-name">Name</label>
            <div style={inputWrap}>
              <User size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input
                id="enc-settings-name"
                type="text"
                className="enc-input"
                style={{ paddingLeft: 38 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            {/* #349 — wrapper stays mounted (aria-live regions only get
                picked up by a screen reader if they already exist in the
                DOM before their content changes) so success/error text
                mounting inside it gets announced instead of silently
                appearing. */}
            <div aria-live="polite" role="status">
              {nameError && <div style={errorText}>{nameError}</div>}
              {nameSaved && <div style={savedText}>Saved.</div>}
            </div>
          </div>
          <button type="submit" className="enc-btn enc-btn-gold" disabled={savingName || !name.trim()} style={{ opacity: savingName ? 0.7 : 1 }}>
            {savingName ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      <div className="enc-card" style={{ padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 4 }}>Password</div>
        <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 12 }}>
          Choose a new password for your account.
        </div>
        <form onSubmit={handleSavePassword}>
          <div style={field}>
            <label style={label} htmlFor="enc-settings-pw">New password</label>
            <div style={inputWrap}>
              <Lock size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input
                id="enc-settings-pw"
                type={showPw ? "text" : "password"}
                className="enc-input"
                style={{ paddingLeft: 38, paddingRight: 40 }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/* #349 — was a bare Eye/EyeOff icon with onClick, not focusable
                  or announced by a screen reader. Same real-button pattern
                  #258 already used for this exact control in
                  ResetPasswordModal/AuthModal — #258 covered those two but
                  missed this one, since SettingsScreen didn't exist yet. */}
              <button
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                onClick={() => setShowPw((v) => !v)}
                // #444 — iconButtonHitArea grows the tappable area (Lighthouse
                // flagged this as too small) without shifting the icon's
                // visible position — see that constant's comment for why the
                // padding/negative-margin trick works the same for an
                // absolutely-positioned button as a statically-positioned one.
                style={{ position: "absolute", right: 13, top: 12, background: "none", border: "none", cursor: "pointer", display: "inline-flex", lineHeight: 0, ...iconButtonHitArea }}
              >
                {showPw
                  ? <EyeOff size={15} color="var(--slate-light)" />
                  : <Eye size={15} color="var(--slate-light)" />}
              </button>
            </div>
            {pwTouched && !pwValid && <div style={errorText}>Password must be at least 8 characters.</div>}
          </div>
          <div style={field}>
            <label style={label} htmlFor="enc-settings-pw-confirm">Confirm password</label>
            <div style={inputWrap}>
              <Lock size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 12 }} />
              <input
                id="enc-settings-pw-confirm"
                type={showPw ? "text" : "password"}
                className="enc-input"
                style={{ paddingLeft: 38 }}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {pwTouched && pwValid && !pwMatches && <div style={errorText}>Passwords don't match.</div>}
          </div>
          {/* #349 — same always-mounted aria-live wrapper as the name form
              above, so save success/failure is announced. */}
          <div aria-live="polite" role="status">
            {pwError && <div style={errorText}>{pwError}</div>}
            {pwSaved && <div style={savedText}>Password updated.</div>}
          </div>
          <button type="submit" className="enc-btn enc-btn-gold" disabled={savingPw} style={{ opacity: savingPw ? 0.7 : 1 }}>
            {savingPw ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>

      <div className="enc-card" style={{ padding: "18px 22px" }}>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>Preferences</div>

        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate)", marginBottom: 6 }}>Daily goal</div>
        {/* #349 — was <span onClick>: not focusable/keyboard-operable, and
            the selected preset wasn't announced. Real button + aria-pressed
            so it's reachable by Tab/Enter and a screen reader hears which
            preset is currently selected. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAILY_GOAL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handlePickDailyGoal(m)}
              disabled={savingGoal}
              aria-pressed={m === activitySummary.dailyGoalPoints}
              style={{
                font: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 100,
                cursor: savingGoal ? "default" : "pointer", opacity: savingGoal ? 0.6 : 1,
                background: m === activitySummary.dailyGoalPoints ? "var(--ink)" : "var(--paper-2)",
                color: m === activitySummary.dailyGoalPoints ? "var(--paper)" : "var(--slate)",
                border: "1px solid var(--line)",
              }}
            >
              {m} pts
            </button>
          ))}
        </div>

        <hr className="enc-hairline" style={{ margin: "14px 0" }} />

        {/* #258 — was two separate divs (label + switch) each with their own
            onClick calling the same handler; neither had a role, checked
            state, or accessible name. Merged into a single real button with
            role="switch"/aria-checked so it's keyboard-operable and
            announces its on/off state, instead of adding aria-label to an
            unreachable div. */}
        <button
          type="button"
          role="switch"
          aria-checked={leaderboardOptIn}
          aria-label="Show me on the leaderboard"
          disabled={savingLeaderboardOptIn}
          onClick={handleToggleLeaderboardOptIn}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%",
            background: "none", border: "none", padding: 0, cursor: savingLeaderboardOptIn ? "default" : "pointer",
            opacity: savingLeaderboardOptIn ? 0.6 : 1, font: "inherit",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink)" }}>
            <Trophy size={14} color="var(--gold-dark)" />
            Show me on the leaderboard
          </span>
          <span
            style={{
              width: 32, height: 18, borderRadius: 100, padding: 2,
              background: leaderboardOptIn ? "var(--gold)" : "var(--line)",
              display: "flex", justifyContent: leaderboardOptIn ? "flex-end" : "flex-start", flexShrink: 0,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: 99, background: "#fff", display: "block" }} />
          </span>
        </button>
        {/* #349 — was <div onClick>: not a real link/button, so it was
            unreachable by keyboard and invisible to a screen reader as an
            interactive element. */}
        {leaderboardOptIn && onOpenLeaderboard && (
          <button
            type="button"
            onClick={onOpenLeaderboard}
            style={{ font: "inherit", fontSize: 12, color: "var(--gold-dark)", fontWeight: 600, marginTop: 10, background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            View leaderboard →
          </button>
        )}
      </div>
    </div>
  );
}
