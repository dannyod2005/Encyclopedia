import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EncyclopediaPrototype } from "./App";
import { createFetchMock } from "./testUtils/mockFetch";

// #439 — routing/navigation handlers (onGo and friends) are all thin
// wrappers around react-router's navigate(), so the useful thing to test
// is that clicking through the real sidebar actually lands on the right
// route — asserted here via document.title (set by App.jsx's own
// screen-keyed title effect) and the clicked nav item's aria-current,
// rather than asserting on react-router internals directly.
vi.mock("./context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./context/AuthContext";

function loggedInRoutes() {
  return [
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
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — sidebar navigation", () => {
  it("clicking Catalogue in the sidebar navigates from Dashboard to Catalogue", async () => {
    useAuth.mockReturnValue({
      user: { id: "u1", email: "learner@example.com", user_metadata: { role: "learner" } },
      session: { access_token: "tok123" },
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });
    vi.stubGlobal("fetch", createFetchMock(loggedInRoutes()));

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <EncyclopediaPrototype />
      </MemoryRouter>,
    );

    await waitFor(() => expect(document.title).toBe("My learning — Encyclopedia"));

    fireEvent.click(await screen.findByRole("button", { name: "Catalogue" }));

    await waitFor(() => expect(document.title).toBe("Catalogue — Encyclopedia"));
    expect(screen.getByRole("button", { name: "Catalogue" })).toHaveAttribute("aria-current", "page");
  });

  it("logged-out Home's onAuth opens the auth modal on the login tab", async () => {
    useAuth.mockReturnValue({
      user: null,
      session: null,
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      createFetchMock([
        { method: "GET", path: "/courses", json: [] },
        { method: "GET", path: "/learning-paths", json: [] },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <EncyclopediaPrototype />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Log in" })).toHaveAttribute("aria-selected", "true");
  });
});
