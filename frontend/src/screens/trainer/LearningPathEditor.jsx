import { useState } from "react";
import { ChevronLeft, ChevronUp, ChevronDown, Milestone, Plus, Save, Trash2 } from "lucide-react";

// #224 — a learning path never authors its own content: it only ever
// references existing Courses (see the backend's LearningPathCourse join),
// so this editor is deliberately much smaller than TrainerCourseEditor —
// title/description plus an ordered pick-list built from the trainer's
// `courses` prop, not a from-scratch content form.
function emptyPathDraft() {
  return { title: "", description: "", courseIds: [] };
}

export function LearningPathEditor({ path, courses, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => {
    if (!path) return emptyPathDraft();
    return {
      title: path.title,
      description: path.description ?? "",
      courseIds: path.courses.map((c) => c.id),
    };
  });
  const [pickerCourseId, setPickerCourseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  function set(field, v) {
    setDraft((d) => ({ ...d, [field]: v }));
  }

  // #224 — only courses not already in the path show up in the picker, so
  // a trainer can't accidentally add the same course twice (the backend
  // rejects that anyway — see CreateLearningPathDto — but there's no
  // reason to let the UI offer an option that can only fail).
  const availableCourses = courses.filter((c) => !draft.courseIds.includes(c.id));

  function addCourse() {
    if (!pickerCourseId) return;
    setDraft((d) => ({ ...d, courseIds: [...d.courseIds, pickerCourseId] }));
    setPickerCourseId("");
  }
  function removeCourse(i) {
    setDraft((d) => ({ ...d, courseIds: d.courseIds.filter((_, x) => x !== i) }));
  }
  function moveCourse(i, direction) {
    const target = i + direction;
    setDraft((d) => {
      if (target < 0 || target >= d.courseIds.length) return d;
      const next = d.courseIds.slice();
      [next[i], next[target]] = [next[target], next[i]];
      return { ...d, courseIds: next };
    });
  }

  const canSave = draft.title.trim().length > 1 && draft.courseIds.length >= 2;

  async function handleSave() {
    if (!canSave) return;
    const payload = {
      title: draft.title,
      description: draft.description || undefined,
      courseIds: draft.courseIds,
    };
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ id: path?.id ?? null, payload });
    } catch (err) {
      setSaveError(err.message || "Failed to save learning path. Please try again.");
      setSaving(false);
    }
  }

  const field = { marginBottom: 16 };
  const label = { display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--ink)", marginBottom: 6 };
  // #350 — outline:none removed; global.css's input:focus-visible rule
  // supplies a visible focus outline instead (see TrainerCourseEditor's
  // identical rowInput for the full rationale).
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
        {path ? "Edit learning path" : "New learning path"}
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 14 }}>Path details</div>
        <div style={field}>
          <label style={label}>Title</label>
          <input style={rowInput} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. New Hire Onboarding" />
        </div>
        <div>
          <label style={label}>Description</label>
          <textarea style={{ ...rowInput, minHeight: 70, resize: "vertical" }} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="One or two sentences describing what this path prepares a learner for." />
        </div>
      </div>

      <div className="enc-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
          <Milestone size={14} color="var(--slate-light)" />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--slate-light)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Courses, in order</span>
        </div>

        {draft.courseIds.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--slate-light)", marginBottom: 12 }}>
            Add at least 2 courses below to build this path.
          </div>
        )}

        {draft.courseIds.map((courseId, i) => {
          const c = courses.find((x) => x.id === courseId);
          return (
            <div key={courseId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < draft.courseIds.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--slate-light)", width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ flex: 1, fontSize: 14 }}>{c ? c.title : "(course no longer available)"}</span>
              {/* #258 — real buttons (were bare clickable icons). First/last
                  items now use native `disabled` instead of a color/cursor
                  "looks disabled" hack — excludes them from tab order and
                  announces the disabled state to screen readers. */}
              <button
                type="button"
                aria-label={`Move ${c ? c.title : "course"} up`}
                disabled={i === 0}
                onClick={() => moveCourse(i, -1)}
                style={{ background: "none", border: "none", padding: 0, cursor: i === 0 ? "not-allowed" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <ChevronUp size={15} color={i === 0 ? "var(--line)" : "var(--slate-light)"} />
              </button>
              <button
                type="button"
                aria-label={`Move ${c ? c.title : "course"} down`}
                disabled={i === draft.courseIds.length - 1}
                onClick={() => moveCourse(i, 1)}
                style={{ background: "none", border: "none", padding: 0, cursor: i === draft.courseIds.length - 1 ? "not-allowed" : "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <ChevronDown size={15} color={i === draft.courseIds.length - 1 ? "var(--line)" : "var(--slate-light)"} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${c ? c.title : "course"} from path`}
                onClick={() => removeCourse(i)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", lineHeight: 0 }}
              >
                <Trash2 size={15} color="var(--slate-light)" />
              </button>
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 8, marginTop: draft.courseIds.length > 0 ? 14 : 0 }}>
          <select style={{ ...rowInput, flex: 1 }} value={pickerCourseId} onChange={(e) => setPickerCourseId(e.target.value)}>
            <option value="">
              {availableCourses.length === 0 ? "No more courses to add" : "Choose a course to add…"}
            </option>
            {availableCourses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button className="enc-btn enc-btn-ghost" style={{ flexShrink: 0 }} disabled={!pickerCourseId} onClick={addCourse}>
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="enc-btn enc-btn-gold" style={{ opacity: canSave && !saving ? 1 : 0.5 }} disabled={!canSave || saving} onClick={handleSave}>
          <Save size={15} /> {saving ? "Saving…" : "Save path"}
        </button>
        <button className="enc-btn enc-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
      {!canSave && <div style={{ fontSize: 12, color: "var(--slate-light)", marginTop: 8 }}>Add a title and at least 2 courses to save.</div>}
      {saveError && <div style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 8 }}>{saveError}</div>}
    </div>
  );
}
