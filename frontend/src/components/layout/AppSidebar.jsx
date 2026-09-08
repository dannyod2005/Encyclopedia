import { BookOpen, LayoutGrid, Home as HomeIcon, Pencil, LogOut, X, Trophy, Settings as SettingsIcon } from "lucide-react";
import { getDisplayName, getInitials } from "../../lib/userDisplay";
import { EncyclopediaMark } from "../common/Primitives";

/* ---------- Logged-in app shell ---------- */

// #104/#218 — off-canvas on mobile (< md), a sticky in-flow sidebar on
// md+. mobileOpen/onCloseMobile only matter below md; the md: classes
// below override the mobile fixed/off-canvas positioning back to a
// normal flex item that also stays pinned to the viewport top while the
// page content scrolls (md:sticky + md:top-0), rather than #104's
// original md:static, which let the sidebar scroll away with the page
// on any content taller than one screen (#218). md:self-start stops the
// flex row's default align-items: stretch from forcing the aside's box
// to match the (possibly much taller) main content's height — without
// it, "sticky" has nothing to stick within because the box is already
// as tall as the whole page. Position/visibility live on Tailwind
// classes (the one thing inline style={{}} genuinely can't express —
// media queries); everything else (color, padding, layout) stays as the
// existing inline styles, unchanged.
export function AppSidebar({ screen, onGo, role, onLogout, user, goal = null, mobileOpen = false, onCloseMobile }) {
  const displayName = getDisplayName(user);
  const initials = getInitials(displayName);
  const items = [
    { key: "dashboard", label: "My learning", icon: LayoutGrid },
    { key: "catalogue", label: "Catalogue", icon: BookOpen },
    { key: "home", label: "Discover", icon: HomeIcon },
    // #231 — always visible, regardless of this learner's own opt-in
    // state: the leaderboard itself only ever lists learners who've
    // opted in, but browsing it (to see if anyone has) shouldn't require
    // having opted in yourself.
    { key: "leaderboard", label: "Leaderboard", icon: Trophy },
  ];
  if (role === "trainer") {
    items.push({ key: "trainer", label: "Trainer studio", icon: Pencil });
  }
  // #255 — always last, regardless of role: a personal-account link fits
  // more naturally at the end of the list than mixed in with the
  // content-browsing items above it.
  items.push({ key: "settings", label: "Settings", icon: SettingsIcon });
  return (
    <>
      {/* Backdrop: mobile only, tap to dismiss. Never rendered on md+. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:sticky md:top-0 md:self-start md:translate-x-0 md:z-auto ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ width: 220, flexShrink: 0, background: "var(--ink)", color: "var(--paper)", padding: "22px 14px", display: "flex", flexDirection: "column", gap: 4, minHeight: "100vh" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 10px 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EncyclopediaMark variant="dark" size={20} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--paper)" }}>Encyclopedia</span>
          </div>
          {/* #258 — real button (not a bare clickable icon) so this is
              keyboard-reachable and announces as "Close menu" to screen
              readers, same reasoning as the nav buttons below (#219).
              #283 — display used to live in the inline `style`, which
              always beat the md:hidden below regardless of screen width
              (inline styles outrank non-!important classes), leaving this
              visible and clickable on desktop too, even though the
              sidebar itself is permanently open there via md:translate-x-0
              below — so clicking it looked like it "did nothing." Moving
              display into the className fixes the same specificity issue
              as AppTopbar's hamburger button. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMobile}
            className="cursor-pointer inline-flex md:hidden"
            style={{ background: "none", border: "none", padding: 0, lineHeight: 0 }}
          >
            <X size={18} color="var(--paper)" />
          </button>
        </div>
        {items.map((it) => {
          const Icon = it.icon;
          const active = screen === it.key;
          // #219 — a real <button>, not a click-only <div>: gets keyboard
          // focus, Enter/Space activation, and "button" screen-reader
          // semantics for free. fontFamily/textAlign/width/border/background
          // are all set explicitly because browsers don't inherit typical
          // typography onto form controls by default (the old div did,
          // implicitly, via .enc-root) — every property here exists to make
          // the button visually identical to the div it replaces, not to
          // change the look.
          return (
            <button key={it.key} type="button" onClick={() => onGo(it.key)} aria-current={active ? "page" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer", fontSize: 14, fontWeight: 500, color: active ? "var(--ink)" : "var(--paper)", background: active ? "var(--gold-tint)" : "transparent" }}>
              <Icon size={16} color={active ? "var(--gold-dark)" : "var(--paper)"} />
              {it.label}
            </button>
          );
        })}
        <hr style={{ border: "none", borderTop: "1px solid #FFFFFF22", margin: "16px 4px" }} />
        <div style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 99, background: "var(--gold)", color: "#2B1E06", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--paper)" }}>{displayName}</div>
            {/* #107 — goal is null until a learner picks one via the
                onboarding modal (or if they skipped it); falls back to a
                generic label rather than showing nothing here, since a
                blank line under the name would look broken. */}
            <div style={{ fontSize: 11, color: "#B9C0CC" }}>{role === "trainer" ? "Trainer account" : goal || "Learner account"}</div>
          </div>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#B9C0CC", marginTop: 8 }}
          >
            <LogOut size={16} color="#B9C0CC" />
            Log out
          </button>
        )}
      </aside>
    </>
  );
}