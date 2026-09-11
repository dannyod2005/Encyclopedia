import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

// #435 — AuthContext talks to Supabase directly on mount (getSession +
// onAuthStateChange), so the client module is mocked here the same way
// AuthModal.test.jsx does it.
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
  },
}));

import { supabase } from "../lib/supabaseClient";

function mockAuthStateChange() {
  let registeredCallback = null;
  const unsubscribe = vi.fn();
  supabase.auth.onAuthStateChange.mockImplementation((cb) => {
    registeredCallback = cb;
    return { data: { subscription: { unsubscribe } } };
  });
  return {
    fire: (event, session) => registeredCallback(event, session),
    unsubscribe,
  };
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts loading, then resolves to no session/user when there is none", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuthStateChange();

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("picks up the existing session and user on mount", async () => {
    const session = { user: { id: "u1", email: "learner@example.com" } };
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    mockAuthStateChange();

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(session);
    expect(result.current.user).toBe(session.user);
  });

  it("updates session/user when an auth state change event fires", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { fire } = mockAuthStateChange();

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newSession = { user: { id: "u2", email: "new@example.com" } };
    act(() => fire("SIGNED_IN", newSession));

    expect(result.current.session).toBe(newSession);
    expect(result.current.user).toBe(newSession.user);
  });

  it("sets passwordRecovery on a PASSWORD_RECOVERY event, and clearPasswordRecovery resets it", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { fire } = mockAuthStateChange();

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.passwordRecovery).toBe(false);

    const recoverySession = { user: { id: "u3" } };
    act(() => fire("PASSWORD_RECOVERY", recoverySession));

    expect(result.current.passwordRecovery).toBe(true);

    act(() => result.current.clearPasswordRecovery());

    expect(result.current.passwordRecovery).toBe(false);
  });

  it("unsubscribes from auth state changes on unmount", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { unsubscribe } = mockAuthStateChange();

    const { unmount } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
