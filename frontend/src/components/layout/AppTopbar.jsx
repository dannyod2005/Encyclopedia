import { useEffect, useRef, useState } from "react";
import { Menu, Bell, MessageSquare, Award, CheckCircle2 } from "lucide-react";

// #257 — one icon per notification type, including forum_reply (which had
// none before this) — now that the list can mix three different kinds of
// row, giving every row an icon keeps them visually consistent rather
// than making the two new types stand out as the only ones with one.
const TYPE_ICON = {
  forum_reply: MessageSquare,
  badge_earned: Award,
  course_completed: CheckCircle2,
};

// #104 — hamburger is mobile-only (md:hidden); on md+ this renders nothing
// and the topbar is pixel-identical to before this issue.
// #105 — sticky below md so it (and the hamburger) stays reachable while
// scrolling long screens like Catalogue/Trainer studio on mobile; md+ is
// back to normal static flow, unchanged from before.
// #229 — bell icon + unread badge on the right, first anchored-dropdown UI
// in this app (everything else — AuthModal, CourseDetailModal, etc. — is a
// full centered modal with its own backdrop). A small, glanceable list
// anchored under the bell fits a notification tray better than a modal
// would, so this introduces the new pattern rather than forcing it into
// the existing one.
export function AppTopbar({ title, onMenuClick, notifications = [], unreadCount = 0, onOpenNotification }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // #229 — click-anywhere-else-closes-it: this app has no prior anchored-
  // dropdown to copy a pattern from (everything else is a centered modal
  // with its own full-screen backdrop), so this is a standard
  // document-mousedown-outside-the-container listener, only attached while
  // the panel is actually open.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleSelect(n) {
    setOpen(false);
    onOpenNotification(n);
  }

  return (
    <div className="sticky top-0 z-20 md:static md:z-auto" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 32px", borderBottom: "1px solid var(--line)", background: "var(--paper-2)" }}>
      {/* #258 — real button, same reasoning as AppSidebar's own close
          button right above it: a bare icon with onClick is invisible to
          both keyboard and screen-reader users.
          #283 — display used to live in the inline `style`, which (having
          higher specificity than any non-!important class) always beat
          the md:hidden below regardless of screen width, leaving this
          visible on desktop too. Moving it into the className alongside
          md:hidden keeps both display rules as Tailwind utilities, so
          Tailwind's own mobile-first cascade order (md:hidden compiles
          after the base utilities) decides which wins instead of the
          inline style unconditionally overriding it. */}
      {onMenuClick && (
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuClick}
          className="cursor-pointer inline-flex md:hidden"
          style={{ background: "none", border: "none", padding: 0, lineHeight: 0 }}
        >
          <Menu size={22} color="var(--ink)" />
        </button>
      )}
      {/* #385 — the logo moved here from AppSidebar so the sidebar could
          go back to a dark background for structure (see AppSidebar.jsx
          and the global.css :root comment) without reintroducing the
          "navy logo has no contrast on a navy sidebar" problem that
          forced the outline treatment earlier — the topbar is (and
          always was) white, same surface the logo already sits on in
          MarketingHeader/AuthModal, so no new contrast work is needed
          here.
          Height 24, measured rather than eyeballed: logo-full.png's
          canvas has ~12/10px of built-in top/bottom padding around the
          actual icon+wordmark (out of 285px total height, ~92% content
          fill), so displaying it at a raw height of N only renders
          about 0.92*N of visible ink. The title's actual rendered
          height at fontSize 22/Poppins 600 (checked via canvas
          text-metrics + a live DOM rect: ~22-24px ink-to-ink for "My
          learning", including the 'g'/'y' descenders) needs the logo
          displayed at ~24px so its own visible content (24 * 0.92 ≈
          22px) lines up with the title's, rather than the two numbers
          matching but the actual glyphs/artwork not lining up. This
          held after the #385 font swap from Fraunces to Poppins too —
          re-measured post-swap and the two fonts' ink heights at this
          size land within a pixel of each other, so no height change
          was needed. The thin divider gives the brand mark its own
          visual "slot" separate from the page title rather than the
          two running together — bumped to match the new logo height. */}
      {/* #385 (perf follow-up) — logo-full-web.png, a pre-scaled/
          quantized copy of the 1581x285 master (197KB) sized for how
          small this ever renders (24px here, 22-26px at the other 2
          usage sites) — see MarketingHeader.jsx's comment for the full
          reasoning; this was the concrete cause behind "the app feels
          laggier" once the SVG mark was replaced with a raster one.
          width= set alongside height= so the topbar row doesn't reflow
          once the image decodes. */}
      <img src="/logo-full-web.png" alt="Encyclopedia" width={133} height={24} style={{ height: 24, width: 133, display: "block", flexShrink: 0 }} />
      {/* #385 — reverted to plain --line: the blue tint tried here read
          as a washed-out gray rather than a deliberate blue (a 1px hairline
          is too thin/translucent to carry visible hue against white), and
          it was adding to a "the more blue touches, the colder it looks"
          effect the client flagged — see AppSidebar.jsx's radial-glow
          comment for where that blue touch moved to instead. */}
      <div style={{ width: 1, height: 24, background: "var(--line)", flexShrink: 0 }} aria-hidden="true" />
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, margin: 0, flex: 1 }}>{title}</h1>

      {onOpenNotification && (
        <div ref={containerRef} style={{ position: "relative" }}>
          {/* #258 — real button + aria-expanded (the panel it controls is a
              relative-positioned popover, not a native <details>/<dialog>,
              so aria-expanded is what tells AT whether it's currently
              open). aria-label folds the unread count in too, since the
              badge itself is a plain <span> a screen reader would
              otherwise just skip past. */}
          <button
            type="button"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{ position: "relative", cursor: "pointer", background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8 }}
          >
            <Bell size={19} color="var(--ink)" />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 3, right: 3, minWidth: 15, height: 15, borderRadius: 100,
                background: "var(--coral)", color: "#fff", fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
              }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            // #385 — top was a flat 42px, measured against the bell
            // button's own 34px box and not the topbar row around it, so
            // it undershot: this container (containerRef) sits 18px down
            // from the topbar's top edge (the topbar's own padding-top),
            // and the topbar has another 18px of padding-bottom + a 1px
            // border-bottom below the container's 34px-tall box before the
            // page content actually starts — 19px of "topbar" the old
            // value didn't account for, which is exactly the overlap that
            // was reported. calc(100% + 27px) = 100% (container's own
            // bottom, i.e. flush with the bell button) + 19px to actually
            // clear the topbar's padding/border + an 8px visual gap so the
            // panel reads as clearly separate rather than touching.
            // Written relative to the container (100%) rather than a
            // second flat number so it keeps tracking correctly if the
            // button/row sizing ever changes.
            <div className="enc-card" style={{ position: "absolute", top: "calc(100% + 27px)", right: 0, width: 320, maxHeight: 420, overflowY: "auto", padding: 0, zIndex: 40 }}>
              {/* #385 — just this header strip bumped one shade below
                  --paper-2 (#FDFBF6) to #F8F4E9, not the whole panel: it
                  was blending into the panel body below it. Still lighter
                  than the page's own --paper (#F5F0E3). Contrast checked
                  on this exact shade: --ink 14.24:1 — comfortably past AA
                  for the "Notifications" label. */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 13, fontWeight: 600, background: "#F8F4E9" }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12.5, color: "var(--slate-light)", textAlign: "center" }}>
                  Nothing here yet.
                </div>
              ) : (
                notifications.map((n, i) => {
                  const Icon = TYPE_ICON[n.type] ?? MessageSquare;
                  // #385 — was a full-width var(--gold-tint) fill on unread
                  // rows; with the page's own background warmed up (see
                  // global.css's :root history), that fill sat close enough
                  // in weight to --gold-tint itself that an unread row read
                  // as a bigger, stronger block of color than either the
                  // panel's own "Notifications" header bar or the small
                  // icon-chip badges inside each row — the two things that
                  // should read as the prominent elements ended up the
                  // quietest ones on the page. A 3px left accent bar (always
                  // rendered, transparent when read) signals unread without
                  // filling the row, so the header/icon-chip go back to
                  // being the most visually "present" pieces. Kept as a
                  // border rather than a background so read/unread rows
                  // stay the same total width — no layout shift when a
                  // notification gets marked read.
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleSelect(n)}
                      style={{
                        display: "flex", gap: 10, padding: "12px 16px", cursor: "pointer",
                        borderBottom: i < notifications.length - 1 ? "1px solid var(--line)" : "none",
                        borderLeft: n.read ? "3px solid transparent" : "3px solid var(--gold)",
                      }}
                    >
                      {/* #385 — icon color switched to --blue-dark: the
                          unread-row background stays --gold-tint (that's
                          a state signal — read vs unread — so it keeps
                          the interactive-accent color), but the icon
                          glyph itself is decorative and sits right below
                          the topbar's own blue-tinted divider, so it's
                          another small, contained spot to trial the
                          logo's blue. */}
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={13} color="var(--blue-dark)" />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {n.type === "forum_reply" && (
                          <>
                            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                              {n.actorName} replied to your post
                            </div>
                            <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2, lineHeight: 1.4 }}>
                              {n.excerpt}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--slate-light)", marginTop: 4 }}>
                              {n.moduleTitle} · {n.courseTitle}
                            </div>
                          </>
                        )}
                        {n.type === "badge_earned" && (
                          <>
                            <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                              You earned a badge: {n.badgeLabel}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2, lineHeight: 1.4 }}>
                              {n.badgeDescription}
                            </div>
                          </>
                        )}
                        {n.type === "course_completed" && (
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                            You completed {n.courseTitle}!
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
