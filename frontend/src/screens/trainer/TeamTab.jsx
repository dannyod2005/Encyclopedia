import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, RefreshCw, LogOut, X, Crown } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { ScreenMessage } from "../../components/common/Primitives";

const field = { marginBottom: 16 };
const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 };
// #350 — outline:none removed; global.css's input:focus-visible rule
// supplies a visible focus outline instead (see TrainerCourseEditor's
// identical rowInput for the full rationale).
const rowInput = { fontFamily: "var(--font-body)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%", background: "var(--paper-2)" };

// #139 — the "Team" tab. Deliberately separate from the course-creation
// form: provider membership is an opt-in upgrade managed only from here,
// never a gate on creating a course (course creation stays untouched).
export function TeamTab({ onFetchProvider, onCreateProvider, onJoinProvider, onRegenerateInviteCode, onLeaveProvider, currentUserId }) {
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState(null); // ProviderDetailDto | null (null = confirmed not a member, once loading is false)
  const [fetchError, setFetchError] = useState(null);
  // #454 — bumping this re-runs the fetch effect below, so the fetch-
  // failed state's "Try again" button actually does something.
  const [reloadTick, setReloadTick] = useState(0);

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);
  const [copied, setCopied] = useState(false);

  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // #360 — simple conditional-mount confirm modal, no deferred-unmount
  // state, so active ties directly to the same truthiness as the `&&`.
  const leaveDialogRef = useFocusTrap(confirmingLeave);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    onFetchProvider()
      .then(setProvider)
      .catch((err) => {
        // #454 — was `err.message` rendered directly (raw network/JS
        // error text, e.g. "Failed to fetch"); always the friendly
        // fallback now.
        console.error("Failed to load provider:", err);
        setFetchError("Couldn't load your team — please try again.");
      })
      .finally(() => setLoading(false));
    // Fetch on mount, and again whenever reloadTick changes (the #454
    // retry button) — onFetchProvider is recreated on every App.jsx
    // render (not memoized), same pattern as LearningScreen's per-tab
    // fetch effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!createName.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      await onCreateProvider(createName.trim());
      setProvider(await onFetchProvider());
      setCreateName("");
    } catch (err) {
      setCreateError(err.message || "Failed to create provider.");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setJoining(true);
    setJoinError(null);
    try {
      await onJoinProvider(joinCode.trim());
      setProvider(await onFetchProvider());
      setJoinCode("");
    } catch (err) {
      setJoinError(err.message || "Failed to join provider.");
    } finally {
      setJoining(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const updated = await onRegenerateInviteCode();
      setProvider((prev) => (prev ? { ...prev, inviteCode: updated.inviteCode } : prev));
    } catch (err) {
      setRegenerateError(err.message || "Failed to regenerate invite code.");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(provider.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // code is still visible on screen to copy by hand, so this is a
      // silent no-op rather than surfacing an error for a non-critical
      // convenience action.
    }
  }

  async function handleConfirmLeave() {
    setLeaving(true);
    setLeaveError(null);
    try {
      await onLeaveProvider();
      setProvider(null);
      setConfirmingLeave(false);
    } catch (err) {
      setLeaveError(err.message || "Failed to leave provider.");
    } finally {
      setLeaving(false);
    }
  }

  if (loading) {
    // (461 follow-up) — was a cramped single-line "Loading…" card with
    // just a minHeight bump; upgraded to a real skeleton, but this is
    // still necessarily an approximation: the real content afterward is
    // one of two structurally different layouts (the two-card create/join
    // form for a non-member, or the provider/member-list detail card for
    // a member), and which one applies — plus, for the member case, how
    // many rows the member list needs — genuinely isn't knowable until
    // onFetchProvider resolves. Modeled on the member-detail layout (the
    // richer of the two, and the one an established trainer is more
    // likely to already be in) with a plausible 3-member list; a
    // first-time trainer who resolves to the create/join form instead
    // will see this skeleton shrink down to that shorter layout — a
    // residual shift in that one case, but a far smaller and rarer one
    // than the previous single line vs. either full layout.
    return (
      <div className="enc-card" aria-hidden="true" style={{ padding: 20, maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ width: 150, height: 17, borderRadius: 4, background: "var(--line)", marginBottom: 8 }} />
            <div style={{ width: 70, height: 12.5, borderRadius: 4, background: "var(--line)" }} />
          </div>
          <div style={{ width: 76, height: 32, borderRadius: 8, background: "var(--line)" }} />
        </div>
        <div style={field}>
          <div style={{ width: 80, height: 12.5, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
          <div style={{ height: 34, borderRadius: 8, background: "var(--line)" }} />
        </div>
        <div>
          <div style={{ width: 60, height: 12.5, borderRadius: 4, background: "var(--line)", marginBottom: 6 }} />
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ padding: "10px 12px", borderBottom: i < 2 ? "1px solid var(--line)" : "none" }}>
                <div style={{ width: `${45 + i * 10}%`, height: 13, borderRadius: 4, background: "var(--line)" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return <ScreenMessage variant="error" message={fetchError} onRetry={() => setReloadTick((t) => t + 1)} />;
  }

  if (!provider) {
    return (
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <form onSubmit={handleCreate} className="enc-card" style={{ padding: 20, flex: "1 1 320px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Create a provider</div>
          <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 16, lineHeight: 1.5 }}>
            Start a team. You'll get an invite code to share with other trainers.
          </div>
          <div style={field}>
            <label style={label}>Provider name</label>
            <input
              style={rowInput}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Encyclopedia Business School"
              disabled={creating}
            />
          </div>
          {createError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 12 }}>{createError}</div>}
          <button className="enc-btn enc-btn-gold" type="submit" disabled={creating || !createName.trim()}>
            {creating ? "Creating…" : "Create provider"}
          </button>
        </form>

        <form onSubmit={handleJoin} className="enc-card" style={{ padding: 20, flex: "1 1 320px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Join a provider</div>
          <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 16, lineHeight: 1.5 }}>
            Have an invite code from a teammate? Join their provider instead.
          </div>
          <div style={field}>
            <label style={label}>Invite code</label>
            <input
              style={{ ...rowInput, textTransform: "uppercase" }}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. K7M9QRXT"
              disabled={joining}
            />
          </div>
          {joinError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 12 }}>{joinError}</div>}
          <button className="enc-btn enc-btn-ghost" type="submit" disabled={joining || !joinCode.trim()}>
            {joining ? "Joining…" : "Join provider"}
          </button>
        </form>
      </div>
    );
  }

  const isOwner = provider.ownerId === currentUserId;

  return (
    <div className="enc-card" style={{ padding: 20, maxWidth: 640 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>{provider.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 2 }}>
            {provider.members.length} member{provider.members.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          className="enc-btn enc-btn-ghost"
          style={{ color: "var(--coral)" }}
          onClick={() => { setConfirmingLeave(true); setLeaveError(null); }}
        >
          <LogOut size={14} /> Leave
        </button>
      </div>

      <div style={field}>
        <label style={label}>Invite code</label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ ...rowInput, fontFamily: "monospace", letterSpacing: 1.5, flex: 1 }}>{provider.inviteCode}</div>
          {/* #258 — title alone isn't exposed to all screen readers; explicit
              aria-label added, reflecting the copied/not-copied state. */}
          <button className="enc-btn enc-btn-ghost" type="button" onClick={handleCopy} title="Copy invite code" aria-label={copied ? "Invite code copied" : "Copy invite code"}>
            {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
          </button>
          {isOwner && (
            <button className="enc-btn enc-btn-ghost" type="button" onClick={handleRegenerate} disabled={regenerating} title="Regenerate invite code" aria-label="Regenerate invite code">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        {regenerateError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 8 }}>{regenerateError}</div>}
        {!isOwner && (
          <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginTop: 6 }}>Only the provider owner can regenerate this code.</div>
        )}
      </div>

      <div>
        <label style={label}>Members</label>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
          {provider.members.map((m, i) => (
            <div
              key={m.id}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                borderBottom: i < provider.members.length - 1 ? "1px solid var(--line)" : "none",
                fontSize: 13,
              }}
            >
              <span style={{ flex: 1 }}>{m.name || "(unnamed)"}{m.id === currentUserId ? " (you)" : ""}</span>
              {m.isOwner && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--gold)", fontWeight: 600 }}>
                  <Crown size={12} /> Owner
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* #301 — portaled to document.body: TeamTab is rendered inside
          TrainerScreen's enc-page-enter-animated root, whose entrance
          animation leaves a `transform` applied via
          animation-fill-mode: both even after it finishes. Any ancestor
          with a transform becomes a new containing block for a
          `position: fixed` descendant, so without the portal this
          backdrop was sized to that (narrower, shorter) root div instead
          of the real viewport — it only ever dimmed part of the screen
          instead of covering it. Same fix applied to TrainerScreen's two
          delete-confirm modals and DashboardScreen's Unenroll/Retake
          modal. */}
      {confirmingLeave && createPortal(
        <div
          onClick={() => !leaving && setConfirmingLeave(false)}
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={leaveDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-leave-provider-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-leave-provider-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>Leave provider?</div>
              {/* #258 — real button (was a bare clickable icon). */}
              <button
                type="button"
                aria-label="Close"
                disabled={leaving}
                onClick={() => setConfirmingLeave(false)}
                style={{ background: "none", border: "none", padding: 0, cursor: leaving ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20 }}>
              You'll lose shared edit access to courses scoped to <strong>{provider.name}</strong>. Courses you personally own are unaffected.
            </div>
            {leaveError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>{leaveError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" disabled={leaving} onClick={() => setConfirmingLeave(false)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff", opacity: leaving ? 0.7 : 1 }}
                disabled={leaving}
                onClick={handleConfirmLeave}
              >
                {leaving ? "Leaving…" : "Leave provider"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
