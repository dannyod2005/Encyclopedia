import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DashboardScreen } from "./DashboardScreen";

// #435/#448 — covers the #300/#301 Retake confirm flow (the counterpart
// to LearningScreen's unenroll confirm, tested in LearningScreen.test.jsx).
// Only a completed enrollment is included — enough to reach the Retake
// button without needing to also satisfy the in-progress/not-started
// sections' course.modules shape.

function baseProps(overrides = {}) {
  return {
    enrolled: [
      { id: "e1", courseId: "c1", status: "complete", progress: 1, lastAccessed: "2026-09-01" },
    ],
    courses: [{ id: "c1", title: "Networking Basics", modules: [] }],
    onToggleBookmark: vi.fn(),
    onOpenCourse: vi.fn(),
    onStartLearning: vi.fn(),
    onViewCertificate: vi.fn().mockResolvedValue(undefined),
    onRetake: vi.fn().mockResolvedValue(undefined),
    user: { email: "learner@example.com", user_metadata: {} },
    onRetry: vi.fn(),
    onPrevWeek: vi.fn(),
    onNextWeek: vi.fn(),
    onOpenLeaderboard: vi.fn(),
    onGo: vi.fn(),
    ...overrides,
  };
}

describe("DashboardScreen — retake confirm (#300/#301)", () => {
  it("confirming retake calls onRetake with the enrollment id", async () => {
    const onRetake = vi.fn().mockResolvedValue(undefined);
    render(<DashboardScreen {...baseProps({ onRetake })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Networking Basics/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retake" }));

    await waitFor(() => expect(onRetake).toHaveBeenCalledWith("e1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an error and keeps the dialog open when onRetake rejects", async () => {
    const onRetake = vi.fn().mockRejectedValue(new Error("Server is busy, try again."));
    render(<DashboardScreen {...baseProps({ onRetake })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retake" }));

    expect(await screen.findByText("Server is busy, try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelling the dialog does not call onRetake", async () => {
    const onRetake = vi.fn();
    render(<DashboardScreen {...baseProps({ onRetake })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onRetake).not.toHaveBeenCalled();
  });
});
