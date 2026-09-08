import { LogIn } from "lucide-react";
import { EncyclopediaMark } from "../common/Primitives";

export function MarketingHeader({ onGo, onAuth }) {
  return (
    <header style={{ borderBottom: "1px solid var(--line)", background: "var(--paper-2)", position: "sticky", top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* #360 — was <div>/<span> with onClick: not real links/buttons,
            unreachable by keyboard. */}
        <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
          <button type="button" onClick={() => onGo("home")} style={{ font: "inherit", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
            <EncyclopediaMark variant="light" size={22} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19 }}>Encyclopedia</span>
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