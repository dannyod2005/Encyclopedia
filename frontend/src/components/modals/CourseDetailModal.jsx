import { useEffect, useState } from "react";
import { CheckCircle2, Clock, X, ArrowRight, BookMarked } from "lucide-react";

import { Stars, CategoryDot } from "../../components/common/Primitives";
import { useFocusTrap } from "../../hooks/useFocusTrap";


/* ---------- Course detail modal ---------- */

// #105 — this component never actually unmounts (App.jsx always renders
// <CourseDetailModal course={selectedCourse} .../>); it just returns null
// when `course` is falsy. That means every close — the X, the backdrop
// click, "go to dashboard", or a successful enrol — is just `course`
// going null, regardless of which one triggered it. So rather than
// hooking every individual close handler, a single effect watches for
// that null transition and keeps rendering the last known course for one
// more animation frame (via `visibleCourse`) while a `closing` class
// plays the fade/scale-out, then actually drops the content.
export function CourseDetailModal({ course, onClose, onEnrol, onGoToDashboard, isEnrolled, enrolling, onFetchReviews }) {
  const [visibleCourse, setVisibleCourse] = useState(course);
  const [closing, setClosing] = useState(false);

  // #228 — written reviews for whichever course is open. Kept as its own
  // effect scoped to `course?.id` (not `visibleCourse`, same reasoning as
  // the effect below) rather than folded into the open/close effect,
  // since this is fetching new data on open, not just animating.
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    if (course) {
      setVisibleCourse(course);
      setClosing(false);
      return;
    }
    if (visibleCourse) {
      setClosing(true);
      const timer = setTimeout(() => setVisibleCourse(null), 160);
      return () => clearTimeout(timer);
    }
    // Deliberately scoped to `course` only; see comment above the
    // component for why `visibleCourse` must stay out of this array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  useEffect(() => {
    if (!course || !onFetchReviews) {
      setReviews([]);
      return;
    }
    setReviewsLoading(true);
    onFetchReviews(course.id)
      .then(setReviews)
      .catch((err) => console.error("Failed to load reviews:", err.message))
      .finally(() => setReviewsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  // #360 — active tied to visibleCourse (what actually controls whether
  // this dialog's DOM node is mounted), not `course` directly — course
  // can go truthy a render before visibleCourse (and the node) catch up.
  const dialogRef = useFocusTrap(!!visibleCourse);

  if (!visibleCourse) return null;

  // #360-fix — callers that pass a course object loaded with a narrower
  // set of relations (e.g. the path-embedded course rows from
  // LearningPathDetailModal, which don't carry modules/credits) shouldn't
  // crash the modal; default to empty lists like the skills/faqs/reviews
  // blocks above already do.
  const modules = visibleCourse.modules || [];
  const credits = visibleCourse.credits || [];

  return (
    <div onClick={onClose} className={`enc-modal-backdrop ${closing ? "enc-modal-closing" : ""}`} style={{ position: "fixed", inset: 0, background: "#16233Db3", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}>
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className={`enc-card enc-modal-card ${closing ? "enc-modal-closing" : ""}`}
        style={{ width: "100%", maxWidth: 620, maxHeight: "86vh", overflowY: "auto", padding: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="enc-course-modal-title"
        tabIndex={-1}
      >
        <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <CategoryDot color={visibleCourse.color} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{visibleCourse.category} · {visibleCourse.level}</span>
            </div>
            <h2 id="enc-course-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, margin: 0 }}>{visibleCourse.title}</h2>
            <div style={{ fontSize: 13, color: "var(--slate-light)", marginTop: 4 }}>{visibleCourse.provider}</div>
          </div>
          {/* #258 — real button (was a bare clickable icon). */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0, flexShrink: 0 }}
          >
            <X size={20} color="var(--slate)" />
          </button>
        </div>

        <div style={{ padding: "20px 28px" }}>
          <div style={{ display: "flex", gap: 22, marginBottom: 18, fontSize: 13, color: "var(--slate)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Clock size={14} /> {visibleCourse.hours} hours</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Stars rating={visibleCourse.rating} /> {visibleCourse.rating} ({visibleCourse.learners.toLocaleString()})</span>
          </div>

          {/* #228 — only rendered once there's something to show: no
              "loading"/"no reviews yet" placeholder, so a course with no
              written reviews (still the common case — reviewText is
              optional) looks exactly like it did before #228. */}
          {!reviewsLoading && reviews.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 10 }}>Reviews</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {reviews.map((r, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{r.authorName}</span>
                      <Stars rating={r.rating} />
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5 }}>{r.reviewText}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize: 14.5, color: "var(--ink-70)", lineHeight: 1.6, marginBottom: 22 }}>{visibleCourse.blurb}</p>

          {/* #226 — same "only render once non-empty" convention as the
              reviews block above: most courses will eventually have
              skills, but plenty won't yet, so no empty-state placeholder. */}
          {visibleCourse.skills && visibleCourse.skills.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 }}>
              {visibleCourse.skills.map((s, i) => (
                <span
                  key={i}
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px" }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 10 }}>Course agenda</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: 22 }}>
            {modules.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < modules.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--slate-light)", width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 14 }}>{m.title}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)", marginBottom: 10 }}>FAQ</div>
          <div style={{ marginBottom: 22 }}>
            {/* course.faqs comes from the DB (course_faqs table) — every seeded
                course has at least the placeholder pair from #8, so the fallback
                below mainly protects against a future course created with none. */}
            {(visibleCourse.faqs && visibleCourse.faqs.length > 0
              ? visibleCourse.faqs
              : [
                  { question: "Do I get a certificate?", answer: "Yes — issued automatically once all modules and the final project are complete." },
                  { question: "Can I go at my own pace?", answer: "Yes, all modules stay open for the life of your account." },
                ]
            ).map((item, i) => (
              <div key={item.id ?? i}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{item.question}</div>
                <div style={{ fontSize: 13.5, color: "var(--slate)", marginBottom: 12 }}>{item.answer}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <BookMarked size={13} color="var(--slate-light)" />
            <span style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "var(--slate-light)" }}>Sources & credits</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {credits.map((c, i) => (
              <li key={c.id} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--slate)", lineHeight: 1.55, padding: "5px 0", borderBottom: i < credits.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span style={{ color: "var(--gold-dark)", flexShrink: 0 }}>·</span>
                <span>{c.line}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky footer: a sibling of the scrollable content div above,
            both inside the same overflowY:auto card — sticky positions
            relative to that scroll container, so this pins to the bottom
            of the visible modal regardless of how long the agenda/FAQ/
            credits content above it is (#75). Own background + top
            border so scrolled content doesn't show through underneath it. */}
        <div style={{ position: "sticky", bottom: 0, background: "var(--paper-2)", borderTop: "1px solid var(--line)", padding: "16px 28px" }}>
          <button className="enc-btn enc-btn-gold"
            style={{ width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 15, opacity: enrolling ? 0.6 : 1, cursor: enrolling ? "default" : "pointer" }}
            disabled={enrolling}
            onClick={() => (isEnrolled ? onGoToDashboard() : onEnrol(visibleCourse))}>
            {enrolling
              ? <>Enrolling…</>
              : isEnrolled
              ? <><CheckCircle2 size={16} /> Already enrolled — go to My learning</>
              : <>Enrol now <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}