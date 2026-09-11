import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResetPasswordModal } from "./ResetPasswordModal";

describe("ResetPasswordModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<ResetPasswordModal open={false} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a validation error and does not submit for a too-short password", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordModal open onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a mismatch error when the passwords don't match, and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<ResetPasswordModal open onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password124" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with the new password when valid and matching", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ResetPasswordModal open onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("password123"));
  });

  it("surfaces the thrown error message when onSubmit rejects", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Session expired, please try again."));
    render(<ResetPasswordModal open onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("Session expired, please try again.")).toBeInTheDocument();
  });

  it("calls onClose when Not now is clicked", () => {
    const onClose = vi.fn();
    render(<ResetPasswordModal open onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(onClose).toHaveBeenCalled();
  });
});
