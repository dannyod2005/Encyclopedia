import { Star, AlertTriangle } from "lucide-react";
/* ---------- small pieces ---------- */

// #444 — shared hit-area expansion for icon-only buttons (bookmark
// toggles, password-visibility toggles, etc.): Lighthouse flagged these
// as too small to tap reliably (icon-only, padding:0, so the clickable
// area was just the icon itself — 15-16px, under the ~24px minimum it
// checks for). Padding + an equal-and-opposite negative margin grows
// the actual clickable/tappable area without changing the button's
// visible size or shifting surrounding layout — the negative margin
// exactly cancels the padding's effect on the box's footprint (this
// works the same way for position:absolute buttons too, e.g. the
// password-toggle icons anchored via top/right: the math is scheme-
// agnostic, since top/right only anchor the margin edge, and
// margin + padding still cancel out from there to the content).
// Spread this into an icon button's style object alongside whatever
// else it already sets (background/border/cursor/etc.).
export const iconButtonHitArea = { padding: 12, margin: -12 };

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
// #454 — shared "nothing to show" block for every data-fetching screen.
// Before this, the same two situations rendered inconsistently (or, on
// Catalogue, identically) across the app: Leaderboard showed a raw
// err.message in orange on fetch failure ("Failed to fetch" straight
// from the network layer), while Catalogue had no error state at all —
// a genuine outage and "no courses match your search" both rendered as
// the same grey "no results" text, with no way to tell them apart and
// no retry either way. Two variants, one shared shape:
//  - variant="error": the fetch failed. `message` must always be a
//    written, human fallback (e.g. "Couldn't load the leaderboard —
//    please try again.") — callers should never pass err.message
//    straight through, since that can read like raw JS/network text
//    instead of something a learner or trainer would understand. A
//    small AlertTriangle marks it as a failure without turning the
//    whole block red/alarming; a "Try again" button appears whenever
//    the caller passes onRetry (some fetches — e.g. a background
//    teaser — aren't worth exposing a retry for).
//  - variant="empty" (default): the fetch succeeded, there's just
//    nothing to show. No icon, no retry button — there's nothing to
//    retry.
// `bare` drops the enc-card wrapper/padding for use inside a container
// that's already an enc-card (e.g. one of Dashboard's side cards),
// so this never nests a card-in-a-card.
export function ScreenMessage({ variant = "empty", message, onRetry, padding = 40, bare = false }) {
  const isError = variant === "error";
  const content = (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: onRetry ? 14 : 0 }}>
        {isError && <AlertTriangle size={18} color="var(--coral)" />}
        <div>{message}</div>
      </div>
      {onRetry && (
        <button type="button" className="enc-btn enc-btn-gold" onClick={onRetry} style={{ cursor: "pointer" }}>
          Try again
        </button>
      )}
    </>
  );
  if (bare) {
    return (
      <div style={{ padding, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
        {content}
      </div>
    );
  }
  return (
    <div className="enc-card" style={{ padding, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
      {content}
    </div>
  );
}

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
