import { LogIn } from "lucide-react";

export function MarketingHeader({ onGo, onAuth }) {
  return (
    <header style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* #360 — was <div>/<span> with onClick: not real links/buttons,
            unreachable by keyboard. */}
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
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
          <nav style={{ display: "flex", gap: 24 }}>
            <button type="button" onClick={() => onGo("home")} style={{ font: "inherit", fontSize: 14, fontWeight: 500, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Discover</button>
            <button type="button" onClick={() => onGo("catalogue")} style={{ font: "inherit", fontSize: 14, fontWeight: 500, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>Catalogue</button>
          </nav>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="enc-btn enc-btn-ghost" onClick={() => onAuth("login")}><LogIn size={15} /> Log in</button>
          <button className="enc-btn enc-btn-gold" onClick={() => onAuth("signup")}>Join for free</button>
        </div>
      </div>
    </header>
  );
}