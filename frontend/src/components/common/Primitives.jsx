import { Star } from "lucide-react";
/* ---------- small pieces ---------- */

// #385 — stars briefly used a dedicated --star token (a muted amber),
// split out from the brand-accent --gold while --gold was a cold muted
// blue, so ratings wouldn't carry that color. The palette revert back to
// the original warm gold (see global.css's :root history note) removed
// the reason for the split, so this reverts to var(--gold) directly,
// matching the original pre-rebrand code.
export function Stars({ rating }) {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={12} fill={n <= Math.round(rating) ? "var(--gold)" : "none"} color="var(--gold)" />
      ))}
    </span>
  );
}

export function EncyclopediaArch({ progress = 0, size = 44 }) {
  // 5 voussoir segments forming a simple arch; fills gold left-to-right by progress
  const segs = 5;
  const filled = Math.round(progress * segs);
  const w = size, h = size * 0.62;
  const segW = w / segs;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {Array.from({ length: segs }).map((_, i) => {
        const x = i * segW;
        const isFilled = i < filled;
        const t = i / (segs - 1);
        const lift = Math.sin(t * Math.PI) * (h * 0.32);
        return (
          <rect key={i} x={x + 1} y={h - h * 0.55 - lift} width={segW - 2} height={h * 0.55}
            rx={2} fill={isFilled ? "var(--gold)" : "var(--line)"} />
        );
      })}
    </svg>
  );
}

export function CategoryDot({ color }) {
  const map = { ink: "var(--ink)", gold: "var(--gold)", success: "var(--success)", coral: "var(--coral)" };
  return <span style={{ width: 7, height: 7, borderRadius: 99, background: map[color], display: "inline-block" }} />;
}

// #213 — shared page-level title, pulled out so Dashboard/Catalogue/
// Discover can't drift back into three different heading sizes the way
// they had (46px hero on Discover, 30px h1 on Catalogue, no title at all
// on Dashboard). 30px/font-display/600 matches Catalogue's original
// values exactly — the "middle" of the three, and the least disruptive
// to standardize on. `subtitle` is optional: Dashboard's greeting card
// already carries its own personalized context right below, so it only
// needs a bare title here.
// #364 — `title` is now optional too: AppTopbar renders the same text
// as a page-level h1 for every logged-in route, so most callers stopped
// passing it and pass only `subtitle` (if they have one) instead. Guard
// the <h1> on `title` being present rather than always rendering it —
// an empty h1 would still take up a line of height even with no text,
// which defeats the point of dropping the duplicate.
export function PageHeader({ title, subtitle }) {
  if (!title && !subtitle) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      {title && (
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, margin: subtitle ? "0 0 6px" : 0 }}>
          {title}
        </h1>
      )}
      {subtitle && <p style={{ color: "var(--slate)", fontSize: 14, margin: 0 }}>{subtitle}</p>}
    </div>
  );
}
