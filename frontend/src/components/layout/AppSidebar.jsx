import { BookOpen, LayoutGrid, Home as HomeIcon, Pencil, LogOut, X, Trophy, Settings as SettingsIcon } from "lucide-react";
import { getDisplayName, getInitials } from "../../lib/userDisplay";

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
        // #385 — history of this background: dark --ink with --paper
        // text (original) -> light --sidebar-bg with the plain logo on
        // it, because the logo had no contrast on dark (outline/chip
        // treatments tried and rejected as "cheap") -> back to dark now
        // that the logo itself has moved to AppTopbar instead of living
        // here (see that file) — nothing on this surface needs
        // light-background contrast anymore, so it's free to go dark
        // again purely for the structural anchor a dark rail gives the
        // layout. --sidebar-bg now aliases --ink directly (see
        // global.css); --sidebar-fg/--sidebar-fg-muted give the light-
        // on-dark text hierarchy below, mirroring how --ink/--slate/
        // --slate-light work on light surfaces.
        // #385 (blue-accent follow-up) — a radial-gradient glow layered
        // under the solid --sidebar-bg, anchored at the bottom-center and
        // fading to nothing by ~70% up the rail: after trialling the
        // logo's blue as flat icon-color swaps in several small spots (see
        // TrainerScreen/HomeScreen/DashboardScreen/AppTopbar #385 comments)
        // client feedback was that the more of those small flat touches
        // accumulated, the colder the app felt overall. This is a
        // different kind of touch — ambient light/depth rather than a
        // colored element — closer to how Linear/Vercel/Stripe-style dark
        // sidebars use a soft glow: it reads as atmosphere, not "a blue
        // thing," so it doesn't compete with the gold active-pill/avatar
        // sitting on top of it. As a `background-image` layer (not an
        // absolutely-positioned overlay div) it paints strictly behind
        // all sidebar content with zero z-index/stacking-context work —
        // children of a normal-flow element always paint above their own
        // parent's background. rgba alpha (0.28 at center, fading to 0)
        // rather than a token, since this needs partial transparency over
        // a solid navy base to blend rather than a flat fill; --blue's
        // raw RGB (21,163,225) is reused directly for consistency with
        // the token defined in global.css.
        style={{ width: 220, flexShrink: 0, background: "radial-gradient(circle at 50% 100%, rgba(21,163,225,0.28) 0%, rgba(21,163,225,0.10) 40%, rgba(21,163,225,0) 70%), var(--sidebar-bg)", color: "var(--sidebar-fg)", padding: "22px 14px", display: "flex", flexDirection: "column", gap: 4, minHeight: "100vh" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 10px 22px" }}>
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
              as AppTopbar's hamburger button.
              #385 — used to sit alongside the logo (justify-content:
              space-between); now that the logo has moved to AppTopbar,
              this is the only thing in the row, so it's right-aligned
              on its own (justify-content: flex-end) instead of leaving
              an empty gap where the logo used to be. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={onCloseMobile}
            className="cursor-pointer inline-flex md:hidden"
            style={{ background: "none", border: "none", padding: 0, lineHeight: 0 }}
          >
            <X size={18} color="var(--sidebar-fg)" />
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
          // #385 — active state history: a light --gold-tint pill (dark
          // sidebar, v1) -> a white --paper-2 pill with a shadow (light
          // sidebar, v2) -> a translucent white overlay (dark sidebar
          // again, v3, when --gold was a muted blue that only held
          // 2.5:1 against --ink) -> back to the original solid
          // --gold-tint pill (v4): the color revert restored --gold to
          // its original warm value, which brought --gold-tint's
          // contrast back with it (--ink on --gold-tint holds 12.77:1
          // now), so the translucent-white workaround is no longer
          // needed and this matches the original pre-rebrand code.
          return (
            <button key={it.key} type="button" onClick={() => onGo(it.key)} aria-current={active ? "page" : undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer", fontSize: 14, fontWeight: 500, color: active ? "var(--ink)" : "var(--sidebar-fg-muted)", background: active ? "var(--gold-tint)" : "transparent" }}>
              <Icon size={16} color={active ? "var(--gold-dark)" : "var(--sidebar-fg-muted)"} />
              {it.label}
            </button>
          );
        })}
        {/* #385 — var(--line) is a light-surface hairline (near-white)
            and would be invisible against the now-dark --sidebar-bg;
            a translucent white line reads the same way --line does on
            light surfaces — a subtle, barely-there divider. */}
        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.14)", margin: "16px 4px" }} />
        <div style={{ padding: "0 10px", display: "flex", alignItems: "center", gap: 10 }}>
          {/* #385 — avatar circle is unaffected by the sidebar bg going
              dark again (it's a self-contained accent-colored circle
              regardless of surface). Text color reverted to the
              original #2B1E06 alongside --gold's revert to its warm
              value — see .enc-btn-gold's comment in global.css for the
              same pairing and its contrast ratio. */}
          <div style={{ width: 30, height: 30, borderRadius: 99, background: "var(--gold)", color: "#2B1E06", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{initials}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sidebar-fg)" }}>{displayName}</div>
            {/* #107 — goal is null until a learner picks one via the
                onboarding modal (or if they skipped it); falls back to a
                generic label rather than showing nothing here, since a
                blank line under the name would look broken.
                #385 — var(--sidebar-fg-muted) (6.2:1 on --ink) is the
                dark-sidebar equivalent of var(--slate-light) on light
                surfaces. */}
            <div style={{ fontSize: 11, color: "var(--sidebar-fg-muted)" }}>{role === "trainer" ? "Trainer account" : goal || "Learner account"}</div>
          </div>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", width: "100%", textAlign: "left", fontFamily: "inherit", background: "transparent", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "var(--sidebar-fg-muted)", marginTop: 8 }}
          >
            <LogOut size={16} color="var(--sidebar-fg-muted)" />
            Log out
          </button>
        )}
      </aside>
    </>
  );
}