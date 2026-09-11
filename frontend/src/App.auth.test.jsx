import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EncyclopediaPrototype } from "./App";
import { createFetchMock } from "./testUtils/mockFetch";

// #439 — App.jsx's own auth bootstrap: which requests fire on mount
// depends entirely on what useAuth() reports (loggedIn/session), so
// useAuth is mocked directly here rather than driving the real
// AuthProvider (already covered on its own in AuthContext.test.jsx from
// #435) — this keeps the two concerns separate.
vi.mock("./context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./context/AuthContext";

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EncyclopediaPrototype />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App auth bootstrap", () => {
  it("logged-out: fetches the public course list, but never touches an authenticated endpoint", async () => {
    useAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });
    const fetchMock = createFetchMock([
      { method: "GET", path: "/courses", json: [] },
      { method: "GET", path: "/learning-paths", json: [] },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/");

    await waitFor(() => expect(fetchMock.calls.some((c) => c.url.includes("/courses"))).toBe(true));

    // #439 — none of these ever fire without a session; asserting they
    // weren't called catches a future bug where one of these effects'
    // loggedIn/session guard gets accidentally dropped.
    expect(fetchMock.calls.some((c) => c.url.includes("/enrollments"))).toBe(false);
    expect(fetchMock.calls.some((c) => c.url.includes("/profiles/me"))).toBe(false);
    expect(fetchMock.calls.some((c) => c.url.includes("/notifications"))).toBe(false);
    expect(fetchMock.calls.some((c) => c.url.includes("/bookmarks"))).toBe(false);
  });

  it("logged-in: fetches enrollments and the profile with a Bearer auth header", async () => {
    useAuth.mockReturnValue({
      user: { id: "u1", email: "learner@example.com", user_metadata: { role: "learner" } },
      session: { access_token: "tok123" },
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });
    const fetchMock = createFetchMock([
      { method: "GET", path: "/courses", json: [] },
      { method: "GET", path: "/learning-paths", json: [] },
      { method: "GET", path: "/enrollments", json: [] },
      { method: "GET", path: "/learning-path-enrollments", json: [] },
      { method: "GET", path: "/badges/me", json: [] },
      { method: "GET", path: "/notifications", json: [] },
      { method: "GET", path: "/bookmarks", json: [] },
      {
        method: "GET",
        path: "/activity/summary",
        json: { streak: 0, pointsThisWeek: 0, dailyGoalPoints: 1500, goalHitDays: 0, week: [] },
      },
      { method: "GET", path: "/profiles/me", json: { goal: "Technical", role: "learner", leaderboardOptIn: false } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderApp("/dashboard");

    const enrollmentsCall = await waitFor(() => {
      const call = fetchMock.calls.find((c) => c.url.endsWith("/enrollments"));
      expect(call).toBeTruthy();
      return call;
    });
    expect(enrollmentsCall.headers.Authorization).toBe("Bearer tok123");

    const profileCall = await waitFor(() => {
      const call = fetchMock.calls.find((c) => c.url.includes("/profiles/me"));
      expect(call).toBeTruthy();
      return call;
    });
    expect(profileCall.headers.Authorization).toBe("Bearer tok123");
  });
});
