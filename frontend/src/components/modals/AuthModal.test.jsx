import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthModal } from "./AuthModal";

// #435 — AuthModal talks to Supabase directly (no onLogin/onSignup props
// to intercept), so the client module itself is mocked here rather than
// hitting a real network call. Each auth method is a vi.fn() the
// individual tests configure per case.
vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import { supabase } from "../../lib/supabaseClient";

describe("AuthModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when mode is null", () => {
    const { container } = render(<AuthModal mode={null} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens on the login tab by default and shows validation errors on empty submit", async () => {
    render(<AuthModal mode="login" onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Log in" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("logs in and calls onSubmit with the session on success", async () => {
    const session = { access_token: "abc" };
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
    const onSubmit = vi.fn();

    render(<AuthModal mode="login" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(session));
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "password123",
    });
  });

  it("shows the Supabase error message when login fails", async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });
    const onSubmit = vi.fn();

    render(<AuthModal mode="login" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "learner@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Invalid login credentials")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a name on the signup tab and submits role + name on success", async () => {
    const session = { access_token: "xyz" };
    supabase.auth.signUp.mockResolvedValue({ data: { session }, error: null });
    const onSubmit = vi.fn();

    render(<AuthModal mode="signup" onClose={vi.fn()} onSubmit={onSubmit} />);

    // Empty name should block submit.
    fireEvent.click(screen.getByRole("button", { name: "Create free account" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(supabase.auth.signUp).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Lee" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Trainer" }));
    fireEvent.click(screen.getByRole("button", { name: "Create free account" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(session));
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "jordan@example.com",
      password: "password123",
      options: { data: { name: "Jordan Lee", role: "trainer" } },
    });
  });

  it("shows a confirm-email message instead of calling onSubmit when signup returns no session", async () => {
    supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const onSubmit = vi.fn();

    render(<AuthModal mode="signup" onClose={vi.fn()} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Lee" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create free account" }));

    expect(await screen.findByText(/Check your email to confirm your account/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("switches to the forgot-password tab, hides the password field, and sends a reset link", async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    render(<AuthModal mode="login" onClose={vi.fn()} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "learner@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Check your email for a link to reset your password."),
    ).toBeInTheDocument();
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "learner@example.com",
      expect.objectContaining({ redirectTo: expect.any(String) }),
    );
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<AuthModal mode="login" onClose={onClose} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });
});
