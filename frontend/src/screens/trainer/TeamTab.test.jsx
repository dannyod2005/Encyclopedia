import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TeamTab } from "./TeamTab";

// #498 — covers the provider create/join/leave flow (#139/#301), the
// biggest gap in this screen's coverage: whether a trainer sees the
// create/join forms or the member-detail card depends entirely on what
// onFetchProvider resolves to, and the leave-provider confirm modal is
// portaled (see its own #301 comment) so it needs to be found outside
// the render container.

function baseProps(overrides = {}) {
  return {
    onFetchProvider: vi.fn().mockResolvedValue(null),
    onCreateProvider: vi.fn().mockResolvedValue(undefined),
    onJoinProvider: vi.fn().mockResolvedValue(undefined),
    onRegenerateInviteCode: vi.fn().mockResolvedValue({ inviteCode: "NEWCODE1" }),
    onLeaveProvider: vi.fn().mockResolvedValue(undefined),
    currentUserId: "user-1",
    ...overrides,
  };
}

const memberProvider = {
  id: "provider-1",
  name: "Acme Training",
  inviteCode: "ABCD1234",
  ownerId: "owner-1",
  members: [
    { id: "owner-1", name: "Owner Person", isOwner: true },
    { id: "user-1", name: "Member Person", isOwner: false },
  ],
};

describe("TeamTab — not a member", () => {
  it("shows the create/join forms once loading resolves to null", async () => {
    render(<TeamTab {...baseProps()} />);
    expect(await screen.findByText("Create a provider")).toBeInTheDocument();
    expect(screen.getByText("Join a provider")).toBeInTheDocument();
  });

  it("creates a provider and refetches", async () => {
    const onCreateProvider = vi.fn().mockResolvedValue(undefined);
    const onFetchProvider = vi
      .fn()
      .mockResolvedValueOnce(null) // initial load
      .mockResolvedValueOnce(memberProvider); // refetch after create
    render(<TeamTab {...baseProps({ onCreateProvider, onFetchProvider })} />);

    fireEvent.change(await screen.findByPlaceholderText("e.g. Encyclopedia Business School"), {
      target: { value: "Acme Training" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create provider" }));

    await waitFor(() => expect(onCreateProvider).toHaveBeenCalledWith("Acme Training"));
    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
  });

  it("shows an error and stays on the form when create fails", async () => {
    const onCreateProvider = vi.fn().mockRejectedValue(new Error("Name already in use."));
    render(<TeamTab {...baseProps({ onCreateProvider })} />);

    fireEvent.change(await screen.findByPlaceholderText("e.g. Encyclopedia Business School"), {
      target: { value: "Acme Training" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create provider" }));

    expect(await screen.findByText("Name already in use.")).toBeInTheDocument();
  });

  it("disables the create button while the name field is empty", async () => {
    render(<TeamTab {...baseProps()} />);
    expect(await screen.findByRole("button", { name: "Create provider" })).toBeDisabled();
  });

  it("joins a provider by invite code and refetches", async () => {
    const onJoinProvider = vi.fn().mockResolvedValue(undefined);
    const onFetchProvider = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(memberProvider);
    render(<TeamTab {...baseProps({ onJoinProvider, onFetchProvider })} />);

    fireEvent.change(await screen.findByPlaceholderText("e.g. K7M9QRXT"), {
      target: { value: "ABCD1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join provider" }));

    await waitFor(() => expect(onJoinProvider).toHaveBeenCalledWith("ABCD1234"));
    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
  });

  it("shows an error when the invite code is invalid", async () => {
    const onJoinProvider = vi.fn().mockRejectedValue(new Error("Invalid invite code"));
    render(<TeamTab {...baseProps({ onJoinProvider })} />);

    fireEvent.change(await screen.findByPlaceholderText("e.g. K7M9QRXT"), {
      target: { value: "BADCODE1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join provider" }));

    expect(await screen.findByText("Invalid invite code")).toBeInTheDocument();
  });
});

describe("TeamTab — fetch failure", () => {
  it("shows a retry-capable error state instead of a raw error message", async () => {
    const onFetchProvider = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(memberProvider);
    render(<TeamTab {...baseProps({ onFetchProvider })} />);

    expect(await screen.findByText("Couldn't load your team — please try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
  });
});

describe("TeamTab — already a member", () => {
  it("shows the provider name, invite code, and member list", async () => {
    render(<TeamTab {...baseProps({ onFetchProvider: vi.fn().mockResolvedValue(memberProvider) })} />);

    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByText(/Owner Person/)).toBeInTheDocument();
    expect(screen.getByText(/Member Person \(you\)/)).toBeInTheDocument();
  });

  it("only shows the regenerate-invite-code control to the owner", async () => {
    const { rerender } = render(
      <TeamTab {...baseProps({ onFetchProvider: vi.fn().mockResolvedValue(memberProvider), currentUserId: "user-1" })} />,
    );
    expect(await screen.findByText("Acme Training")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate invite code" })).not.toBeInTheDocument();

    rerender(
      <TeamTab {...baseProps({ onFetchProvider: vi.fn().mockResolvedValue(memberProvider), currentUserId: "owner-1" })} />,
    );
    expect(await screen.findByRole("button", { name: "Regenerate invite code" })).toBeInTheDocument();
  });

  it("opens a confirm dialog on Leave and calls onLeaveProvider when confirmed", async () => {
    const onLeaveProvider = vi.fn().mockResolvedValue(undefined);
    render(
      <TeamTab
        {...baseProps({
          onFetchProvider: vi.fn().mockResolvedValue(memberProvider),
          onLeaveProvider,
        })}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /leave/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Acme Training/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Leave provider" }));

    await waitFor(() => expect(onLeaveProvider).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Leaving clears the provider, so this trainer falls back to the
    // create/join forms without a page reload.
    expect(await screen.findByText("Create a provider")).toBeInTheDocument();
  });

  it("cancelling the leave dialog does not call onLeaveProvider", async () => {
    const onLeaveProvider = vi.fn();
    render(
      <TeamTab
        {...baseProps({
          onFetchProvider: vi.fn().mockResolvedValue(memberProvider),
          onLeaveProvider,
        })}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /leave/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onLeaveProvider).not.toHaveBeenCalled();
  });

  it("shows an error and keeps the dialog open when leaving fails", async () => {
    const onLeaveProvider = vi.fn().mockRejectedValue(new Error("Server is busy, try again."));
    render(
      <TeamTab
        {...baseProps({
          onFetchProvider: vi.fn().mockResolvedValue(memberProvider),
          onLeaveProvider,
        })}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /leave/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave provider" }));

    expect(await screen.findByText("Server is busy, try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
