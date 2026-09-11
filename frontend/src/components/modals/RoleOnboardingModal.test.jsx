import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RoleOnboardingModal } from "./RoleOnboardingModal";

describe("RoleOnboardingModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<RoleOnboardingModal open={false} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("has no skip option — only the two role choices", () => {
    render(<RoleOnboardingModal open onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Learner/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trainer/ })).toBeInTheDocument();
    expect(screen.queryByText(/Skip/)).not.toBeInTheDocument();
  });

  it("calls onSelect with the chosen role", async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(<RoleOnboardingModal open onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Trainer/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("trainer"));
  });

  it("re-enables selection if onSelect rejects", async () => {
    const onSelect = vi.fn().mockRejectedValue(new Error("network error"));
    render(<RoleOnboardingModal open onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Learner/ }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("learner"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Learner/ })).not.toBeDisabled());
  });
});
