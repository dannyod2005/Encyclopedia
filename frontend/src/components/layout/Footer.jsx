// #337 — single site-wide footer, rendered once from AppShell so every
// routed page (Dashboard, Catalogue, Learning, Leaderboard, Trainer
// Studio, Settings, Home) gets it for free instead of each screen
// wiring its own. Replaces the old logged-out-only "clickable
// prototype for demo purposes" line that used to live in HomeScreen.
//
// #345/#346 — Privacy & GDPR and About us both now have real pages
// (PrivacyScreen /privacy, AboutScreen /about), so both are wired to
// onGo below instead of the inert placeholder spans they started as.
export function Footer({ onGo }) {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 40 }}>
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "22px 28px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* #385 — real logo icon (decorative; copyright text already
              names the brand, so alt is empty rather than repeating it).
              #385 (perf follow-up) — logo-icon-web.png, a pre-scaled copy
              of the 332x285 master sized for this element's actual 16px
              render height (with headroom for 3x retina); see
              MarketingHeader.jsx's comment for the full reasoning behind
              why this matters for the "feels laggier" report. width= set
              explicitly (replacing "auto") so the browser doesn't wait on
              the image to know the footer row's layout. */}
          <img src="/logo-icon-web.png" alt="" width={19} height={16} style={{ height: 16, width: 19, display: "block" }} />
          {/* #403 — "Encyclopedia Learning" -> just "Encyclopedia". */}
          <span style={{ fontSize: 12.5, color: "var(--slate-light)" }}>
            &copy; {new Date().getFullYear()} Encyclopedia &middot; Singapore
          </span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <button
            type="button"
            onClick={() => onGo && onGo("privacy")}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit",
              fontSize: 12.5, color: "var(--slate-light)", cursor: "pointer",
            }}
          >
            Privacy &amp; GDPR
          </button>
          <button
            type="button"
            onClick={() => onGo && onGo("about")}
            style={{
              background: "none", border: "none", padding: 0, font: "inherit",
              fontSize: 12.5, color: "var(--slate-light)", cursor: "pointer",
            }}
          >
            About us
          </button>
        </div>
      </div>
    </footer>
  );
}
