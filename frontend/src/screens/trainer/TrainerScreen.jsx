import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Pencil, Plus, Search, Trash2, X, BarChart3, BookOpen, Users, Milestone, UsersRound } from "lucide-react";

import { CategoryDot, PageHeader } from "../../components/common/Primitives";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { TrainerCourseEditor } from "./TrainerCourseEditor";
import { TeamTab } from "./TeamTab";
import { LearningPathEditor } from "./LearningPathEditor";
import { CourseAnalyticsView } from "./CourseAnalyticsView";

export function TrainerScreen({
  courses,
  onSaveCourse,
  onDeleteCourse,
  onFetchQuizForEdit,
  onSaveQuiz,
  onFetchProvider,
  onFetchProfile,
  onFetchVideoDuration,
  onCreateProvider,
  onJoinProvider,
  onRegenerateInviteCode,
  onLeaveProvider,
  currentUserId,
  paths = [],
  onSavePath,
  onDeletePath,
  onFetchCourseAnalytics,
  onFetchOverview,
}) {
  const [editingId, setEditingId] = useState(null); // null = list view, "__new" = creating, else course id
  const [deletingCourse, setDeletingCourse] = useState(null); // course pending delete confirmation, or null
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // #360 — simple conditional-mount confirm modal, no deferred-unmount
  // state, so active ties directly to the same truthiness as the `&&`.
  const deleteCourseDialogRef = useFocusTrap(!!deletingCourse);
  // #227 — same whole-screen-swap convention as editingId/editingPathId
  // above, but view-only (no onSave/onCancel-into-list-refresh dance
  // needed) — just which course's analytics is currently open, or null.
  const [viewingAnalyticsId, setViewingAnalyticsId] = useState(null);
  // #224 — path editor mirrors the course editor's editingId state machine
  // exactly: null = list view, "__new" = creating, else the path id being
  // edited. Kept as its own state (not reused editingId) since a path and
  // a course are different resources that can never both be "being
  // edited" at once, but each needs its own independent list-view default.
  const [editingPathId, setEditingPathId] = useState(null);
  const [deletingPath, setDeletingPath] = useState(null);
  const [deletePathError, setDeletePathError] = useState(null);
  const [deletingPathBusy, setDeletingPathBusy] = useState(false);
  // #360 — same reasoning as deleteCourseDialogRef above.
  const deletePathDialogRef = useFocusTrap(!!deletingPath);
  // #139 — "Courses" (existing list/editor flow, untouched) vs "Team"
  // (provider create/join/manage). Deliberately a separate tab rather than
  // anything on the course form itself — provider scoping stays an opt-in
  // upgrade managed from here, never a gate on creating a course.
  // #224 adds a third "Paths" tab following the same convention.
  const [tab, setTab] = useState("courses");

  // #185 — search-by-title + ownership filter for the course list,
  // matching Catalogue's search/chip pattern. Ownership rather than
  // category: "mine" vs. "view only" is the split that already exists
  // per-row (via canEditCourse below) and is the one that actually
  // matters when a trainer is hunting for a course to edit, so it's the
  // more useful chip set for this screen specifically.
  const [courseSearch, setCourseSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All"); // "All" | "Mine" | "View only"

  // #155 — need the trainer's own providerId to mirror
  // RequireCourseOwnerGuard's "shared provider member" branch client-side.
  // Fetched once on mount, same cancelled-flag pattern as
  // TrainerCourseEditor's onFetchProvider/onFetchProfile effect —
  // onFetchProfile is recreated every App.jsx render, so it's deliberately
  // left out of the dependency array.
  const [myProfile, setMyProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    onFetchProfile().then((profile) => {
      if (!cancelled) setMyProfile(profile);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #259 — the stats-panel data for the "trainer home" overview. Same
  // fetch-once-on-mount, cancelled-flag shape as myProfile above; failure
  // just leaves the panel hidden (see the `overview &&` guard below) rather
  // than blocking the rest of the screen, since Trainer Studio's actual
  // CRUD tools underneath don't depend on it at all.
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    onFetchOverview()
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        // Silently leave `overview` null — see comment above.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #155 — mirrors RequireCourseOwnerGuard exactly: a NULL ownerId is a
  // legacy/pre-ownership course, exempted (editable by any trainer);
  // otherwise the caller must be the owner, or share the course's
  // provider. Keeping this logic here means the buttons never claim a
  // course is editable when the server would actually reject the request
  // — until myProfile has loaded, the provider-sharing branch just can't
  // pass yet, so at worst a shared course's buttons appear a beat late,
  // never early.
  function canEditCourse(course) {
    if (course.ownerId == null) return true;
    if (course.ownerId === currentUserId) return true;
    if (course.providerId && myProfile?.providerId === course.providerId) {
      return true;
    }
    return false;
  }

  const byOwnership =
    ownerFilter === "All"
      ? courses
      : courses.filter((c) => (ownerFilter === "Mine" ? canEditCourse(c) : !canEditCourse(c)));
  const query = courseSearch.trim().toLowerCase();
  // #206 — match provider too, same as Catalogue's search
  // (title.includes || provider.includes) — a trainer hunting for a
  // course by the team/provider it belongs to, not its exact title,
  // was coming up empty here even though Catalogue's identical-looking
  // search box already supported that.
  const filteredCourses = query
    ? byOwnership.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(query) ||
          (c.provider || "").toLowerCase().includes(query),
      )
    : byOwnership;

  const editingCourse =
    editingId === "__new" ? null :
    editingId ? courses.find((c) => c.id === editingId) : null;

  // #224 — mirrors canEditCourse exactly, against a LearningPath instead of
  // a Course (same ownerId/providerId shape server-side, via
  // RequireLearningPathOwnerGuard).
  function canEditPath(path) {
    if (path.ownerId == null) return true;
    if (path.ownerId === currentUserId) return true;
    if (path.providerId && myProfile?.providerId === path.providerId) {
      return true;
    }
    return false;
  }

  const editingPath =
    editingPathId === "__new" ? null :
    editingPathId ? paths.find((p) => p.id === editingPathId) : null;

  async function handleSave(draft) {
    await onSaveCourse(draft); // throws on failure — editor catches and shows the error
    setEditingId(null);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteCourse(deletingCourse.id);
      setDeletingCourse(null);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete course.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSavePath(draft) {
    await onSavePath(draft); // throws on failure — editor catches and shows the error
    setEditingPathId(null);
  }

  async function handleConfirmDeletePath() {
    setDeletingPathBusy(true);
    setDeletePathError(null);
    try {
      await onDeletePath(deletingPath.id);
      setDeletingPath(null);
    } catch (err) {
      setDeletePathError(err.message || "Failed to delete learning path.");
    } finally {
      setDeletingPathBusy(false);
    }
  }

  if (editingId) {
    return (
      <TrainerCourseEditor
        course={editingCourse}
        onCancel={() => setEditingId(null)}
        onSave={handleSave}
        onFetchQuizForEdit={onFetchQuizForEdit}
        onSaveQuiz={onSaveQuiz}
        onFetchProvider={onFetchProvider}
        onFetchProfile={onFetchProfile}
        onFetchVideoDuration={onFetchVideoDuration}
      />
    );
  }

  if (editingPathId) {
    return (
      <LearningPathEditor
        path={editingPath}
        courses={courses}
        onCancel={() => setEditingPathId(null)}
        onSave={handleSavePath}
      />
    );
  }

  // Course no longer exists (e.g. deleted from another tab/session) — falls
  // through to the normal list view below rather than rendering a view for
  // nothing; no render-time state mutation needed since viewingAnalyticsId
  // just naturally resets the next time the trainer opens/closes this view.
  const viewingAnalyticsCourse = viewingAnalyticsId
    ? courses.find((c) => c.id === viewingAnalyticsId)
    : null;

  if (viewingAnalyticsCourse) {
    return (
      <CourseAnalyticsView
        course={viewingAnalyticsCourse}
        onBack={() => setViewingAnalyticsId(null)}
        onFetchAnalytics={onFetchCourseAnalytics}
      />
    );
  }

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth (also picks up margin:auto, which this page was missing —
    // same centering gap #204/#212 fixed on Dashboard/Learning).
    <div className="enc-page-enter enc-page-scaled" style={{ padding: "28px 32px", "--enc-page-base": "1080px" }}>
      {/* #364 — was a hand-rolled 15px title ("Trainer studio") above this
          subtitle, duplicating AppTopbar's own title for this route at a
          size wildly inconsistent with every other page's 30px
          PageHeader. Routed through the shared PageHeader (subtitle-only,
          same as Catalogue's dynamic subheading) instead of hand-rolling
          a second, differently-sized subtitle style. */}
      <PageHeader
        subtitle={
          tab === "courses"
            ? "Add courses, edit catalogue details, and manage module videos."
            : tab === "paths"
              ? "Bundle existing courses into an ordered, guided sequence."
              : "Create or join a provider to share course edit access with your team."
        }
      />

      {/* #259 — trainer-home stats row, same "flex row of stat cards"
          convention as DashboardScreen's In progress/Completed/Certificates
          row. Hidden until the overview has loaded (see the effect above);
          no loading placeholder here since the tab content below it is
          usable immediately regardless. */}
      {overview && (
        <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
          {/* #385 — Team used to double up on --gold-tint/--gold-dark
              (same pairing as Courses), which made two of the four cards
              look identical. Now that --gold is reserved as the single
              CTA/interactive accent, Team is a good small, contained spot
              for the new --blue-tint/--blue-dark pair (sampled from the
              logo, see the :root comment) — a stat-card icon chip, not a
              button, so it stays a minimal nod to the logo rather than a
              second competing accent. Also gives all four cards a
              distinct color instead of two matching by coincidence. */}
          {[
            { label: "Courses", value: overview.totalCourses, icon: BookOpen, tint: "var(--gold-tint)", fg: "var(--gold-dark)" },
            { label: "Students", value: overview.totalStudents, icon: Users, tint: "var(--success-tint)", fg: "var(--success)" },
            { label: "Learning paths", value: overview.totalPaths, icon: Milestone, tint: "var(--coral-tint)", fg: "var(--coral)" },
            { label: "Team", value: overview.teamSize, icon: UsersRound, tint: "var(--blue-tint)", fg: "var(--blue-dark)" },
          ].map((s) => (
            <div key={s.label} className="enc-card" style={{ flex: 1, minWidth: 140, padding: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: s.tint, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <s.icon size={15} color={s.fg} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 500 }}>{s.value}</div>
              <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* #360 — was three <div onClick>: not focusable, no role/selected
          state, so a keyboard-only user couldn't switch tabs at all. Real
          buttons in a role="tablist", each a role="tab" with aria-selected
          reflecting `tab` — reachable by Tab, activated with Enter/Space. */}
      <div role="tablist" style={{ display: "flex", gap: 20, borderBottom: "1px solid var(--line)", marginBottom: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "courses"}
          className={`enc-tab ${tab === "courses" ? "active" : ""}`}
          onClick={() => setTab("courses")}
          style={{ background: "none", border: "none", font: "inherit" }}
        >
          Courses
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "paths"}
          className={`enc-tab ${tab === "paths" ? "active" : ""}`}
          onClick={() => setTab("paths")}
          style={{ background: "none", border: "none", font: "inherit" }}
        >
          Paths
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "team"}
          className={`enc-tab ${tab === "team" ? "active" : ""}`}
          onClick={() => setTab("team")}
          style={{ background: "none", border: "none", font: "inherit" }}
        >
          Team
        </button>
      </div>

      {/* #105 — key={tab} remounts this wrapper on tab switch, replaying
          the enc-tab-panel fade defined in global.css. */}
      <div key={tab} className="enc-tab-panel">
      {tab === "courses" && (
        <>
          {/* #185 — search by title + ownership filter, same visual
              pattern as Catalogue's search/chip row. */}
          <div className="flex flex-col items-stretch md:flex-row md:items-center" style={{ gap: 14, marginBottom: 14 }}>
            <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={15} color="var(--slate-light)" style={{ position: "absolute", left: 13, top: 11 }} />
              <input
                className="enc-input"
                placeholder="Search by title"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
              />
            </div>
            {/* #360 — was <span onClick>: not focusable/keyboard-operable.
                Real button + aria-pressed so a keyboard user can Tab to and
                switch the ownership filter. */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["All", "Mine", "View only"].map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOwnerFilter(o)}
                  aria-pressed={ownerFilter === o}
                  style={{
                    font: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 100, cursor: "pointer",
                    background: ownerFilter === o ? "var(--ink)" : "var(--paper-2)", color: ownerFilter === o ? "var(--paper)" : "var(--slate)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button className="enc-btn enc-btn-gold" onClick={() => setEditingId("__new")}><Plus size={15} /> New course</button>
          </div>

          <div className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
            {filteredCourses.map((c, i) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < filteredCourses.length - 1 ? "1px solid var(--line)" : "none" }}>
                <CategoryDot color={c.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.title || "(untitled course)"}</div>
                  <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>{c.provider} · {c.modules.length} modules · {c.hours}h</div>
                </div>
                {canEditCourse(c) ? (
                  <>
                    <button className="enc-btn enc-btn-ghost" onClick={() => setViewingAnalyticsId(c.id)}><BarChart3 size={14} /> Analytics</button>
                    <button className="enc-btn enc-btn-ghost" onClick={() => setEditingId(c.id)}><Pencil size={14} /> Edit</button>
                    <button
                      className="enc-btn enc-btn-ghost"
                      style={{ color: "var(--coral)" }}
                      onClick={() => { setDeletingCourse(c); setDeleteError(null); }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                ) : (
                  // #155 — not this trainer's course (no ownerId/providerId
                  // match): no Edit/Delete, and deliberately no click-through
                  // to the editor either, since that's what was exposing full
                  // course details for courses CRUD would reject anyway.
                  <span style={{ fontSize: 12, color: "var(--slate-light)" }}>View only</span>
                )}
              </div>
            ))}
            {filteredCourses.length === 0 && (
              <div style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
                {courses.length === 0
                  ? "No courses yet — add your first one."
                  : query
                    ? `No courses match "${courseSearch.trim()}".`
                    : "No courses match this filter."}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "paths" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <button className="enc-btn enc-btn-gold" onClick={() => setEditingPathId("__new")}><Plus size={15} /> New path</button>
          </div>

          <div className="enc-card" style={{ padding: 0, overflow: "hidden" }}>
            {paths.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: i < paths.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title || "(untitled path)"}</div>
                  <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>{p.courses.length} courses</div>
                </div>
                {canEditPath(p) ? (
                  <>
                    <button className="enc-btn enc-btn-ghost" onClick={() => setEditingPathId(p.id)}><Pencil size={14} /> Edit</button>
                    <button
                      className="enc-btn enc-btn-ghost"
                      style={{ color: "var(--coral)" }}
                      onClick={() => { setDeletingPath(p); setDeletePathError(null); }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--slate-light)" }}>View only</span>
                )}
              </div>
            ))}
            {paths.length === 0 && (
              <div style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
                No learning paths yet — bundle 2 or more of your courses into one.
              </div>
            )}
          </div>
        </>
      )}

      {tab === "team" && (
        <TeamTab
          onFetchProvider={onFetchProvider}
          onCreateProvider={onCreateProvider}
          onJoinProvider={onJoinProvider}
          onRegenerateInviteCode={onRegenerateInviteCode}
          onLeaveProvider={onLeaveProvider}
          currentUserId={currentUserId}
        />
      )}
      </div>

      {/* #301 — portaled to document.body: this screen's root div carries
          enc-page-enter for the page-load animation, which leaves a
          `transform` applied via animation-fill-mode: both even after the
          animation finishes. Any ancestor with a transform becomes a new
          containing block for a `position: fixed` descendant, so without
          the portal this backdrop was sized to that (narrower, shorter)
          root div instead of the real viewport — it only ever dimmed part
          of the screen instead of covering it. Same fix applied to
          deletingPath's modal below and DashboardScreen's Unenroll/Retake
          modal, all of which had the exact same problem for the exact
          same reason. */}
      {deletingCourse && createPortal(
        <div
          onClick={() => !deleting && setDeletingCourse(null)}
          className="enc-modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={deleteCourseDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card enc-modal-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-delete-course-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-delete-course-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>Delete course?</div>
              {/* #258 — real button (was a bare clickable icon). */}
              <button
                type="button"
                aria-label="Close"
                disabled={deleting}
                onClick={() => setDeletingCourse(null)}
                style={{ background: "none", border: "none", padding: 0, cursor: deleting ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20 }}>
              This removes <strong>{deletingCourse.title || "(untitled course)"}</strong> from the catalogue. Learners already enrolled keep their progress and access — this can't be undone from the catalogue side, so double-check before continuing.
            </div>
            {deleteError && (
              <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>{deleteError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" disabled={deleting} onClick={() => setDeletingCourse(null)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff", opacity: deleting ? 0.7 : 1 }}
                disabled={deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? "Deleting…" : "Delete course"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {deletingPath && createPortal(
        <div
          onClick={() => !deletingPathBusy && setDeletingPath(null)}
          className="enc-modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={deletePathDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card enc-modal-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-delete-path-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-delete-path-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>Delete learning path?</div>
              {/* #258 — real button (was a bare clickable icon). */}
              <button
                type="button"
                aria-label="Close"
                disabled={deletingPathBusy}
                onClick={() => setDeletingPath(null)}
                style={{ background: "none", border: "none", padding: 0, cursor: deletingPathBusy ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20 }}>
              This removes <strong>{deletingPath.title || "(untitled path)"}</strong> from the catalogue. Learners already enrolled keep their course progress and access — this can't be undone from the catalogue side, so double-check before continuing.
            </div>
            {deletePathError && (
              <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>{deletePathError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" disabled={deletingPathBusy} onClick={() => setDeletingPath(null)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff", opacity: deletingPathBusy ? 0.7 : 1 }}
                disabled={deletingPathBusy}
                onClick={handleConfirmDeletePath}
              >
                {deletingPathBusy ? "Deleting…" : "Delete path"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}