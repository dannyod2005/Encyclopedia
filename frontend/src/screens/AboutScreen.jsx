import { PageHeader } from "../components/common/Primitives";
import { MarketingHeader } from "../components/layout/MarketingHeader";

// #346 — company/product "About us" page. Same shape as PrivacyScreen
// (#345): publicly accessible (no RequireAuth on its route in App.jsx),
// since this is the kind of page someone reads before signing up, not
// after. Content below reuses the product's existing marketing voice
// (see HomeScreen's logged-out hero copy) rather than inventing a new
// tone — placeholder-appropriate for a prototype/demo, swap in real
// copy once there's a finalized company description to use.
const SECTIONS = [
  {
    title: "What we do",
    // #403 — "Encyclopedia Learning" -> just "Encyclopedia".
    body: "Encyclopedia is a workplace learning platform for growing teams — short, project-based courses in AI, data, and leadership, built so a busy person can actually finish them. Trainers author courses and guided learning paths; learners track progress, sit quizzes, and earn certificates as they go.",
  },
  {
    title: "Our approach",
    body: "We'd rather ship fewer courses that get finished than a huge catalogue that doesn't. That means realistic time estimates, clear progress tracking, and grading that reflects real understanding — not just a bar that fills up.",
  },
  {
    title: "Where we're based",
    // #403 — "Encyclopedia Learning" -> just "Encyclopedia".
    body: "Encyclopedia is based in Singapore.",
  },
  {
    title: "Get in touch",
    // #403 — hello@encyclopedialearning.example -> hello@encyclopedia.example,
    // matching the wordmark simplification above.
    body: "Questions about the product, a course, or a partnership? Reach us at hello@encyclopedia.example.",
  },
];

export function AboutScreen({ loggedIn, onGo, onAuth }) {
  return (
    <div className="enc-page-enter">
      {!loggedIn && <MarketingHeader onGo={onGo} onAuth={onAuth} />}
      {/* Same narrower 760 base as PrivacyScreen — a reading page reads
          better with a tighter line length than the app's wider grid
          pages. */}
      <div className="enc-page-scaled" style={{ "--enc-page-base": "760px", padding: "36px 28px 60px" }}>
        {/* #364 — only shown logged out: AppTopbar already shows "About
            us" as the page title for logged-in visitors, and AppShell
            has no topbar at all when logged out, so this is the only
            title logged-out visitors get. */}
        {!loggedIn && <PageHeader title="About us" />}
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.6 }}>{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
