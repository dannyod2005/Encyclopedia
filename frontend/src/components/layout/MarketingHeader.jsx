import { LogIn } from "lucide-react";

export function MarketingHeader({ onGo, onAuth }) {
  return (
    <header style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div className="px-4 md:px-7" style={{ maxWidth: 1160, margin: "0 auto", padding: "16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* #360 — was <div>/<span> with onClick: not real links/buttons,
            unreachable by keyboard. */}
        <div className="gap-4 md:gap-[34px]" style={{ display: "flex", alignItems: "center" }}>
          {/* #385 — real logo (replaces the placeholder EncyclopediaMark
              SVG + separate text span; the wordmark is baked into the
              image now).
              #385 (perf follow-up) — swapped to logo-full-web.png: the
              master logo-full.png is 1581x285 (kept full-res as the
              source asset for regenerating other sizes later), but this
              only ever renders at ~22-26px tall across the app, so every
              page load was decoding/rasterizing a ~450k-pixel bitmap for
              a ~3.5k-pixel result — the trade a vector mark never had to
              make, and the concrete cause of the "feels laggier" report
              once the SVG mark was replaced with a raster one. The -web
              variant is pre-scaled to 666x120 (~4.6x this element's own
              26px, enough headroom for 3x-retina displays) and
              quantized to a small colour palette, 197KB -> ~42KB.
              width= is set alongside the height so the browser reserves
              the box before the image decodes, instead of reflowing the
              header once it loads. */}
          <button type="button" onClick={() => onGo("home")} style={{ font: "inherit", display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <img src="/logo-full-web.png" alt="Encyclopedia" width={144} height={26} style={{ height: 26, width: 144, display: "block" }} />
          </button>
          {/* #392 — this row (logo + nav + two auth buttons, all in one
              unwrapping flex line) overflowed horizontally below ~600px:
              nothing here ever collapsed or hid, so a phone-width visitor
              had to scroll sideways to reach "Join for free". Hiding the
              Discover/Catalogue links below md is the simplest fix that
              doesn't need a hamburger just for two links — both are one
              tap away anyway (Discover is this same page; every screen
              also has a footer, and the hero below already has a
              "Browse catalogue" CTA). Logo + the two auth buttons (the
              actual conversion path) always stay visible. */}
          <nav className="hidden md:flex" style={{ gap: 24 }}>
            <button type="button" onClick={() => onGo("home")} style={{ font: "inherit", fontSize: 14, fontWeight: 500, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Discover</button>
            <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", fontSize: 14, fontWeight: 500, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Catalogue</button>
          </nav>
        </div>
        <div className="gap-2 md:gap-[10px]" style={{ display: "flex" }}>
          {/* aria-label covers the icon-only state below sm, where the
              text label is hidden for space (see comment above) — same
              "icon-only needs an accessible name" convention #258
              applied across the rest of the app. */}
          <button className="enc-btn enc-btn-ghost" aria-label="Log in" onClick={() => onAuth("login")}><LogIn size={15} /> <span className="hidden sm:inline">Log in</span></button>
          <button className="enc-btn enc-btn-gold" onClick={() => onAuth("signup")}>Join for free</button>
        </div>
      </div>
    </header>
  );
}