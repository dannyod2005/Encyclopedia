import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, BookMarked, Plus, Trash2, Save, Video, ChevronDown, ChevronUp, HelpCircle, X } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";

const TRAINER_CATEGORIES = ["Technical", "Business", "Leadership"];
const TRAINER_LEVELS = ["Beginner", "Intermediate", "Advanced"];
const TRAINER_COLORS = ["ink", "gold", "success", "coral"];

// #274 — a brand-new module has no real id until the course itself is
// first saved, but the quiz editor needs *some* stable key to keep its
// per-module state (expanded/questions/etc.) indexed by across
// re-renders and add/remove of other modules. A client-only localKey
// fills that role until a real id exists; quizKey() below picks whichever
// one applies. Never sent to the backend — only id/title/videoUrl/
// quizQuestions are picked out of a module when building the save
// payload (see handleSave).
function newLocalKey() {
  return `local-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function quizKey(m) {
  return m.id ?? m.localKey;
}

// #275 — rough, deliberately simple per-question time allowance added on
// top of a module's real video length to produce a suggested module/course
// time. Not meant to be precise (see the issue: "a rough per-question time
// multiplier") — just a better starting default than a blank/guessed hours
// figure. Easy to retune later without touching the rest of the estimate
// logic.
const SECONDS_PER_QUESTION = 45;

// Debounce so a lookup isn't fired on every keystroke while a trainer is
// still typing/pasting a video URL.
const VIDEO_DURATION_DEBOUNCE_MS = 700;

// #297 — the Hours field and its auto-suggestion used to only work in
// whole-hour steps, so a genuinely ~1h40m course could only ever suggest
// (and store) 2h. 15 minutes, not 10: as a fraction of an hour it's a
// clean 0.25, matching the courses.hours column's `real` type and
// avoiding the repeating decimal 10-minute steps would produce
// (1/6 = 0.1666...). See AllowFractionalCourseHours migration for the
// backend side of this.
const HOURS_STEP = 0.25;

function formatMinutes(totalMinutes) {
  const rounded = Math.max(1, Math.round(totalMinutes));
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function emptyCourseDraft() {
  return {
    title: "", provider: "", category: TRAINER_CATEGORIES[0], level: TRAINER_LEVELS[0],
    hours: 4, color: TRAINER_COLORS[0],
    blurb: "",
    skills: [],
    modules: [{ title: "", videoUrl: "", localKey: newLocalKey() }],
    credits: [{ line: "" }],
    faqs: [{ question: "", answer: "" }],
  };
}

function emptyQuestion() {
  return {
    question: "",
    // #40 — 'mcq' (default) or 'short_answer'. Both `options` and
    // `acceptableAnswers` are always kept on the question object so
    // toggling the type in the UI doesn't lose or need to re-init state;
    // only the field matching `type` is actually sent to the backend
    // (see handleSaveQuiz).
    type: "mcq",
    options: [
      { optionText: "", isCorrect: true },
      { optionText: "", isCorrect: false },
    ],
    acceptableAnswers: [""],
  };
}

// #40 — the edit-quiz fetch/save endpoints return QuizQuestionEditResponseDto
// shape, where a short_answer question's acceptable answers are carried in
// `options` (isCorrect always true — see the backend QuizOption entity
// comment). Normalize that into the editor's `acceptableAnswers` array and
// backfill a blank MCQ options pair, so the shape is uniform regardless of
// which type the question currently is.
function normalizeLoadedQuestion(q) {
  const type = q.type ?? "mcq";
  if (type === "short_answer") {
    return {
      ...q,
      type,
      acceptableAnswers: q.options && q.options.length > 0 ? q.options.map((o) => o.optionText) : [""],
      options: [
        { optionText: "", isCorrect: true },
        { optionText: "", isCorrect: false },
      ],
    };
  }
  return { ...q, type, acceptableAnswers: [""] };
}

export function TrainerCourseEditor({ course, onCancel, onSave, onFetchQuizForEdit, onSaveQuiz, onFetchProvider, onFetchProfile, onFetchVideoDuration }) {

  const [quizState, setQuizState] = useState({}); // { [moduleId]: { expanded, loading, loaded, questions, saving, error } }

  // #316 — index of a module pending remove-confirmation, or null. Only
  // ever set for a module that already has a persisted `id` (i.e. one
  // that exists in the DB right now, not one only added client-side
  // during this editing session) — see requestRemoveModule below.
  const [removingModuleIndex, setRemovingModuleIndex] = useState(null);
  // #360 — simple conditional-mount confirm modal, no deferred-unmount
  // state, so active ties directly to the same truthiness as the `&&`.
  const removeModuleDialogRef = useFocusTrap(removingModuleIndex !== null);

  // Tracks the latest save request's sequence number per module, so an
  // older, slower response can never overwrite state with stale data
  // after a newer request has already completed. useRef (not useState)
  // specifically because it updates synchronously, immediately blocking
  // a rapid double-click before React even re-renders to disable the button.
  const saveSequenceRef = useRef({});

  const [draft, setDraft] = useState(() => {
    if (!course) return emptyCourseDraft();
    return {
      title: course.title,
      // #143 — provider is now locked to the trainer's real identity
      // (Provider.name, or their own profile.name) rather than preserved
      // free text, even when editing an existing course. Left blank here
      // and resolved by the effect below, so a course previously saved
      // with old/stale provider text doesn't flash before being replaced.
      provider: "",
      category: course.category,
      level: course.level,
      hours: course.hours,
      color: course.color,
      blurb: course.blurb ?? "",
      skills: course.skills ?? [],
      modules: course.modules.map((m) => ({ id: m.id, title: m.title, videoUrl: m.videoUrl ?? "" })),
      credits: course.credits.map((c) => ({ id: c.id, line: c.line })),
      faqs: course.faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer })),
    };
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // #143 — resolve the locked provider field: the trainer's Provider name
  // if they belong to one, else their own profile.name. Runs once on
  // mount — onFetchProvider/onFetchProfile are recreated on every App.jsx
  // render (not memoized), same pattern as LearningScreen's per-tab fetch
  // effects, so they're deliberately left out of the dependency array.
  const [providerFieldLoading, setProviderFieldLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([onFetchProvider(), onFetchProfile()])
      .then(([provider, profile]) => {
        if (cancelled) return;
        setDraft((d) => ({ ...d, provider: provider?.name || profile?.name || "" }));
      })
      .catch(() => {
        // Leave provider blank — canSave below keeps Save disabled until
        // this resolves, so there's no silent path to submitting an empty
        // provider string.
      })
      .finally(() => {
        if (!cancelled) setProviderFieldLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(field, v) { setDraft((d) => ({ ...d, [field]: v })); }

  // #275 — { [quizKey(m)]: { status: "loading"|"done", forUrl, supported, seconds } }.
  // Keyed the same way as quizState (real id once one exists, else the
  // module's localKey) so a lookup started for a brand-new module keeps
  // working after the course (and that module) is saved and re-keys by id
  // on the next load. `forUrl` guards against a slow, now-stale response
  // overwriting state after the trainer has since changed the field again.
  const [videoDurations, setVideoDurations] = useState({});
  const durationTimersRef = useRef({});

  function scheduleDurationLookup(key, url) {
    clearTimeout(durationTimersRef.current[key]);
    const trimmed = url.trim();
    if (!trimmed) {
      setVideoDurations((prev) => ({ ...prev, [key]: null }));
      return;
    }
    setVideoDurations((prev) => ({ ...prev, [key]: { status: "loading", forUrl: trimmed } }));
    durationTimersRef.current[key] = setTimeout(async () => {
      let result;
      try {
        result = await onFetchVideoDuration(trimmed);
      } catch {
        result = { supported: false, seconds: null };
      }
      setVideoDurations((prev) =>
        prev[key]?.forUrl === trimmed
          ? { ...prev, [key]: { status: "done", forUrl: trimmed, ...result } }
          : prev, // a newer edit has already superseded this lookup
      );
    }, VIDEO_DURATION_DEBOUNCE_MS);
  }

  // One-time pass on mount so an existing course's already-filled-in video
  // URLs get an estimate without the trainer needing to retype them.
  useEffect(() => {
    // Captured once, at mount — but since durationTimersRef.current is
    // never reassigned to a new object (only ever mutated in place via
    // durationTimersRef.current[key] = ...), `timers` still points at the
    // same, live object at cleanup time, with every timer scheduled in
    // between included. Satisfies react-hooks/exhaustive-deps' "ref may
    // have changed by cleanup time" warning without changing behavior.
    const timers = durationTimersRef.current;
    draft.modules.forEach((m) => {
      if (m.videoUrl && m.videoUrl.trim()) scheduleDurationLookup(quizKey(m), m.videoUrl);
    });
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #275 — video length (when resolved) plus a flat per-question allowance
  // for whatever quiz questions are currently loaded/authored for this
  // module in quizState. For an existing course's module whose "Manage
  // quiz" panel hasn't been opened this session, that count is 0 — an
  // known, acceptable gap for a first pass (see the module comment on
  // SECONDS_PER_QUESTION): the estimate simply improves once the trainer
  // expands it, same as it does for a freshly authored one.
  function moduleEstimate(m) {
    const dur = videoDurations[quizKey(m)];
    const videoSeconds = dur?.status === "done" && dur.supported ? dur.seconds : 0;
    const questionCount = (quizState[quizKey(m)]?.questions ?? []).filter(
      (q) => q.question.trim().length > 0,
    ).length;
    const quizSeconds = questionCount * SECONDS_PER_QUESTION;
    return {
      totalMinutes: (videoSeconds + quizSeconds) / 60,
      hasVideoEstimate: videoSeconds > 0,
      videoLookupStatus: dur?.status ?? null,
      videoSupported: dur?.status === "done" ? dur.supported : null,
      questionCount,
    };
  }

  const moduleEstimates = draft.modules.map(moduleEstimate);
  const totalEstimatedMinutes = moduleEstimates.reduce((sum, e) => sum + e.totalMinutes, 0);
  // #297 — rounds to the nearest 15-minute (HOURS_STEP) increment instead
  // of the nearest whole hour, so the suggestion (and the value "Use
  // estimate" writes into the Hours field) reflects the real module
  // total rather than always rounding it away.
  const suggestedHours =
    totalEstimatedMinutes > 0
      ? Math.max(HOURS_STEP, Math.round(totalEstimatedMinutes / 60 / HOURS_STEP) * HOURS_STEP)
      : 0;
  // Floating point (e.g. 0.1 + 0.2 !== 0.3) means a value round-tripped
  // through the estimate/step math can miss an exact match by a sliver —
  // compare to less than half a minute's worth of an hour instead of
  // strict equality.
  const hoursMatchesEstimate = suggestedHours > 0 && Math.abs(Number(draft.hours) - suggestedHours) < 0.01;

  function setModule(i, field, v) {
    setDraft((d) => ({
      ...d,
      modules: d.modules.map((m, x) => (x === i ? { ...m, [field]: v } : m)),
    }));
    if (field === "videoUrl") {
      const m = draft.modules[i];
      if (m) scheduleDurationLookup(quizKey(m), v);
    }
  }
  function addModule() {
    setDraft((d) => ({ ...d, modules: [...d.modules, { title: "", videoUrl: "", localKey: newLocalKey() }] }));
  }
  function removeModule(i) {
    setDraft((d) => ({ ...d, modules: d.modules.filter((_, x) => x !== i) }));
  }

  // #316 — a module with a real `id` already exists in the DB and, once
  // this course is saved, removing it cascades to delete every enrolled
  // learner's notes, forum posts, and quiz submissions for it (see
  // CoursesService.update's deleteOrphaned). A module with no `id` yet
  // only exists in this draft — nothing to lose, so it's removed
  // immediately with no prompt, same as before this fix.
  function requestRemoveModule(i) {
    const m = draft.modules[i];
    if (m?.id) {
      setRemovingModuleIndex(i);
    } else {
      removeModule(i);
    }
  }

  function confirmRemoveModule() {
    if (removingModuleIndex !== null) removeModule(removingModuleIndex);
    setRemovingModuleIndex(null);
  }

  function setFaq(i, field, v) {
    setDraft((d) => ({
      ...d,
      faqs: d.faqs.map((f, x) => (x === i ? { ...f, [field]: v } : f)),
    }));
  }
  function addFaq() { setDraft((d) => ({ ...d, faqs: [...d.faqs, { question: "", answer: "" }] })); }
  function removeFaq(i) { setDraft((d) => ({ ...d, faqs: d.faqs.filter((_, x) => x !== i) })); }

  function setCredit(i, v) {
    setDraft((d) => ({
      ...d,
      credits: d.credits.map((c, x) => (x === i ? { ...c, line: v } : c)),
    }));
  }
  function addCredit() { setDraft((d) => ({ ...d, credits: [...d.credits, { line: "" }] })); }
  function removeCredit(i) { setDraft((d) => ({ ...d, credits: d.credits.filter((_, x) => x !== i) })); }

  // #226 — free-text tag input: typing + Enter (or comma) commits the
  // current text as a new skill and clears the field, distinct from the
  // "list of objects with add/remove rows" pattern used above for
  // modules/credits/faqs since a skill is just a bare string, not a
  // multi-field object.
  const [skillInput, setSkillInput] = useState("");

  function addSkill(raw) {
    const value = raw.trim();
    if (!value) return;
    setDraft((d) => (d.skills.includes(value) ? d : { ...d, skills: [...d.skills, value] }));
    setSkillInput("");
  }
  function removeSkill(i) {
    setDraft((d) => ({ ...d, skills: d.skills.filter((_, x) => x !== i) }));
  }
  function handleSkillInputKeyDown(e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    }
  }

  /* ---------- Quiz management ----------
   * quizState is keyed by quizKey(m) — a module's real id once it has
   * one (always true in edit mode), or its client-only localKey while
   * authoring a brand-new course (#274). The two cases only diverge in
   * toggleQuiz (whether there's anything to fetch) and handleSaveQuiz
   * (whether there's a real module to PUT to yet) below; every other
   * question/option mutator here is agnostic to which kind of key it's
   * called with.
   */

  async function toggleQuiz(m) {
    const key = quizKey(m);
    const current = quizState[key];
    if (current?.expanded) {
      setQuizState((prev) => ({ ...prev, [key]: { ...prev[key], expanded: false } }));
      return;
    }

    setQuizState((prev) => ({
      ...prev,
      [key]: { ...prev[key], expanded: true, loading: !prev[key]?.loaded && !!m.id },
    }));

    if (current?.loaded) return; // already fetched/initialized once, just re-showing

    // #274 — a module with no real id yet (new-course flow, not saved)
    // has no quiz to fetch from the server — it's authored fresh, right
    // here, and carried along in quizState until the course itself is
    // saved (see handleSave).
    if (!m.id) {
      setQuizState((prev) => ({
        ...prev,
        [key]: { ...prev[key], loading: false, loaded: true, questions: [emptyQuestion()], error: null },
      }));
      return;
    }

    try {
      const questions = await onFetchQuizForEdit(m.id);
      setQuizState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          loading: false,
          loaded: true,
          questions: questions.length > 0 ? questions.map(normalizeLoadedQuestion) : [emptyQuestion()],
          error: null,
        },
      }));
    } catch (err) {
      setQuizState((prev) => ({
        ...prev,
        [key]: { ...prev[key], loading: false, error: err.message },
      }));
    }
  }

  function updateQuestions(moduleId, updater) {
    setQuizState((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], questions: updater(prev[moduleId].questions) },
    }));
  }

  function setQuestionText(moduleId, qIndex, text) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, question: text } : q)),
    );
  }

  function addQuestion(moduleId) {
    updateQuestions(moduleId, (qs) => [...qs, emptyQuestion()]);
  }

  function removeQuestion(moduleId, qIndex) {
    updateQuestions(moduleId, (qs) => qs.filter((_, i) => i !== qIndex));
  }

  function setOptionText(moduleId, qIndex, oIndex, text) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, x) => (x === oIndex ? { ...o, optionText: text } : o)) }
          : q,
      ),
    );
  }

  function setCorrectOption(moduleId, qIndex, oIndex) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, x) => ({ ...o, isCorrect: x === oIndex })) }
          : q,
      ),
    );
  }

  function addOption(moduleId, qIndex) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, { optionText: "", isCorrect: false }] } : q)),
    );
  }

  function removeOption(moduleId, qIndex, oIndex) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, options: q.options.filter((_, x) => x !== oIndex) } : q)),
    );
  }

  // #40 — question type toggle (mcq / short_answer). Switching type doesn't
  // clear the other shape's data, so accidental toggles are non-destructive.
  function setQuestionType(moduleId, qIndex, type) {
    updateQuestions(moduleId, (qs) => qs.map((q, i) => (i === qIndex ? { ...q, type } : q)));
  }

  function setAcceptableAnswer(moduleId, qIndex, aIndex, text) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, acceptableAnswers: q.acceptableAnswers.map((a, x) => (x === aIndex ? text : a)) }
          : q,
      ),
    );
  }

  function addAcceptableAnswer(moduleId, qIndex) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, acceptableAnswers: [...q.acceptableAnswers, ""] } : q)),
    );
  }

  function removeAcceptableAnswer(moduleId, qIndex, aIndex) {
    updateQuestions(moduleId, (qs) =>
      qs.map((q, i) =>
        i === qIndex ? { ...q, acceptableAnswers: q.acceptableAnswers.filter((_, x) => x !== aIndex) } : q,
      ),
    );
  }

  function quizValidationError(questions) {
    for (const q of questions) {
      if (!q.question.trim()) return "Every question needs text.";
      if (q.type === "short_answer") {
        if (q.acceptableAnswers.filter((a) => a.trim()).length < 1) {
          return "Every short-answer question needs at least 1 acceptable answer.";
        }
      } else {
        if (q.options.length < 2) return "Every question needs at least 2 options.";
        if (q.options.some((o) => !o.optionText.trim())) return "Every option needs text.";
        if (q.options.filter((o) => o.isCorrect).length !== 1) return "Every question needs exactly one correct option.";
      }
    }
    return null;
  }

  async function handleSaveQuiz(m) {
    const key = quizKey(m);
    const questions = quizState[key]?.questions ?? [];
    const validationError = quizValidationError(questions);
    if (validationError) {
      setQuizState((prev) => ({ ...prev, [key]: { ...prev[key], error: validationError } }));
      return;
    }

    // #274 — a module with no real id yet (new-course flow) has nothing
    // to PUT to: there's no dedicated quiz endpoint to call until the
    // module exists. Just validate and mark it saved-locally; the actual
    // persistence happens atomically with the rest of the course in
    // handleSave, which reads straight out of quizState.
    if (!m.id) {
      setQuizState((prev) => ({
        ...prev,
        [key]: { ...prev[key], error: null, savedLocally: true },
      }));
      return;
    }

    const payload = {
      questions: questions.map((q) => ({
        ...(q.id ? { id: q.id } : {}),
        question: q.question,
        type: q.type,
        ...(q.type === "short_answer"
          ? { acceptableAnswers: q.acceptableAnswers.map((a) => a.trim()).filter((a) => a.length > 0) }
          : {
              options: q.options.map((o) => ({
                ...(o.id ? { id: o.id } : {}),
                optionText: o.optionText,
                isCorrect: o.isCorrect,
              })),
            }),
      })),
    };

    // Claim this as the latest request for this module, synchronously —
    // any earlier in-flight request for the same module is now stale.
    const mySequence = (saveSequenceRef.current[key] ?? 0) + 1;
    saveSequenceRef.current[key] = mySequence;

    setQuizState((prev) => ({ ...prev, [key]: { ...prev[key], saving: true, error: null } }));
    try {
      const saved = await onSaveQuiz(m.id, payload);

      // If a newer request has started since this one began, this
      // response is stale — discard it rather than overwrite fresher
      // (or in-flight) state.
      if (saveSequenceRef.current[key] !== mySequence) return;

      setQuizState((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saving: false,
          questions: saved.length > 0 ? saved.map(normalizeLoadedQuestion) : [emptyQuestion()],
        },
      }));
    } catch (err) {
      if (saveSequenceRef.current[key] !== mySequence) return;
      setQuizState((prev) => ({
        ...prev,
        [key]: { ...prev[key], saving: false, error: err.message },
      }));
    }
  }

  /* ---------- Course save ---------- */

  const canSave =
    draft.title.trim().length > 1 &&
    draft.modules.some((m) => m.title.trim().length > 0) &&
    draft.provider.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;

    // #274 — inline quiz questions authored before the course's first
    // save (new-course flow only; an existing course's quiz continues to
    // go through the dedicated PUT .../quiz endpoint, untouched here).
    // Validate every module's buffered questions up front so a bad quiz
    // blocks the whole save with a clear message, rather than the
    // backend's own validation rejecting the request after the fact.
    if (!course) {
      for (const m of draft.modules) {
        if (m.title.trim().length === 0) continue;
        const qs = (quizState[quizKey(m)]?.questions ?? []).filter((q) => q.question.trim().length > 0);
        if (qs.length === 0) continue;
        const validationError = quizValidationError(qs);
        if (validationError) {
          setSaveError(`"${m.title}" quiz: ${validationError}`);
          return;
        }
      }
    }

    const payload = {
      title: draft.title,
      provider: draft.provider,
      category: draft.category,
      level: draft.level,
      // #297 — rounded to 2dp before send: hours is no longer always a
      // whole number, and repeated step math (or a trainer typing a long
      // decimal by hand) can otherwise produce float noise like
      // 1.2500000000000002, which the backend's maxDecimalPlaces: 2
      // validation would reject.
      hours: Math.round((Number(draft.hours) || 0) * 100) / 100,
      color: draft.color,
      blurb: draft.blurb || undefined,
      skills: draft.skills,
      modules: draft.modules
        .filter((m) => m.title.trim().length > 0)
        .map((m) => {
          const qs = !course
            ? (quizState[quizKey(m)]?.questions ?? []).filter((q) => q.question.trim().length > 0)
            : [];
          return {
            ...(m.id ? { id: m.id } : {}),
            title: m.title,
            videoUrl: m.videoUrl || null,
            ...(qs.length > 0
              ? {
                  quizQuestions: qs.map((q) => ({
                    question: q.question,
                    type: q.type,
                    ...(q.type === "short_answer"
                      ? { acceptableAnswers: q.acceptableAnswers.map((a) => a.trim()).filter((a) => a.length > 0) }
                      : { options: q.options.map((o) => ({ optionText: o.optionText, isCorrect: o.isCorrect })) }),
                  })),
                }
              : {}),
          };
        }),
      credits: draft.credits
        .filter((c) => c.line.trim().length > 0)
        .map((c) => ({ ...(c.id ? { id: c.id } : {}), line: c.line })),
      faqs: draft.faqs
        .filter((f) => f.question.trim().length > 0 && f.answer.trim().length > 0)
        .map((f) => ({
          ...(f.id ? { id: f.id } : {}),
          question: f.question,
          answer: f.answer,
        })),
    };

    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ id: course?.id ?? null, payload });
    } catch (err) {
      setSaveError(err.message || "Failed to save course. Please try again.");
      setSaving(false);
    }
  }

  const field = { marginBottom: 16 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 };
  // #350 — outline:none removed: it silently killed keyboard focus
  // visibility on every input/select using this style object. The
  // shared input:focus-visible rule in global.css now supplies a
  // visible outline instead.
  const rowInput = { fontFamily: "var(--font-body)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%", background: "var(--paper-2)" };

  return (
    // #336 — shared .enc-page-scaled primitive instead of a hardcoded
    // maxWidth (also picks up margin:auto, which this page was missing —
    // same centering gap #204/#212 fixed on Dashboard/Learning).
    <div className="enc-page-enter enc-page-scaled" style={{ padding: "28px 32px 60px", "--enc-page-base": "760px" }}>
      {/* #360 — was <div onClick>: not a real link/button. */}
      <button type="button" onClick={onCancel} style={{ font: "inherit", display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--slate)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 14 }}>
        <ChevronLeft size={15} /> Back to Trainer studio
      </button>
      <div style={{ fontSize: 19, fontFamily: "var(--font-display)", fontWeight: 600, marginBottom: 18 }}>
        {course ? "Edit course" : "New course"}
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 14 }}>Catalogue details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={field}>
            <label style={label}>Title</label>
            <input style={rowInput} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Course title" />
          </div>
          <div style={field}>
            <label style={label}>Provider</label>
            <input
              style={{ ...rowInput, background: "var(--line)", color: "var(--slate)", cursor: "not-allowed" }}
              value={providerFieldLoading ? "" : draft.provider}
              placeholder={providerFieldLoading ? "Loading…" : ""}
              disabled
              readOnly
            />
            <div style={{ fontSize: 11, color: !providerFieldLoading && !draft.provider ? "var(--coral)" : "var(--slate-light)", marginTop: 4 }}>
              {!providerFieldLoading && !draft.provider
                ? "Couldn't resolve your name or provider — try reopening the editor."
                : "Auto-filled from your provider (or your account name) — trainers can't edit this directly."}
            </div>
          </div>
          <div style={field}>
            <label style={label}>Track</label>
            <select style={rowInput} value={draft.category} onChange={(e) => set("category", e.target.value)}>
              {TRAINER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Level</label>
            <select style={rowInput} value={draft.level} onChange={(e) => set("level", e.target.value)}>
              {TRAINER_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Hours</label>
            <input style={rowInput} type="number" min={0} step={HOURS_STEP} value={draft.hours} onChange={(e) => set("hours", e.target.value)} />
            {/* #275 — additive suggestion, not a replacement: derived from
                each module's video length + quiz question count below, but
                the number field above stays manually editable either way
                (e.g. for modules whose video source isn't YouTube).
                #297 — this row used to disappear entirely once Hours
                matched the estimate, which reads as the feature glitching
                off (especially right after clicking "Use estimate" itself)
                rather than as confirmation it worked. It now stays put and
                switches to a green in-sync message instead. */}
            {suggestedHours > 0 && (
              hoursMatchesEstimate ? (
                <div style={{ fontSize: 11.5, color: "var(--success)", fontWeight: 600, marginTop: 5 }}>
                  ✓ Matching Encyclopedia's estimated time (~{formatMinutes(suggestedHours * 60)}).
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginTop: 5 }}>
                  Estimated from modules: ~{formatMinutes(suggestedHours * 60)} ({formatMinutes(totalEstimatedMinutes)} exact).{" "}
                  <span
                    onClick={() => set("hours", suggestedHours)}
                    style={{ color: "var(--gold-dark)", fontWeight: 600, cursor: "pointer" }}
                  >
                    Use estimate
                  </span>
                </div>
              )
            )}
          </div>
          <div style={field}>
            <label style={label}>Accent color</label>
            <select style={rowInput} value={draft.color} onChange={(e) => set("color", e.target.value)}>
              {TRAINER_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={field}>
          <label style={label}>Summary</label>
          <textarea style={{ ...rowInput, minHeight: 70, resize: "vertical" }} value={draft.blurb} onChange={(e) => set("blurb", e.target.value)} placeholder="One or two sentences a learner sees on the catalogue card." />
        </div>
        <div>
          <label style={label}>Skill tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {draft.skills.map((s, i) => (
              <span
                key={`${s}-${i}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--ink)", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 999, padding: "4px 10px" }}
              >
                {s}
                {/* #258 — real button (was a bare clickable icon). */}
                <button
                  type="button"
                  aria-label={`Remove skill ${s}`}
                  onClick={() => removeSkill(i)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <input
            style={rowInput}
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={handleSkillInputKeyDown}
            onBlur={() => addSkill(skillInput)}
            placeholder="Type a skill and press Enter (e.g. Git, SQL, Negotiation)"
          />
        </div>
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
          <Video size={14} color="var(--slate-light)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Modules &amp; video</span>
        </div>
        {draft.modules.map((m, i) => {
          const qState = quizState[quizKey(m)];
          const estimate = moduleEstimates[i];
          return (
            <div key={m.id ?? m.localKey ?? `new-${i}`} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--slate-light)", width: 20, marginTop: 9 }}>{String(i + 1).padStart(2, "0")}</span>
                <div style={{ flex: 1 }}>
                  <input style={{ ...rowInput, marginBottom: 6 }} value={m.title} onChange={(e) => setModule(i, "title", e.target.value)} placeholder="Module title" />
                  <input style={rowInput} value={m.videoUrl || ""} onChange={(e) => setModule(i, "videoUrl", e.target.value)}
                    placeholder="Video embed URL (e.g. https://www.youtube.com/embed/...)" />
                  {/* #275 — computed time estimate for this module: video
                      length (YouTube only, for now) plus a flat allowance
                      per quiz question. Purely informational/additive — it
                      only ever feeds the course-level "Use estimate"
                      suggestion above, never overwrites anything here. */}
                  {estimate.videoLookupStatus === "loading" && (
                    <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginTop: 4 }}>Checking video length…</div>
                  )}
                  {estimate.videoLookupStatus === "done" && (
                    <div style={{ fontSize: 11.5, color: "var(--slate-light)", marginTop: 4 }}>
                      {estimate.videoSupported
                        ? `Estimated module time: ~${formatMinutes(estimate.totalMinutes)}${estimate.questionCount > 0 ? ` (video + ${estimate.questionCount} quiz Q${estimate.questionCount === 1 ? "" : "s"})` : " (video)"}`
                        : "Video length unavailable for this source — enter course hours manually below."}
                    </div>
                  )}
                </div>
                {/* #258 — real button (was a bare clickable icon). */}
                <button
                  type="button"
                  aria-label={`Remove module ${m.title || i + 1}`}
                  onClick={() => requestRemoveModule(i)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 10, display: "inline-flex", lineHeight: 0 }}
                >
                  <Trash2 size={16} color="var(--slate-light)" />
                </button>
              </div>

              <div style={{ marginLeft: 28, marginTop: 6 }}>
                <span
                  onClick={() => toggleQuiz(m)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "var(--gold-dark)", cursor: "pointer" }}
                >
                  <HelpCircle size={13} />
                  Manage quiz
                  {qState?.expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>

                {qState?.expanded && (
                  <div className="enc-card" style={{ padding: 14, marginTop: 8, background: "var(--paper)" }}>
                    {qState.loading ? (
                      <div style={{ fontSize: 12.5, color: "var(--slate-light)" }}>Loading quiz…</div>
                    ) : (
                      <>
                        {(qState.questions ?? []).map((q, qIndex) => (
                          <div key={q.id ?? `newq-${qIndex}`} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                              <input
                                style={rowInput}
                                value={q.question}
                                onChange={(e) => setQuestionText(quizKey(m), qIndex, e.target.value)}
                                placeholder={`Question ${qIndex + 1}`}
                              />
                              <select
                                style={{ ...rowInput, width: "auto", flexShrink: 0 }}
                                value={q.type}
                                onChange={(e) => setQuestionType(quizKey(m), qIndex, e.target.value)}
                                title="Question type"
                              >
                                <option value="mcq">Multiple choice</option>
                                <option value="short_answer">Short answer</option>
                              </select>
                              {/* #258 — real button (was a bare clickable icon). */}
                              <button
                                type="button"
                                aria-label={`Remove question ${qIndex + 1}`}
                                onClick={() => removeQuestion(quizKey(m), qIndex)}
                                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 9, flexShrink: 0, display: "inline-flex", lineHeight: 0 }}
                              >
                                <Trash2 size={15} color="var(--slate-light)" />
                              </button>
                            </div>
                            {q.type === "short_answer" ? (
                              <>
                                {q.acceptableAnswers.map((a, aIndex) => (
                                  <div key={aIndex} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, marginLeft: 12 }}>
                                    <input
                                      style={{ ...rowInput, flex: 1 }}
                                      value={a}
                                      onChange={(e) => setAcceptableAnswer(quizKey(m), qIndex, aIndex, e.target.value)}
                                      placeholder={`Acceptable answer ${aIndex + 1}`}
                                    />
                                    {/* #258 — real button (was a bare clickable icon). */}
                                    <button
                                      type="button"
                                      aria-label={`Remove acceptable answer ${aIndex + 1}`}
                                      onClick={() => removeAcceptableAnswer(quizKey(m), qIndex, aIndex)}
                                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, display: "inline-flex", lineHeight: 0 }}
                                    >
                                      <Trash2 size={14} color="var(--slate-light)" />
                                    </button>
                                  </div>
                                ))}
                                <span
                                  onClick={() => addAcceptableAnswer(quizKey(m), qIndex)}
                                  style={{ fontSize: 12, color: "var(--gold-dark)", fontWeight: 600, cursor: "pointer", marginLeft: 12 }}
                                >
                                  + Add acceptable answer
                                </span>
                              </>
                            ) : (
                              <>
                                {q.options.map((o, oIndex) => (
                                  <div key={o.id ?? `newo-${oIndex}`} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, marginLeft: 12 }}>
                                    <input
                                      type="radio"
                                      name={`correct-${quizKey(m)}-${qIndex}`}
                                      checked={o.isCorrect}
                                      onChange={() => setCorrectOption(quizKey(m), qIndex, oIndex)}
                                      title="Mark as correct answer"
                                    />
                                    <input
                                      style={{ ...rowInput, flex: 1 }}
                                      value={o.optionText}
                                      onChange={(e) => setOptionText(quizKey(m), qIndex, oIndex, e.target.value)}
                                      placeholder={`Option ${oIndex + 1}`}
                                    />
                                    {/* #258 — real button (was a bare clickable icon). */}
                                    <button
                                      type="button"
                                      aria-label={`Remove option ${oIndex + 1}`}
                                      onClick={() => removeOption(quizKey(m), qIndex, oIndex)}
                                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, display: "inline-flex", lineHeight: 0 }}
                                    >
                                      <Trash2 size={14} color="var(--slate-light)" />
                                    </button>
                                  </div>
                                ))}
                                <span
                                  onClick={() => addOption(quizKey(m), qIndex)}
                                  style={{ fontSize: 12, color: "var(--gold-dark)", fontWeight: 600, cursor: "pointer", marginLeft: 12 }}
                                >
                                  + Add option
                                </span>
                              </>
                            )}
                          </div>
                        ))}

                        <button className="enc-btn enc-btn-ghost" style={{ fontSize: 12.5, padding: "6px 12px", marginRight: 8 }} onClick={() => addQuestion(quizKey(m))}>
                          <Plus size={12} /> Add question
                        </button>
                        <button
                          className="enc-btn enc-btn-gold"
                          style={{ fontSize: 12.5, padding: "6px 12px", opacity: qState.saving ? 0.7 : 1 }}
                          disabled={qState.saving}
                          onClick={() => handleSaveQuiz(m)}
                        >
                          {qState.saving ? "Saving…" : m.id ? "Save quiz" : "Use quiz"}
                        </button>

                        {qState.error && <div style={{ fontSize: 12, color: "var(--coral)", marginTop: 8 }}>{qState.error}</div>}
                        {!m.id && qState.savedLocally && !qState.error && (
                          <div style={{ fontSize: 12, color: "var(--slate-light)", marginTop: 8 }}>
                            Looks good — this quiz will be created together with the course when you save.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <button className="enc-btn enc-btn-ghost" style={{ fontSize: 13, padding: "7px 12px", marginTop: 4 }} onClick={addModule}><Plus size={13} /> Add module</button>
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 14 }}>FAQ</div>
        {draft.faqs.map((f, i) => (
          <div key={f.id ?? `new-${i}`} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <input style={{ ...rowInput, marginBottom: 6 }} value={f.question} onChange={(e) => setFaq(i, "question", e.target.value)} placeholder="Question" />
              <input style={rowInput} value={f.answer} onChange={(e) => setFaq(i, "answer", e.target.value)} placeholder="Answer" />
            </div>
            {/* #258 — real button (was a bare clickable icon). */}
            <button
              type="button"
              aria-label={`Remove FAQ item ${i + 1}`}
              onClick={() => removeFaq(i)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginTop: 10, display: "inline-flex", lineHeight: 0 }}
            >
              <Trash2 size={16} color="var(--slate-light)" />
            </button>
          </div>
        ))}
        <button className="enc-btn enc-btn-ghost" style={{ fontSize: 13, padding: "7px 12px" }} onClick={addFaq}><Plus size={13} /> Add FAQ item</button>
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
          <BookMarked size={13} color="var(--slate-light)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Sources &amp; credits</span>
        </div>
        {draft.credits.map((c, i) => (
          <div key={c.id ?? `new-${i}`} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input style={rowInput} value={c.line} onChange={(e) => setCredit(i, e.target.value)} placeholder="e.g. Curriculum & instruction: ..." />
            {/* #258 — real button (was a bare clickable icon). */}
            <button
              type="button"
              aria-label={`Remove credit line ${i + 1}`}
              onClick={() => removeCredit(i)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, display: "inline-flex", lineHeight: 0 }}
            >
              <Trash2 size={16} color="var(--slate-light)" />
            </button>
          </div>
        ))}
        <button className="enc-btn enc-btn-ghost" style={{ fontSize: 13, padding: "7px 12px" }} onClick={addCredit}><Plus size={13} /> Add credit line</button>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="enc-btn enc-btn-gold" style={{ opacity: canSave && !saving ? 1 : 0.5 }} disabled={!canSave || saving} onClick={handleSave}>
          <Save size={15} /> {saving ? "Saving…" : "Save course"}
        </button>
        <button className="enc-btn enc-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      {!canSave && <div style={{ fontSize: 12, color: "var(--slate-light)", marginTop: 8 }}>Add a title and at least one module to save.</div>}
      {saveError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 8 }}>{saveError}</div>}

      {/* #316 — portaled to document.body, same fix/reasoning as #301's
          modals: this whole screen is nested inside a `enc-page-enter`
          root div, whose keyframe leaves a lingering transform after it
          finishes animating in, which creates a containing block for
          `position: fixed` descendants and would otherwise size this
          backdrop to the page content's box instead of the viewport. */}
      {removingModuleIndex !== null && createPortal(
        <div
          onClick={() => setRemovingModuleIndex(null)}
          className="enc-modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "var(--ink-70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55, padding: 20 }}
        >
          <div
            ref={removeModuleDialogRef}
            onClick={(e) => e.stopPropagation()}
            className="enc-card enc-modal-card"
            style={{ width: "100%", maxWidth: 400, padding: "24px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="enc-remove-module-modal-title"
            tabIndex={-1}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div id="enc-remove-module-modal-title" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17 }}>Remove this module?</div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setRemovingModuleIndex(null)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <X size={18} color="var(--slate)" />
              </button>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--slate)", lineHeight: 1.5, marginBottom: 20 }}>
              This module already has learners enrolled in the course. Once you save, removing{" "}
              <strong>{draft.modules[removingModuleIndex]?.title || "this module"}</strong> permanently deletes every
              enrolled learner's notes, forum posts, and quiz submissions for it — not just your own. This can't be undone.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="enc-btn enc-btn-ghost" onClick={() => setRemovingModuleIndex(null)}>Cancel</button>
              <button
                className="enc-btn"
                style={{ background: "var(--coral)", color: "#fff" }}
                onClick={confirmRemoveModule}
              >
                Remove module
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}