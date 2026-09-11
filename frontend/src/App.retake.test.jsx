import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EncyclopediaPrototype } from "./App";
import { createFetchMock } from "./testUtils/mockFetch";

// #439 — exercises the real retakeCourse() handler end to end (click ->
// real fetch call -> real state update from the response), rather than
// DashboardScreen.retake.test.jsx's approach of passing a mocked
// onRetake prop directly. This is what actually catches a wrong
// endpoint, method, payload, or missing auth header.
vi.mock("./context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./context/AuthContext";

function baseRoutes(overrides = []) {
  return [
    { method: "GET", path: "/courses", json: [] },
    { method: "GET", path: "/learning-paths", json: [] },
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
    ...overrides,
  ];
}

const completedEnrollment = {
  id: "e1",
  courseId: "c1",
  status: "complete",
  progress: "1",
  lastAccessed: null,
  course: { id: "c1", title: "Networking Basics", modules: [] },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — retake handler (#300/#301)", () => {
  it("POSTs to /enrollments/:id/retake with the auth header, then refreshes enrollments", async () => {
    useAuth.mockReturnValue({
      user: { id: "u1", email: "learner@example.com", user_metadata: { role: "learner" } },
      session: { access_token: "tok123" },
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });

    const fetchMock = createFetchMock([
      // #439 — more specific route registered first: mockFetch matches
      // in registration order, and "/enrollments" alone would otherwise
      // also match the retake URL.
      { method: "POST", path: "/enrollments/e1/retake", json: {} },
      { method: "GET", path: "/enrollments", json: [completedEnrollment] },
      ...baseRoutes(),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <EncyclopediaPrototype />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retake" }));

    const retakeCall = await waitFor(() => {
      const call = fetchMock.calls.find((c) => c.method === "POST" && c.url.includes("/retake"));
      expect(call).toBeTruthy();
      return call;
    });
    expect(retakeCall.url).toContain("/enrollments/e1/retake");
    expect(retakeCall.headers.Authorization).toBe("Bearer tok123");

    // #300 — retakeCourse refetches enrollments afterward to pick up the
    // reset state; that's a second GET /enrollments call beyond the
    // initial mount fetch.
    await waitFor(() => {
      const getEnrollmentsCalls = fetchMock.calls.filter(
        (c) => c.method === "GET" && c.url.endsWith("/enrollments"),
      );
      expect(getEnrollmentsCalls.length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("surfaces the server's error message and leaves the dialog open on failure", async () => {
    useAuth.mockReturnValue({
      user: { id: "u1", email: "learner@example.com", user_metadata: { role: "learner" } },
      session: { access_token: "tok123" },
      loading: false,
      passwordRecovery: false,
      clearPasswordRecovery: vi.fn(),
    });

    const fetchMock = createFetchMock([
      {
        method: "POST",
        path: "/enrollments/e1/retake",
        status: 400,
        ok: false,
        json: { message: "Course no longer exists." },
      },
      { method: "GET", path: "/enrollments", json: [completedEnrollment] },
      ...baseRoutes(),
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <EncyclopediaPrototype />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Retake" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Retake" }));

    expect(await screen.findByText("Course no longer exists.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
