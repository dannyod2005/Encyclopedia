import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GoalOnboardingModal } from "./GoalOnboardingModal";

describe("GoalOnboardingModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<GoalOnboardingModal open={false} onSelect={vi.fn()} onSkip={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onSelect with the chosen option's value", async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(<GoalOnboardingModal open onSelect={onSelect} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Business/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("Business"));
  });

  it("calls onSkip from both the X and the Skip for now link", () => {
    const onSkip = vi.fn();
    render(<GoalOnboardingModal open onSelect={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("stays open and re-enables selection if onSelect rejects", async () => {
    const onSelect = vi.fn().mockRejectedValue(new Error("network error"));
    render(<GoalOnboardingModal open onSelect={onSelect} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Technical/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("Technical"));
    // Submitting flips back to false on failure, so the option is
    // clickable again rather than stuck disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: /Technical/ })).not.toBeDisabled());
  });
});
