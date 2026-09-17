import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsScreen } from "./SettingsScreen";

// #498 — covers the two write-heavy forms this screen owns: name change
// (#255, the field flagged as having no length limit at all before the
// #496 MaxLength audit) and password change (#255, sharing
// ResetPasswordModal's 8-char-minimum + confirm-match validation). Also
// covers the daily-goal preset picker and leaderboard opt-in switch,
// both simple prop-driven toggles.

function baseProps(overrides = {}) {
  return {
    user: { email: "learner@example.com", user_metadata: { name: "Jordan Lee" } },
    onUpdateName: vi.fn().mockResolvedValue(undefined),
    onChangePassword: vi.fn().mockResolvedValue(undefined),
    activitySummary: { dailyGoalPoints: 1500 },
    onUpdateDailyGoal: vi.fn().mockResolvedValue(undefined),
    leaderboardOptIn: false,
    onUpdateLeaderboardOptIn: vi.fn().mockResolvedValue(undefined),
    onOpenLeaderboard: vi.fn(),
    ...overrides,
  };
}

describe("SettingsScreen — name", () => {
  it("prefills the name field from the user's display name", () => {
    render(<SettingsScreen {...baseProps()} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Jordan Lee");
  });

  it("saves the trimmed name and shows a confirmation", async () => {
    const onUpdateName = vi.fn().mockResolvedValue(undefined);
    render(<SettingsScreen {...baseProps({ onUpdateName })} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  New Name  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(onUpdateName).toHaveBeenCalledWith("New Name"));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows an error and does not clear the field when the save fails", async () => {
    const onUpdateName = vi.fn().mockRejectedValue(new Error("Name is already taken."));
    render(<SettingsScreen {...baseProps({ onUpdateName })} />);

    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByText("Name is already taken.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Jordan Lee");
  });

  it("disables the save button when the name is blank", () => {
    render(<SettingsScreen {...baseProps({ user: { email: "a@b.com", user_metadata: {} } })} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
  });
});

describe("SettingsScreen — password", () => {
  it("shows a validation error for a too-short password on submit", async () => {
    render(<SettingsScreen {...baseProps()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("shows a mismatch error when confirm does not match", async () => {
    render(<SettingsScreen {...baseProps()} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different123" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
  });

  it("submits and clears the fields on a valid, matching password", async () => {
    const onChangePassword = vi.fn().mockResolvedValue(undefined);
    render(<SettingsScreen {...baseProps({ onChangePassword })} />);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(onChangePassword).toHaveBeenCalledWith("password123"));
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("");
  });

  it("toggles password visibility on both fields together", () => {
    render(<SettingsScreen {...baseProps()} />);

    const pwInput = screen.getByLabelText("New password");
    expect(pwInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(pwInput).toHaveAttribute("type", "text");
  });
});

describe("SettingsScreen — preferences", () => {
  it("marks the current daily goal preset as pressed", () => {
    render(<SettingsScreen {...baseProps({ activitySummary: { dailyGoalPoints: 1500 } })} />);
    expect(screen.getByRole("button", { name: "1500 pts" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1000 pts" })).toHaveAttribute("aria-pressed", "false");
  });

  it("picking a new daily goal preset calls onUpdateDailyGoal", async () => {
    const onUpdateDailyGoal = vi.fn().mockResolvedValue(undefined);
    render(<SettingsScreen {...baseProps({ onUpdateDailyGoal })} />);

    fireEvent.click(screen.getByRole("button", { name: "3000 pts" }));

    await waitFor(() => expect(onUpdateDailyGoal).toHaveBeenCalledWith(3000));
  });

  it("re-clicking the already-selected preset does not call onUpdateDailyGoal again", () => {
    const onUpdateDailyGoal = vi.fn();
    render(<SettingsScreen {...baseProps({ onUpdateDailyGoal, activitySummary: { dailyGoalPoints: 1500 } })} />);

    fireEvent.click(screen.getByRole("button", { name: "1500 pts" }));

    expect(onUpdateDailyGoal).not.toHaveBeenCalled();
  });

  it("toggles the leaderboard opt-in switch and reflects aria-checked", async () => {
    const onUpdateLeaderboardOptIn = vi.fn().mockResolvedValue(undefined);
    render(<SettingsScreen {...baseProps({ onUpdateLeaderboardOptIn, leaderboardOptIn: false })} />);

    const toggle = screen.getByRole("switch", { name: "Show me on the leaderboard" });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => expect(onUpdateLeaderboardOptIn).toHaveBeenCalledWith(true));
  });

  it("only shows the 'View leaderboard' link when opted in", () => {
    const { rerender } = render(<SettingsScreen {...baseProps({ leaderboardOptIn: false })} />);
    expect(screen.queryByText("View leaderboard →")).not.toBeInTheDocument();

    rerender(<SettingsScreen {...baseProps({ leaderboardOptIn: true })} />);
    expect(screen.getByText("View leaderboard →")).toBeInTheDocument();
  });
});
