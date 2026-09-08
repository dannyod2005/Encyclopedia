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
            <div className="enc-card" style={{ position: "absolute", top: 42, right: 0, width: 320, maxHeight: 420, overflowY: "auto", padding: 0, zIndex: 40 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontSize: 13, fontWeight: 600 }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: 20, fontSize: 12.5, color: "var(--slate-light)", textAlign: "center" }}>
                  Nothing here yet.
                </div>
              ) : (
                notifications.map((n, i) => {
                  const Icon = TYPE_ICON[n.type] ?? MessageSquare;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleSelect(n)}
                      style={{
                        display: "flex", gap: 10, padding: "12px 16px", cursor: "pointer",
                        borderBottom: i < notifications.length - 1 ? "1px solid var(--line)" : "none",
                        background: n.read ? "transparent" : "var(--gold-tint)",
                      }}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={13} color="var(--gold-dark)" />
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
