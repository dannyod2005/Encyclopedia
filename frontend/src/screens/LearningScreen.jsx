import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PlayCircle, CheckCircle2, XCircle, ChevronLeft, Star, AlertTriangle, X } from "lucide-react";

import { useFocusTrap } from "../hooks/useFocusTrap";

// #240/#254 — a module's quiz score has to clear this to count as
// "passed." Purely a comparison bar for display/nudging, never a gate on
// progress — see quizBlocksCompletion below, which stays keyed on
// `taken`, not on this threshold. Matches Coursera's common pass grade
// and Udemy's own accredited-content requirement.
//
// This is intentionally the SAME NAME AND VALUE as backend's
// PASS_THRESHOLD_PCT in enrollments.service.ts (used there to decide the
// "Passed" vs "Completed" certificate tier). There's no shared module
// between this CRA frontend and the NestJS backend (CRA blocks importing
// from outside frontend/src, and there's no workspace tooling set up),
// so the two constants are kept in sync by convention: same name, same
// value, cross-referencing comments, and a test on each side asserting
// the value is 70 (see LearningScreen.threshold.test.js). If you change
// one, change the other.
export const PASS_THRESHOLD_PCT = 70;

// Notes previously only saved on blur (tab-switch or clicking away), which
// left the "Not saved yet" label showing the whole time someone was still
// typing — reads like the save is broken if you don't know to click away
// first. This debounce mirrors TrainerCourseEditor's video-duration lookup
// (VIDEO_DURATION_DEBOUNCE_MS): short enough that a natural typing pause
// triggers a save, long enough not to fire a request on every keystroke.
const NOTE_AUTOSAVE_DEBOUNCE_MS = 1200;

