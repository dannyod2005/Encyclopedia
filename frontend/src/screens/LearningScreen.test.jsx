import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { LearningScreen } from "./LearningScreen";

// #435 — covers two of the riskiest flows in this screen: the #205 quiz
// completion gate (Mark Complete can't be clicked until a module's quiz
// is taken) and the #239 retake flow, plus the #426 unenroll confirm
// dialog. Uses a single-module course so "last module" and "course
// complete" branches stay out of the way of what's under test.

function baseProps(overrides = {}) {
  return {
    course: {
      id: "c1",
      title: "Networking Basics",
      modules: [{ id: "m1", title: "Intro to Networking", videoUrl: null }],
    },
    enrollment: { id: "e1", progress: 0, rating: null, reviewText: null },
    onSaveProgress: vi.fn().mockResolvedValue(undefined),
    onSubmitRating: vi.fn().mockResolvedValue(undefined),
    onLogModuleView: vi.fn().mockResolvedValue(undefined),
    onFetchQuiz: vi.fn().mockResolvedValue([]),
    onSubmitQuiz: vi.fn(),
    onFetchQuizResults: vi.fn().mockResolvedValue([]),
    onFetchNote: vi.fn().mockResolvedValue({ content: "", updatedAt: null }),
    onSaveNote: vi.fn().mockResolvedValue({ updatedAt: new Date().toISOString() }),
    onFetchPosts: vi.fn().mockResolvedValue([]),
    onCreatePost: vi.fn(),
    onEditPost: vi.fn(),
    currentUserId: "u1",
    onBack: vi.fn(),
    onUnenrol: vi.fn(),
    ...overrides,
  };
}

const mcqQuestion = {
  id: "q1",
  type: "multiple_choice",
  question: "What does IP stand for?",
  options: [
    { id: "o1", optionText: "Internet Protocol" },
    { id: "o2", optionText: "Internal Process" },
  ],
};

async function openQuizTab() {
  fireEvent.click(await screen.findByRole("tab", { name: "quiz" }));
}

describe("LearningScreen — quiz completion gate (#205)", () => {
  it("blocks Mark Complete until the module's quiz is taken, then unlocks after submitting", async () => {
    const onFetchQuizResults = vi
      .fn()
      .mockResolvedValueOnce([{ moduleId: "m1", hasQuiz: true, taken: false, score: null, total: 1 }])
      .mockResolvedValueOnce([{ moduleId: "m1", hasQuiz: true, taken: true, score: 1, total: 1 }]);
    const onSubmitQuiz = vi.fn().mockResolvedValue({
      score: 1,
      total: 1,
      alreadySubmitted: false,
      results: [{ questionId: "q1", isCorrect: true, correctOptionId: "o1" }],
    });

    render(
      <LearningScreen
        {...baseProps({
          onFetchQuiz: vi.fn().mockResolvedValue([mcqQuestion]),
          onFetchQuizResults,
          onSubmitQuiz,
        })}
      />,
    );

    const markCompleteBtn = await screen.findByRole("button", { name: /Complete the quiz to continue/ });
    expect(markCompleteBtn).toBeDisabled();

    await openQuizTab();
    fireEvent.click(await screen.findByText("Internet Protocol"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Mark complete & finish/ })).not.toBeDisabled(),
    );
    expect(onSubmitQuiz).toHaveBeenCalledWith("m1", [{ questionId: "q1", optionId: "o1" }]);
  });

  it("does not submit if a question is left unanswered", async () => {
    const onSubmitQuiz = vi.fn();
    render(
      <LearningScreen
        {...baseProps({
          onFetchQuiz: vi.fn().mockResolvedValue([mcqQuestion]),
          onFetchQuizResults: vi
            .fn()
            .mockResolvedValue([{ moduleId: "m1", hasQuiz: true, taken: false, score: null, total: 1 }]),
          onSubmitQuiz,
        })}
      />,
    );

    await openQuizTab();
    // #435 — the question renders as "1. {question}" split across
    // sibling text nodes ("1", ". ", the question itself), so an exact
    // full-string match (RTL's default) would require including the
    // "1. " prefix too. A substring regex avoids coupling this
    // assertion to the question's numbering.
    await screen.findByText(/What does IP stand for\?/);
    fireEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    expect(await screen.findByText("Answer every question before submitting.")).toBeInTheDocument();
    expect(onSubmitQuiz).not.toHaveBeenCalled();
  });
});

describe("LearningScreen — quiz retake (#239)", () => {
  it("shows a read-only summary for an already-taken quiz, with a Retake quiz option", async () => {
    render(
      <LearningScreen
        {...baseProps({
          onFetchQuiz: vi.fn().mockResolvedValue([mcqQuestion]),
          onFetchQuizResults: vi
            .fn()
            .mockResolvedValue([{ moduleId: "m1", hasQuiz: true, taken: true, score: 1, total: 2 }]),
        })}
      />,
    );

    await openQuizTab();

    expect(await screen.findByText(/You've already taken this quiz — scored 1\/2\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit answers" })).not.toBeInTheDocument();
  });

  it("re-presents a blank, answerable form after clicking Retake quiz", async () => {
    render(
      <LearningScreen
        {...baseProps({
          onFetchQuiz: vi.fn().mockResolvedValue([mcqQuestion]),
          onFetchQuizResults: vi
            .fn()
            .mockResolvedValue([{ moduleId: "m1", hasQuiz: true, taken: true, score: 1, total: 2 }]),
        })}
      />,
    );

    await openQuizTab();
    fireEvent.click(await screen.findByRole("button", { name: "Retake quiz" }));

    expect(await screen.findByRole("button", { name: "Submit answers" })).toBeInTheDocument();
    expect(screen.queryByText(/You've already taken this quiz/)).not.toBeInTheDocument();
  });
});

describe("LearningScreen — unenroll confirm (#426)", () => {
  it("confirming unenroll calls onUnenrol with the enrollment id, then onBack", async () => {
    const onUnenrol = vi.fn().mockResolvedValue(undefined);
    const onBack = vi.fn();

    render(<LearningScreen {...baseProps({ onUnenrol, onBack })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Unenroll" }));

    expect(
      await screen.findByText(/Your quiz answers, grades and notes are kept/),
    ).toBeInTheDocument();

    // Two "Unenroll" controls exist once the dialog is open (the trigger
    // behind it, plus the dialog's own confirm button) — scope to the dialog.
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unenroll" }));

    await waitFor(() => expect(onUnenrol).toHaveBeenCalledWith("e1"));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it("cancelling the confirm dialog does not call onUnenrol", async () => {
    const onUnenrol = vi.fn();
    render(<LearningScreen {...baseProps({ onUnenrol })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Unenroll" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onUnenrol).not.toHaveBeenCalled();
  });
});
