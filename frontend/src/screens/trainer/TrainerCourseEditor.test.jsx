import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TrainerCourseEditor } from "./TrainerCourseEditor";

// #498 — covers the new-course authoring path: the provider field (#143)
// gating canSave until it resolves, the skills tag input's add/remove
// (#226, the field whose line-wrap bug was fixed earlier this cycle),
// and the save payload shape, plus a smoke test of inline quiz
// authoring (#274) for a not-yet-saved module.

function baseProps(overrides = {}) {
  return {
    course: null,
    onCancel: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onFetchQuizForEdit: vi.fn().mockResolvedValue([]),
    onFetchQuizQuestionCounts: vi.fn().mockResolvedValue([]),
    onSaveQuiz: vi.fn().mockResolvedValue(undefined),
    onFetchProvider: vi.fn().mockResolvedValue(null),
    onFetchProfile: vi.fn().mockResolvedValue({ name: "Jordan Lee" }),
    onFetchVideoDuration: vi.fn().mockResolvedValue({ supported: false, seconds: null }),
    ...overrides,
  };
}

describe("TrainerCourseEditor — provider field gates saving", () => {
  it("disables Save until the provider name resolves, even with title/module filled in", async () => {
    let resolveProfile;
    const onFetchProfile = vi.fn(
      () => new Promise((resolve) => { resolveProfile = resolve; }),
    );
    render(<TrainerCourseEditor {...baseProps({ onFetchProfile })} />);

    fireEvent.change(screen.getByPlaceholderText("Course title"), { target: { value: "New Course" } });
    fireEvent.change(screen.getByPlaceholderText("Module title"), { target: { value: "Intro" } });

    expect(screen.getByRole("button", { name: /save course/i })).toBeDisabled();

    resolveProfile({ name: "Jordan Lee" });
    await waitFor(() => expect(screen.getByRole("button", { name: /save course/i })).not.toBeDisabled());
  });

  it("prefers the provider's name over the trainer's own profile name once both resolve", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <TrainerCourseEditor
        {...baseProps({
          onSave,
          onFetchProvider: vi.fn().mockResolvedValue({ name: "Acme Training" }),
          onFetchProfile: vi.fn().mockResolvedValue({ name: "Jordan Lee" }),
        })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Course title"), { target: { value: "New Course" } });
    fireEvent.change(screen.getByPlaceholderText("Module title"), { target: { value: "Intro" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /save course/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /save course/i }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ provider: "Acme Training" }) }),
      ),
    );
  });
});

describe("TrainerCourseEditor — save validation", () => {
  it("keeps Save disabled with no title even once the provider has resolved", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    await waitFor(() => expect(screen.getByPlaceholderText("Course title")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /save course/i })).toBeDisabled();
  });

  it("keeps Save disabled when every module title is blank", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    fireEvent.change(screen.getByPlaceholderText("Course title"), { target: { value: "New Course" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /save course/i })).toBeDisabled());
  });

  it("adding a module renders a second module title input", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    // #498 fix-up — waits for the provider-field fetch effect to settle
    // before firing further events, so its later setState doesn't land
    // outside this test's act() scope and log a console warning.
    await screen.findByPlaceholderText("Course title");
    fireEvent.click(screen.getByRole("button", { name: /add module/i }));
    expect(screen.getAllByPlaceholderText("Module title")).toHaveLength(2);
  });
});

describe("TrainerCourseEditor — save payload", () => {
  it("builds the expected payload shape and calls onSave with id: null for a new course", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TrainerCourseEditor {...baseProps({ onSave })} />);

    fireEvent.change(screen.getByPlaceholderText("Course title"), { target: { value: "New Course" } });
    fireEvent.change(screen.getByPlaceholderText("Module title"), { target: { value: "Intro" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /save course/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /save course/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [[arg]] = onSave.mock.calls;
    expect(arg.id).toBeNull();
    expect(arg.payload).toEqual(
      expect.objectContaining({
        title: "New Course",
        provider: "Jordan Lee",
        skills: [],
        modules: [expect.objectContaining({ title: "Intro", videoUrl: null })],
      }),
    );
  });

  it("shows an error and stops saving when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server is busy, try again."));
    render(<TrainerCourseEditor {...baseProps({ onSave })} />);

    fireEvent.change(screen.getByPlaceholderText("Course title"), { target: { value: "New Course" } });
    fireEvent.change(screen.getByPlaceholderText("Module title"), { target: { value: "Intro" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /save course/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /save course/i }));

    expect(await screen.findByText("Server is busy, try again.")).toBeInTheDocument();
  });
});

describe("TrainerCourseEditor — skills tag input", () => {
  // #498 fix-up — every test here awaits the initial render (the
  // provider-field fetch effect resolving) before firing events, so
  // that effect's setState lands inside this test's act() scope instead
  // of logging a console warning after the fact.

  it("adds a skill chip on Enter and clears the input", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    await screen.findByPlaceholderText("Course title");
    const input = screen.getByPlaceholderText(/Type a skill and press Enter/);

    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("SQL")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("commits the pending skill on blur too, not just Enter", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    await screen.findByPlaceholderText("Course title");
    const input = screen.getByPlaceholderText(/Type a skill and press Enter/);

    fireEvent.change(input, { target: { value: "Negotiation" } });
    fireEvent.blur(input);

    expect(screen.getByText("Negotiation")).toBeInTheDocument();
  });

  it("does not add a duplicate skill", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    await screen.findByPlaceholderText("Course title");
    const input = screen.getByPlaceholderText(/Type a skill and press Enter/);

    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getAllByText("SQL")).toHaveLength(1);
  });

  it("removes a skill chip via its remove button", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);
    await screen.findByPlaceholderText("Course title");
    const input = screen.getByPlaceholderText(/Type a skill and press Enter/);
    fireEvent.change(input, { target: { value: "SQL" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Remove skill SQL" }));

    expect(screen.queryByText("SQL")).not.toBeInTheDocument();
  });
});

describe("TrainerCourseEditor — inline quiz authoring for a new (unsaved) module", () => {
  it("expanding 'Manage quiz' on a brand-new module starts with one empty question, and Add question appends another", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);

    fireEvent.click(screen.getByText("Manage quiz"));

    expect(await screen.findByPlaceholderText("Question 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add question/i }));

    expect(await screen.findByPlaceholderText("Question 2")).toBeInTheDocument();
  });

  it("removing a question removes its input", async () => {
    render(<TrainerCourseEditor {...baseProps()} />);

    fireEvent.click(screen.getByText("Manage quiz"));
    await screen.findByPlaceholderText("Question 1");
    fireEvent.click(screen.getByRole("button", { name: /add question/i }));
    await screen.findByPlaceholderText("Question 2");

    fireEvent.click(screen.getByRole("button", { name: "Remove question 2" }));

    expect(screen.queryByPlaceholderText("Question 2")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Question 1")).toBeInTheDocument();
  });
});