export function LearningScreen({ course, enrollment, onSaveProgress, onSubmitRating, onLogModuleView, onFetchQuiz, onSubmitQuiz, onFetchQuizResults, onFetchNote, onSaveNote, onFetchPosts, onCreatePost, onEditPost, currentUserId, onBack, onUnenrol, initialModuleId = null, initialTab = null }) {
  // #229 — a notification click-through wants a specific tab (always
  // "forum" today) rather than the usual video-first default.
  const [tab, setTab] = useState(initialTab || "video");

  // #365 — Unenroll used to live on the Dashboard's course cards (first
  // as an icon next to Start/Resume, then behind an Edit-mode toggle);
  // both fought the gold Start/Resume button for attention. Moved here
  // instead — opening a course is the natural place to leave it, same as
  // Udemy/Coursera keep "unenroll"/"leave course" inside the course
  // itself rather than on the list card. Same confirm-modal shape
  // DashboardScreen's Retake dialog uses (pending flag + error + busy
  // state), just simpler since there's no isComplete branch here.
  const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
  const [unenrollError, setUnenrollError] = useState(null);
  const [unenrolling, setUnenrolling] = useState(false);
  const unenrollDialogRef = useFocusTrap(confirmingUnenroll);

  const modules = course?.modules ?? [];

  // #180 — activeModule doubles as "which module's content is currently
  // shown" (video/notes/quiz/forum tabs, sidebar highlight) and, before
  // this fix, was also what the progress bar and checkmarks read from.
  // The sidebar list's onClick is a preview/jump — it was never meant to
  // represent real progress — but since it just called setActiveModule
  // like everything else, previewing module 4 made modules 1-3 look
  // complete even though nothing had been saved, and reloading (which
  // re-derives activeModule from the real enrollment.progress) reverted
  // it, looking like lost progress. completedCount is the actual
  // persisted progress: seeded from the real enrollment.progress value
  // below, but only ever advanced by handleMarkComplete below — never by
  // sidebar preview clicks, and — #229 — never by a notification
  // click-through jump either (see initialActiveModule's comment).
  const progressDerivedModule = enrollment
    ? Math.min(Math.round(enrollment.progress * modules.length), modules.length)
    : 0;

  // #229 — a notification click-through targets a specific module (the
  // one its reply belongs to) rather than the usual "next incomplete
  // module" default. Falls through to the real-progress derivation above
  // whenever initialModuleId isn't set, or doesn't match any module in
  // this course (e.g. a stale/bad id) — same "never trust, always fall
  // back to a safe default" posture as everywhere else client input is
  // used to index into real data. Deliberately only affects which module
  // is *shown* (activeModule) — completedCount below always seeds from
  // progressDerivedModule regardless, so jumping to a notification's
  // module can never make earlier, genuinely-incomplete modules look
  // complete (the exact bug #180 already fixed once for sidebar preview
  // clicks).
  const initialModuleIndex = initialModuleId
    ? modules.findIndex((m) => m.id === initialModuleId)
    : -1;
  const initialActiveModule = initialModuleIndex >= 0 ? initialModuleIndex : progressDerivedModule;

  const [activeModule, setActiveModule] = useState(initialActiveModule);
  const [completedCount, setCompletedCount] = useState(progressDerivedModule);
  const [saving, setSaving] = useState(false);
  // #282 — surfaces a save failure instead of the old silent
  // console.error; see handleMarkComplete below.
  const [markCompleteError, setMarkCompleteError] = useState(null);

  // #106 — star-rating prompt on the "Course complete" card. hoverRating
  // is just for the visual preview as the pointer moves over the stars;
  // the actual submitted value lives on enrollment.rating (set server-side
  // and picked up here once the parent's enrolled list updates — same
  // "don't locally echo, just await the prop function" pattern as
  // handleMarkComplete/onSaveProgress above).
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingHover, setRatingHover] = useState(0);
  // #228 — optional comment that goes along with whichever star gets
  // clicked; see handleSubmitRating. Not its own separate submit step,
  // to keep the original "click a star, done" flow unchanged for anyone
  // who doesn't want to leave a comment.
  const [reviewDraft, setReviewDraft] = useState("");

  // Quiz state — reset whenever the active module changes, since each
  // module has its own separate quiz.
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionId }
  const [quizResult, setQuizResult] = useState(null); // set after submitting
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  // #239 — an already-taken quiz shows a read-only "you scored X/Y" summary
  // by default rather than silently re-presenting a blank, answerable form;
  // retaking is a deliberate action (clicking "Retake quiz"), not something
  // that happens by just reopening the tab. See the render block below.
  const [retaking, setRetaking] = useState(false);

  // Grades overview (#82) — every module's quiz result for this course,
  // not just the currently active one. Course-scoped (not per-module), so
  // it's fetched once per course visit rather than in the per-module quiz
  // effect below, and refetched after a fresh submission so it stays in
  // sync without a page reload.
  const [quizResultsOverview, setQuizResultsOverview] = useState([]);
  // #205 — starts true (not false): the effect below kicks off a fetch on
  // mount, and initializing this as "not loading" would let the
  // quiz-completion gate below read an empty quizResultsOverview as "no
  // quiz on any module" for the one render before that effect's
  // setQuizResultsLoading(true) actually lands, flashing the Mark
  // Complete button unlocked for an instant on every course load.
  const [quizResultsLoading, setQuizResultsLoading] = useState(true);

  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedAt, setNoteSavedAt] = useState(null);
  // Pending debounced-autosave timer — a single ref is enough since only
  // one module's note editor is ever mounted/focused at a time (unlike
  // TrainerCourseEditor's per-module durationTimersRef, which tracks many
  // video-duration lookups in flight at once across a whole course).
  const noteSaveTimerRef = useRef(null);

  // Forum state
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [newPostContent, setNewPostContent] = useState("");
  const [postingError, setPostingError] = useState(null);
  // #220 — which post/reply target is currently submitting: null (nothing
  // in flight), "new" (the top-level composer), or a post id (that post's
  // reply form). Was a single shared `posting` boolean, which disabled and
  // relabeled every reply button *and* the top-level Post button at once
  // for any single submission — scoped per-target instead so only the form
  // actually submitting shows a loading state.
  const [postingTarget, setPostingTarget] = useState(null);
  // Threading (#39): only one reply box open at a time, keyed by which
  // post it's replying to. null = the top-level composer is in use instead.
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  // Editing: only one post editable at a time, same pattern as replying.
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editingError, setEditingError] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const currentModule = modules[activeModule];

  // Pre-existing race, surfaced while testing the notes autosave above:
  // clicking a different module blurs the textarea first, firing a save
  // for the module being LEFT — but that save is async, and by the time
  // it resolves, currentModule (read from a closure captured back when
  // saveNote was called) still points at the old module even though the
  // screen has already moved on. Without this ref, that late response's
  // setNoteSavedAt/setNoteSaving calls land on whatever module is on
  // screen *now*, showing a stale "Saved" time on a note that hasn't
  // actually been saved yet. Kept as a ref (not state) purely so saveNote
  // can read the true current value at resolution time — a value captured
  // in a closure at call time is exactly the stale thing we're guarding
  // against.
  const currentModuleIdRef = useRef(currentModule?.id);
  currentModuleIdRef.current = currentModule?.id;

  // #124 — one ping per module focus, so the backend has a per-day "this
  // module was open" marker to later split its completion points across
  // (see ActivityService.logModuleView/logModuleCompletion). Fire-and-forget:
  // no loading/error state here, this is a background signal, not something
  // the learner is waiting on. Same currentModule.id-only dependency
  // reasoning as the effects below.
  useEffect(() => {
    if (!currentModule || !onLogModuleView) return;
    onLogModuleView(currentModule.id).catch((err) =>
      console.error("Failed to log module view:", err.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id]);

  useEffect(() => {
    if (!currentModule || !onFetchQuiz) return;

    setQuizQuestions([]);
    setSelectedAnswers({});
    setQuizResult(null);
    setQuizError(null);
    setRetaking(false);
    setQuizLoading(true);

    onFetchQuiz(currentModule.id)
      .then((data) => setQuizQuestions(data))
      .catch((err) => setQuizError(err.message))
      .finally(() => setQuizLoading(false));
    // Intentionally scoped to currentModule.id only: onFetchQuiz is
    // recreated on every App.jsx render (not memoized), so including it
    // here would refetch on every keystroke/state change anywhere in the
    // app, not just on actual module navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id]);

  // Course-scoped (not per-module) — fetched once per course visit rather
  // than in the effect above, since it covers every module at once.
  useEffect(() => {
    if (!course || !onFetchQuizResults) return;

    setQuizResultsLoading(true);
    onFetchQuizResults(course.id)
      .then((data) => setQuizResultsOverview(data))
      .catch((err) => console.error("Failed to load quiz results:", err.message))
      .finally(() => setQuizResultsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  useEffect(() => {
    if (!currentModule || !onFetchNote) return;

    // Cancel any pending autosave from the module being left. Clicking a
    // different module/sidebar link blurs the textarea first, which
    // already saves via handleNoteBlur below — so a debounce timer still
    // waiting at this point is redundant, and leaving it running risks
    // its setNoteSaving/setNoteSavedAt calls landing after we've already
    // reset that state for the newly-loading module.
    clearTimeout(noteSaveTimerRef.current);

    setNoteContent("");
    setNoteSavedAt(null);
    // handleNoteBlur's save for the module being left can still be
    // in-flight at this point (blur fires before this effect's module-id
    // change is processed) — reset unconditionally here so the new
    // module never inherits a stray "Saving…" from it; saveNote's
    // currentModuleIdRef guard then keeps that old save from flipping
    // this back on once it resolves.
    setNoteSaving(false);
    setNoteLoading(true);

    onFetchNote(currentModule.id)
      .then((data) => {
        setNoteContent(data.content ?? "");
        setNoteSavedAt(data.updatedAt);
      })
      .catch((err) => console.error("Failed to load note:", err.message))
      .finally(() => setNoteLoading(false));
    // See quiz effect above for why onFetchNote/currentModule are
    // intentionally omitted from the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id]);

  // Cancel any in-flight autosave timer if the whole screen unmounts
  // (navigating back to My learning etc.) so it doesn't fire — and risk a
  // "state update on an unmounted component" warning — after the fact.
  useEffect(() => {
    return () => clearTimeout(noteSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!currentModule || !onFetchPosts) return;

    setPosts([]);
    setNewPostContent("");
    setPostingError(null);
    setPostsLoading(true);
    setReplyingTo(null);
    setReplyContent("");
    setEditingId(null);
    setEditContent("");
    setEditingError(null);

    onFetchPosts(currentModule.id)
      .then((data) => setPosts(data))
      .catch((err) => console.error("Failed to load forum posts:", err.message))
      .finally(() => setPostsLoading(false));
    // See quiz effect above for why onFetchPosts/currentModule are
    // intentionally omitted from the dependency array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule?.id]);

  if (!course) return null;

  const hasModules = modules.length > 0;
  const isComplete = activeModule >= modules.length;
  const isLastModule = activeModule >= modules.length - 1;

  // #205 — quizResultsOverview (fetched once per course, keyed by
  // moduleId) is the authoritative "does this module have a quiz, and
  // has it already been taken" signal, rather than the per-module
  // quizQuestions/quizResult state above: quizResult resets to null on
  // every module switch (see the quiz effect), so a module whose quiz
  // was actually completed in an earlier session would otherwise look
  // falsely "not taken" the moment you navigate back to it. quizResult
  // still matters on top of that for the *current* session's
  // just-submitted case, since quizResultsOverview's own refetch after a
  // submit (see handleSubmitQuiz below) is async and may not have
  // resolved yet by the time this renders.
  const currentQuizStatus = quizResultsOverview.find((r) => r.moduleId === currentModule?.id);
  const quizAlreadySatisfied = !!quizResult || !!currentQuizStatus?.taken;
  const quizBlocksCompletion = quizResultsLoading
    ? true // don't know yet whether this module has a quiz — block rather than flash unlocked
    : !!currentQuizStatus?.hasQuiz && !quizAlreadySatisfied;

  // #240 — continuous course grade: summed correct answers over summed
  // question counts, across every taken-and-quizzed module. This is
  // mathematically identical to CourseAnalyticsService's per-learner
  // quizAverageScorePct (which pools every raw QuizSubmission's
  // isCorrect across the course) rather than a divergent calculation —
  // a "taken" module always has a graded answer for every one of its
  // questions (submitQuiz requires a complete set, no partial
  // submissions), so summing score/total per module and summing every
  // submission directly land on the same number. Null (not a 0%) when
  // no quizzed module has been taken yet, so the UI can show "—" instead
  // of a misleadingly bad grade before any quiz exists to grade.
  const gradedModules = quizResultsOverview.filter((r) => r.hasQuiz && r.taken);
  const courseGradePct = gradedModules.length > 0
    ? Math.round(
        (gradedModules.reduce((sum, r) => sum + r.score, 0) /
          gradedModules.reduce((sum, r) => sum + r.total, 0)) * 100,
      )
    : null;

  // #282 — previously advanced activeModule/completedCount (and, via
  // #229's course-completion notification trigger, the badge/notification
  // side effects that ride on the server's status transition) *before*
  // onSaveProgress had actually succeeded, and a failure only ever hit
  // console.error. That meant a learner could see "complete" on screen —
  // and reload later to find it silently reverted, no error shown, no
  // notification ever created, because the save never happened. Now the
  // save has to succeed before any of that state moves, and a failure
  // (including the pre-existing !enrollment/!onSaveProgress guard, which
  // used to advance the UI without saving at all) shows a real message
  // instead of failing invisibly.
  async function handleMarkComplete() {
    if (quizBlocksCompletion) return; // defense in depth — the button is already disabled for this

    const nextActiveModule = isLastModule ? modules.length : activeModule + 1;

    if (!enrollment || !onSaveProgress) {
      setMarkCompleteError("Couldn't save your progress right now — please try again in a moment.");
      return;
    }

    setMarkCompleteError(null);
    setSaving(true);
    try {
      await onSaveProgress(enrollment.id, nextActiveModule);
      setActiveModule(nextActiveModule);
      setCompletedCount(nextActiveModule);
    } catch (err) {
      console.error("Failed to save progress:", err.message);
      setMarkCompleteError("Couldn't save your progress. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitRating(stars) {
    if (!enrollment || !onSubmitRating || ratingSubmitting) return;

    setRatingSubmitting(true);
    try {
      // #228 — whatever's currently in the optional comment box goes along
      // with the star click, so a pure star submission (box left empty)
      // behaves exactly like before #228: reviewDraft defaults to "", and
      // an empty string is normalized to null server-side (see
      // EnrollmentsService.submitRating).
      await onSubmitRating(enrollment.id, stars, reviewDraft.trim());
    } catch (err) {
      console.error("Failed to submit rating:", err.message);
    } finally {
      setRatingSubmitting(false);
    }
  }

  // #365 — once unenrolled, this course entry no longer exists for the
  // learner (same DELETE-then-refetch shape as DashboardScreen's old
  // unenrolCourse call), so there's nothing left here to show — navigate
  // straight back to My learning on success rather than leaving them on
  // a now-stale course page.
  async function handleConfirmUnenroll() {
    if (!enrollment || !onUnenrol) return;

    setUnenrolling(true);
    setUnenrollError(null);
    try {
      await onUnenrol(enrollment.id);
      onBack();
    } catch (err) {
      setUnenrollError(err.message || "Failed to unenrol.");
      setUnenrolling(false);
    }
  }

  function selectAnswer(questionId, optionId) {
    if (quizResult) return; // locked once submitted
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  // #239 — clears any leftover selections before showing the blank,
  // answerable form again, same starting state as a genuine first
  // attempt (defensive — selectedAnswers should already be empty at this
  // point, but a retake shouldn't ever be able to inherit stale picks).
  function startRetake() {
    setSelectedAnswers({});
    setQuizError(null);
    setRetaking(true);
  }

  async function handleSubmitQuiz() {
    if (!currentModule || !onSubmitQuiz) return;

    // #40 — selectedAnswers holds an optionId for mcq questions or the
    // raw typed text for short_answer ones; which field to send depends
    // on the question's type.
    const answers = quizQuestions.map((q) =>
      q.type === "short_answer"
        ? { questionId: q.id, answerText: selectedAnswers[q.id] }
        : { questionId: q.id, optionId: selectedAnswers[q.id] }
    );

    const incomplete = quizQuestions.some((q) =>
      q.type === "short_answer"
        ? !selectedAnswers[q.id]?.trim()
        : !selectedAnswers[q.id]
    );
    if (incomplete) {
      setQuizError("Answer every question before submitting.");
      return;
    }

    setQuizError(null);
    setSubmittingQuiz(true);
    try {
      const result = await onSubmitQuiz(currentModule.id, answers);
      setQuizResult(result);
      // Keep the Grades panel in sync without requiring a page reload (#82).
      if (course && onFetchQuizResults) {
        onFetchQuizResults(course.id)
          .then((data) => setQuizResultsOverview(data))
          .catch((err) => console.error("Failed to refresh quiz results:", err.message));
      }
    } catch (err) {
      setQuizError(err.message || "Failed to submit quiz.");
    } finally {
      setSubmittingQuiz(false);
    }
  }

  async function saveNote(moduleId, content) {
    if (!moduleId || !onSaveNote) return;

    // Only flip the "Saving…" indicator on if we're still looking at the
    // module this save is for — see currentModuleIdRef's comment above.
    if (moduleId === currentModuleIdRef.current) setNoteSaving(true);
    try {
      const saved = await onSaveNote(moduleId, content);
      if (moduleId === currentModuleIdRef.current) setNoteSavedAt(saved.updatedAt);
    } catch (err) {
      console.error("Failed to save note:", err.message);
    } finally {
      if (moduleId === currentModuleIdRef.current) setNoteSaving(false);
    }
  }

  function handleNoteChange(e) {
    const value = e.target.value;
    setNoteContent(value);
    if (!currentModule) return;

    // Debounced autosave: reset the timer on every keystroke so it only
    // actually fires NOTE_AUTOSAVE_DEBOUNCE_MS after typing pauses, not on
    // every keystroke. moduleId/value are captured here (this render) and
    // passed straight through rather than read back off state when the
    // timer fires, so a fast module switch right after typing can't cause
    // this to save the wrong module's content.
    clearTimeout(noteSaveTimerRef.current);
    const moduleId = currentModule.id;
    noteSaveTimerRef.current = setTimeout(() => {
      saveNote(moduleId, value);
    }, NOTE_AUTOSAVE_DEBOUNCE_MS);
  }

  async function handleNoteBlur() {
    // Leaving the field is a stronger signal than a typing pause — save
    // immediately rather than waiting out whatever's left of the debounce.
    clearTimeout(noteSaveTimerRef.current);
    if (!currentModule) return;
    await saveNote(currentModule.id, noteContent);
  }

  async function handleCreatePost(parentPostId = null) {
    const content = parentPostId ? replyContent : newPostContent;
    if (!currentModule || !onCreatePost || !content.trim()) return;

    setPostingError(null);
    setPostingTarget(parentPostId ?? "new");
    try {
      const post = await onCreatePost(currentModule.id, content.trim(), parentPostId);
      setPosts((prev) => [...prev, post]);
      if (parentPostId) {
        setReplyContent("");
        setReplyingTo(null);
      } else {
        setNewPostContent("");
      }
    } catch (err) {
      setPostingError(err.message || "Failed to post.");
    } finally {
      setPostingTarget(null);
    }
  }

  async function handleSaveEdit(postId) {
    if (!currentModule || !onEditPost || !editContent.trim()) return;

    setEditingError(null);
    setSavingEdit(true);
    try {
      const updated = await onEditPost(currentModule.id, postId, editContent.trim());
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
      setEditingId(null);
      setEditContent("");
    } catch (err) {
      setEditingError(err.message || "Failed to save edit.");
    } finally {
      setSavingEdit(false);
    }
  }

  // Groups the flat post list (#39 — flat from the API, nested in the UI)
  // into a reply tree. A post whose parentPostId doesn't match anything
  // in this list (shouldn't normally happen) falls back to top-level
  // rather than silently disappearing.
  function buildThreads(flatPosts) {
    const byId = new Map(flatPosts.map((p) => [p.id, { ...p, replies: [] }]));
    const roots = [];
    for (const post of byId.values()) {
      const parent = post.parentPostId ? byId.get(post.parentPostId) : null;
      if (parent) {
        parent.replies.push(post);
      } else {
        roots.push(post);
      }
    }
    return roots;
  }

  // Recursive so a reply-to-a-reply still nests correctly, but indentation
  // is capped so a long chain doesn't march off the edge of a narrow tab.
  function renderPost(p, depth) {
    const indent = Math.min(depth, 3) * 28;
    const isReplying = replyingTo === p.id;
    const isEditing = editingId === p.id;
    const isOwnPost = !!currentUserId && p.author.id === currentUserId;
    const actionLinkStyle = { fontSize: 11.5, fontWeight: 600, color: "var(--gold-dark)", cursor: "pointer" };

    return (
      <div key={p.id} style={{ marginLeft: indent }}>
        <div style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: depth === 0 ? "1px solid var(--line)" : "none" }}>
          <div style={{ width: 28, height: 28, borderRadius: 99, background: "var(--gold-tint)", color: "var(--gold-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {(p.author.name || "?")[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {p.author.name || "Anonymous"}
              {p.edited && (
                <span style={{ fontSize: 11, fontWeight: 400, color: "var(--slate-light)", marginLeft: 6 }}>(edited)</span>
              )}
            </div>

            {isEditing ? (
              <div style={{ marginTop: 4 }}>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={{ width: "100%", minHeight: 48, border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical", marginBottom: 8 }}
                />
                {editingError && <div style={{ fontSize: 12, color: "var(--coral)", marginBottom: 8 }}>{editingError}</div>}
                <button
                  className="enc-btn enc-btn-gold"
                  disabled={savingEdit || !editContent.trim()}
                  style={{ opacity: savingEdit || !editContent.trim() ? 0.6 : 1, padding: "6px 14px", fontSize: 13, marginRight: 10 }}
                  onClick={() => handleSaveEdit(p.id)}
                >
                  {savingEdit ? "Saving…" : "Save"}
                </button>
                <span
                  onClick={() => { setEditingId(null); setEditContent(""); setEditingError(null); }}
                  style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate)", cursor: "pointer" }}
                >
                  Cancel
                </span>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--slate)" }}>{p.content}</div>
            )}

            {!isEditing && (
              <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
                <span
                  onClick={() => {
                    setReplyingTo(isReplying ? null : p.id);
                    setReplyContent("");
                    setPostingError(null);
                  }}
                  style={actionLinkStyle}
                >
                  {isReplying ? "Cancel" : "Reply"}
                </span>
                {isOwnPost && (
                  <span
                    onClick={() => {
                      setEditingId(p.id);
                      setEditContent(p.content);
                      setEditingError(null);
                      setReplyingTo(null);
                    }}
                    style={actionLinkStyle}
                  >
                    Edit
                  </span>
                )}
              </div>
            )}

            {isReplying && (
              <div style={{ marginTop: 8 }}>
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`Reply to ${p.author.name || "this post"}…`}
                  style={{ width: "100%", minHeight: 48, border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical", marginBottom: 8 }}
                />
                {postingError && <div style={{ fontSize: 12, color: "var(--coral)", marginBottom: 8 }}>{postingError}</div>}
                <button
                  className="enc-btn enc-btn-gold"
                  disabled={postingTarget === p.id || !replyContent.trim()}
                  style={{ opacity: postingTarget === p.id || !replyContent.trim() ? 0.6 : 1, padding: "6px 14px", fontSize: 13 }}
                  onClick={() => handleCreatePost(p.id)}
                >
                  {postingTarget === p.id ? "Posting…" : "Reply"}
                </button>
              </div>
            )}
          </div>
        </div>
        {p.replies.map((child) => renderPost(child, depth + 1))}
      </div>
    );
  }

  // #212 — same fix as Dashboard (#204): maxWidth alone doesn't center a
  // block-level element, it just caps its width, so on a wide viewport
  // this hugged the left edge instead of centering like Catalogue/
  // Discover (which both pair maxWidth with margin: "0 auto").
  //
  // #334 — replaced the fixed 1080 cap with the shared .enc-page-wide
  // class (introduced in #332 for My Learning) so this page carries the
  // same large-breakpoint width policy instead of its own one-off value.
  return (
    <div className="enc-page-enter enc-page-wide" style={{ padding: "22px 32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        {/* #360 — was <div onClick>: not a real link/button, unreachable by
            keyboard. */}
        <button
          type="button"
          onClick={onBack}
          style={{ font: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <ChevronLeft size={15} /> Back to My learning
        </button>

        {/* #365 — moved here from the Dashboard course card (see that
            screen's #365 comments for why): plain text, not an icon,
            since it's reached rarely enough that it doesn't need to be
            compact, and text is self-explanatory without an aria-label. */}
        {enrollment && onUnenrol && (
          <button
            type="button"
            onClick={() => setConfirmingUnenroll(true)}
            style={{ font: "inherit", fontSize: 13, fontWeight: 600, color: "var(--coral)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            Unenroll
          </button>
        )}
      </div>

      {!hasModules ? (
        <div className="enc-card" style={{ padding: 24, fontSize: 13.5, color: "var(--slate-light)", textAlign: "center" }}>
          This course doesn't have any modules yet. Check back once the trainer has added content.
        </div>
      ) : isComplete ? (
        <div className="enc-card" style={{ padding: 24, textAlign: "center" }}>
          <CheckCircle2 size={32} color="var(--success)" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Course complete</div>
          <div style={{ fontSize: 13.5, color: "var(--slate-light)" }}>You've finished all {modules.length} modules.</div>

          {/* #106 — prompt for a rating once complete; enrollment.rating
              being set (either already, from a past visit, or just now)
              switches this to a thank-you state instead of re-prompting. */}
          {enrollment && onSubmitRating && (
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
              {enrollment.rating ? (
                <div style={{ fontSize: 13.5, color: "var(--slate)" }}>
                  Thanks for rating this course {enrollment.rating} star{enrollment.rating === 1 ? "" : "s"}.
                  {/* #228 — only shown if a comment was actually left; a
                      pure star rating (the only option before #228) has
                      no reviewText and this stays hidden. */}
                  {enrollment.reviewText && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--paper)", borderRadius: 8, fontSize: 13, color: "var(--ink-70)", textAlign: "left" }}>
                      “{enrollment.reviewText}”
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>How was this course?</div>
                  {/* #258 — real buttons (were bare clickable icons):
                      onMouseEnter still drives the hover preview for mouse
                      users, but a keyboard user can now Tab to a specific
                      star and press Enter/Space to rate directly, with no
                      hover step required. */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 4 }} onMouseLeave={() => setRatingHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                        disabled={ratingSubmitting}
                        onMouseEnter={() => setRatingHover(n)}
                        onClick={() => handleSubmitRating(n)}
                        style={{ background: "none", border: "none", padding: 0, cursor: ratingSubmitting ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
                      >
                        {/* #385 — reverted to var(--gold) (was briefly
                            var(--star)): see the Primitives.jsx Stars
                            component comment for why the split was undone. */}
                        <Star size={26} fill={n <= ratingHover ? "var(--gold)" : "none"} color="var(--gold)" />
                      </button>
                    ))}
                  </div>
                  {/* #228 — optional, submitted together with whichever star
                      gets clicked above (see handleSubmitRating); leaving
                      this empty is the same pure-star flow as before #228. */}
                  <textarea
                    value={reviewDraft}
                    onChange={(e) => setReviewDraft(e.target.value)}
                    disabled={ratingSubmitting}
                    placeholder="Leave a comment (optional)"
                    style={{ width: "100%", minHeight: 60, marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical" }}
                  />
                  {ratingSubmitting && (
                    <div style={{ fontSize: 12, color: "var(--slate-light)", marginTop: 8 }}>Saving…</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : (
      // #104 — single column on mobile (video/tabs above the right rail),
      // 1fr/300px from md up; column layout is the only breakpoint-dependent
      // property here.
      //
      // #335 — widen the right rail further at the same >=1440px point
      // where #334 widens the page itself, so the freed-up space actually
      // goes to the progress/grades cards instead of just the left column.
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] min-[1440px]:grid-cols-[1fr_360px]" style={{ gap: 22 }}>
        <div>
          <div className="enc-card" style={{ padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Module {activeModule + 1} of {modules.length}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{currentModule.title}</div>
          </div>

          {currentModule.videoUrl ? (
            <div style={{ background: "var(--ink)", borderRadius: 14, aspectRatio: "16/9", overflow: "hidden", marginBottom: 4 }}>
              <iframe
                key={currentModule.videoUrl}
                src={currentModule.videoUrl}
                title={currentModule.title}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div style={{ background: "var(--ink)", borderRadius: 14, aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
              <PlayCircle size={52} color="var(--gold)" />
            </div>
          )}
          <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginBottom: 18 }}>
            {currentModule.videoUrl ? currentModule.title : `12:40 · ${currentModule.title}`}
          </div>

          {/* #360 — was <div onClick>: not focusable, no role/selected
              state. Real button, role="tab" + aria-selected inside a
              role="tablist", same fix as Trainer Studio's tab switcher. */}
          <div role="tablist" style={{ display: "flex", gap: 20, borderBottom: "1px solid var(--line)", marginBottom: 16 }}>
            {["video", "notes", "quiz", "forum"].map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`enc-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
                style={{ background: "none", border: "none", font: "inherit", textTransform: "capitalize" }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* #105 — key={tab} remounts this wrapper on every tab switch,
              which replays the enc-tab-panel fade defined in global.css. */}
          <div key={tab} className="enc-tab-panel">
          {tab === "video" && (
            <p style={{ fontSize: 14, color: "var(--slate)", lineHeight: 1.6 }}>
              This module covers {currentModule.title.toLowerCase()}. Follow along in the video, then apply it in the short exercise before moving to the quiz.
            </p>
          )}
          {tab === "notes" && (
            <div className="enc-card" style={{ padding: 16 }}>
              <textarea
                value={noteContent}
                onChange={handleNoteChange}
                onBlur={handleNoteBlur}
                disabled={noteLoading}
                placeholder="Jot down notes for this module — only visible to you."
                // #350 — outline:none removed so keyboard focus is
                // visible (global.css's input:focus-visible rule).
                style={{ width: "100%", minHeight: 120, border: "none", fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical", background: "transparent" }}
              />
              <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginTop: 8 }}>
                {noteLoading
                  ? "Loading…"
                  : noteSaving
                  ? "Saving…"
                  : noteSavedAt
                  ? `Saved ${new Date(noteSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Not saved yet"}
              </div>
            </div>
          )}
          {tab === "quiz" && (
            <div className="enc-card" style={{ padding: 18 }}>
              {quizLoading ? (
                <div style={{ fontSize: 13.5, color: "var(--slate-light)" }}>Loading quiz…</div>
              ) : quizQuestions.length === 0 ? (
                <div style={{ fontSize: 13.5, color: "var(--slate-light)" }}>
                  This module doesn't have a quiz yet.
                </div>
              ) : currentQuizStatus?.taken && !quizResult && !retaking ? (
                // #239 — already taken, and neither just-submitted-this-
                // session (quizResult) nor mid-retake: show a read-only
                // summary + an explicit opt-in to try again, instead of
                // silently re-presenting a blank form on every reopen.
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                    Quick check — {quizQuestions.length} question{quizQuestions.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 10 }}>
                    You've already taken this quiz — scored {currentQuizStatus.score}/{currentQuizStatus.total}.
                  </div>
                  {/* #240 — below the pass bar: a nudge, not a block. Mark
                      Complete/progress are never gated on this — see
                      quizBlocksCompletion above, unchanged by this
                      threshold. */}
                  {currentQuizStatus.total > 0 &&
                    Math.round((currentQuizStatus.score / currentQuizStatus.total) * 100) < PASS_THRESHOLD_PCT && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>
                      <AlertTriangle size={13} />
                      Below the {PASS_THRESHOLD_PCT}% pass bar — consider retaking to improve your course grade.
                    </div>
                  )}
                  <button className="enc-btn enc-btn-ghost" onClick={startRetake}>
                    Retake quiz
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
                    Quick check — {quizQuestions.length} question{quizQuestions.length === 1 ? "" : "s"}
                    {quizResult && ` — ${quizResult.score}/${quizResult.total}${quizResult.alreadySubmitted ? " (retake)" : ""}`}
                  </div>

                  {quizQuestions.map((q, i) => {
                    const resultForQuestion = quizResult?.results.find((r) => r.questionId === q.id);
                    return (
                      <div key={q.id} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 8 }}>{i + 1}. {q.question}</div>
                        {q.type === "short_answer" ? (
                          <div>
                            <input
                              type="text"
                              value={selectedAnswers[q.id] ?? ""}
                              onChange={(e) => selectAnswer(q.id, e.target.value)}
                              disabled={!!quizResult}
                              placeholder="Type your answer…"
                              // #350 — outline:none removed so keyboard
                              // focus is visible (global.css's
                              // input:focus-visible rule).
                              style={{
                                fontFamily: "var(--font-body)", fontSize: 13, width: "100%", maxWidth: 360,
                                border: `1px solid ${resultForQuestion ? (resultForQuestion.isCorrect ? "var(--success)" : "var(--coral)") : "var(--line)"}`,
                                background: resultForQuestion ? (resultForQuestion.isCorrect ? "var(--success-tint)" : "var(--coral-tint)") : "var(--paper-2)",
                                borderRadius: 8, padding: "8px 10px",
                              }}
                            />
                            {resultForQuestion && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--slate-light)", marginTop: 6 }}>
                                {resultForQuestion.isCorrect
                                  ? <CheckCircle2 size={13} color="var(--success)" />
                                  : <XCircle size={13} color="var(--coral)" />}
                                {resultForQuestion.isCorrect
                                  ? "Correct"
                                  : `Accepted answer${resultForQuestion.acceptableAnswers.length > 1 ? "s" : ""}: ${resultForQuestion.acceptableAnswers.join(", ")}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {q.options.map((o) => {
                              const isSelected = selectedAnswers[q.id] === o.id;
                              const isCorrectAnswer = resultForQuestion?.correctOptionId === o.id;
                              const isWrongSelected = resultForQuestion && isSelected && !resultForQuestion.isCorrect;

                              let borderColor = "var(--line)";
                              let bg = "transparent";
                              if (resultForQuestion) {
                                if (isCorrectAnswer) { borderColor = "var(--success)"; bg = "var(--success-tint)"; }
                                else if (isWrongSelected) { borderColor = "var(--coral)"; bg = "var(--coral-tint)"; }
                              } else if (isSelected) {
                                borderColor = "var(--gold-dark)";
                                bg = "var(--gold-tint)";
                              }

                              return (
                                <span
                                  key={o.id}
                                  onClick={() => selectAnswer(q.id, o.id)}
                                  style={{
                                    fontSize: 12.5, border: `1px solid ${borderColor}`, background: bg,
                                    borderRadius: 8, padding: "6px 12px", cursor: quizResult ? "default" : "pointer",
                                    display: "flex", alignItems: "center", gap: 5,
                                  }}
                                >
                                  {resultForQuestion && isCorrectAnswer && <CheckCircle2 size={13} color="var(--success)" />}
                                  {resultForQuestion && isWrongSelected && <XCircle size={13} color="var(--coral)" />}
                                  {o.optionText}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {quizError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 10 }}>{quizError}</div>}

                  {!quizResult && (
                    <button
                      className="enc-btn enc-btn-gold"
                      disabled={submittingQuiz}
                      style={{ opacity: submittingQuiz ? 0.7 : 1 }}
                      onClick={handleSubmitQuiz}
                    >
                      {submittingQuiz ? "Submitting…" : "Submit answers"}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {tab === "forum" && (
            <div className="enc-card" style={{ padding: 16 }}>
              {postsLoading ? (
                <div style={{ fontSize: 13.5, color: "var(--slate-light)" }}>Loading…</div>
              ) : (
                <>
                  {posts.length === 0 ? (
                    <div style={{ fontSize: 13.5, color: "var(--slate-light)", marginBottom: 16 }}>
                      No posts yet — be the first to start the discussion.
                    </div>
                  ) : (
                    buildThreads(posts).map((p) => renderPost(p, 0))
                  )}

                  <div style={{ marginTop: 16 }}>
                    <textarea
                      value={newPostContent}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      placeholder="Ask a question or share a thought…"
                      style={{ width: "100%", minHeight: 60, border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "var(--font-body)", fontSize: 13.5, resize: "vertical", marginBottom: 8 }}
                    />
                    {postingError && <div style={{ fontSize: 12, color: "var(--coral)", marginBottom: 8 }}>{postingError}</div>}
                    <button
                      className="enc-btn enc-btn-gold"
                      disabled={postingTarget === "new" || !newPostContent.trim()}
                      style={{ opacity: postingTarget === "new" || !newPostContent.trim() ? 0.6 : 1 }}
                      onClick={() => handleCreatePost()}
                    >
                      {postingTarget === "new" ? "Posting…" : "Post"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          </div>

          {markCompleteError && (
            <div style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 20 }}>
              {markCompleteError}
            </div>
          )}
          <button
            className="enc-btn enc-btn-gold"
            style={{ marginTop: markCompleteError ? 10 : 20, opacity: (saving || quizBlocksCompletion) ? 0.7 : 1 }}
            disabled={saving || quizBlocksCompletion}
            title={quizBlocksCompletion ? "Submit this module's quiz to continue" : undefined}
            onClick={handleMarkComplete}
          >
            <CheckCircle2 size={16} />
            {saving
              ? "Saving…"
              : quizBlocksCompletion
                ? "Complete the quiz to continue"
                : isLastModule ? "Mark complete & finish" : "Mark complete & continue"}
          </button>
        </div>

        <div>
          {/* #335 — larger card padding + a bigger, bolder progress
              percentage give this rail more visual weight now that #334
              frees up extra width for it. */}
          <div className="enc-card" style={{ padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Course progress</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--gold-dark)" }}>{Math.round((Math.min(completedCount, modules.length) / modules.length) * 100)}%</span>
            </div>
            <div style={{ height: 10, background: "var(--line)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(Math.min(completedCount, modules.length) / modules.length) * 100}%`, background: "var(--gold)", borderRadius: 5, transition: "width .2s ease" }} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--slate-light)", marginTop: 8, marginBottom: 14 }}>{Math.min(completedCount, modules.length)} of {modules.length} modules complete</div>
            <hr className="enc-hairline" style={{ margin: "0 0 10px" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {modules.map((m, i) => (
                <div key={m.id} onClick={() => setActiveModule(i)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 8, cursor: "pointer",
                  background: i === activeModule ? "var(--gold-tint)" : "transparent",
                }}>
                  {i < completedCount ? <CheckCircle2 size={15} color="var(--success)" /> : i === activeModule ? <PlayCircle size={15} color="var(--gold-dark)" /> : <span style={{ width: 15, height: 15, borderRadius: 99, border: "1.5px solid var(--line)", flexShrink: 0 }} />}
                  <span style={{ fontSize: 13, fontWeight: i === activeModule ? 600 : 400 }}>{m.title}</span>
                </div>
              ))}
            </div>
          </div>
          {/* #335 — same larger-card treatment as Course progress above,
              plus a hero-sized grade number and an explicit Pass/Below
              pass-bar badge so this is the standout stat in the rail,
              matching the client's callout that this section needed more
              presence. */}
          <div className="enc-card" style={{ padding: 20 }}>
            <div style={{ marginBottom: courseGradePct !== null ? 16 : 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Grades</span>
              {/* #240 — hidden until there's at least one graded module,
                  same "hidden until non-empty" convention as the rest of
                  this app's optional cards — a fresh course with no
                  quizzes taken yet shouldn't show a misleading 0%. */}
              {courseGradePct !== null && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 700, lineHeight: 1,
                      color: courseGradePct < PASS_THRESHOLD_PCT ? "var(--coral)" : "var(--gold-dark)",
                    }}
                    title="Course grade — average quiz score across every quizzed module you've taken"
                  >
                    {courseGradePct}%
                  </span>
                  <span
                    className="enc-badge"
                    style={{
                      background: courseGradePct < PASS_THRESHOLD_PCT ? "var(--coral-tint)" : "var(--success-tint)",
                      color: courseGradePct < PASS_THRESHOLD_PCT ? "var(--coral)" : "var(--success)",
                    }}
                  >
                    {courseGradePct < PASS_THRESHOLD_PCT ? "Below pass bar" : "Passing"}
                  </span>
                </div>
              )}
            </div>
            {quizResultsLoading ? (
              <div style={{ fontSize: 13, color: "var(--slate-light)", padding: "6px 0" }}>Loading…</div>
            ) : quizResultsOverview.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--slate-light)", padding: "6px 0" }}>No modules yet.</div>
            ) : (
              quizResultsOverview.map((r, i) => {
                // #240 — visibly flag (never block) a taken module below
                // the pass bar, same threshold the course grade above is
                // compared against.
                const belowPassBar = r.taken && r.total > 0 &&
                  Math.round((r.score / r.total) * 100) < PASS_THRESHOLD_PCT;
                return (
                  <div
                    key={r.moduleId}
                    onClick={() => { setActiveModule(i); setTab("quiz"); }}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 0", cursor: "pointer" }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 5, color: r.taken ? "var(--slate)" : "var(--slate-light)", overflow: "hidden" }}>
                      {belowPassBar && <AlertTriangle size={12} color="var(--coral)" style={{ flexShrink: 0 }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.moduleTitle}</span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: belowPassBar ? "var(--coral)" : r.taken ? "var(--ink)" : "var(--slate-light)", flexShrink: 0 }}>
                      {!r.hasQuiz ? "No quiz" : r.taken ? `${r.score}/${r.total}` : "Not yet taken"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      )}

      {/* #365 — same confirm-modal shape as DashboardScreen's Retake
          dialog (backdrop click/X/Cancel all close it, guarded by
          !unenrolling; portaled to document.body for the same reason
          that screen's modal is — this root div carries enc-page-enter's
          animation-fill-mode transform, which would otherwise become the
          fixed backdrop's containing block and size it to the page
          instead of the viewport). */}
      {confirmingUnenroll && createPortal(
        <div
          onClick={() => !unenrolling && setConfirmingUnenroll(false)}
          className="enc-modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={unenrollDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card enc-modal-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-unenroll-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-unenroll-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>
                Unenroll from this course?
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={unenrolling}
                onClick={() => setConfirmingUnenroll(false)}
                style={{ background: "none", border: "none", padding: 0, cursor: unenrolling ? "default" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20 }}>
              You'll be removed from <strong>{course.title}</strong> and your progress will reset if you enrol again.
            </div>
            {unenrollError && (
              <div style={{ fontSize: 12.5, color: "var(--coral)", marginBottom: 14 }}>{unenrollError}</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" disabled={unenrolling} onClick={() => setConfirmingUnenroll(false)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff", opacity: unenrolling ? 0.7 : 1 }}
                disabled={unenrolling}
                onClick={handleConfirmUnenroll}
              >
                {unenrolling ? "Unenrolling…" : "Unenroll"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}