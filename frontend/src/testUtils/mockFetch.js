import { vi } from "vitest";

// #439 — App.jsx's ~90 handlers all call the real global `fetch` directly
// against `${import.meta.env.VITE_API_URL}/...` rather than going through
// a shared API client, so there's no single seam to mock. This gives
// individual tests a concise way to say "when the app requests some path,
// respond with this" instead of each test hand-rolling its own
// `vi.fn()` URL-matching logic.
//
// Routes are matched by substring on the request path (not the full
// URL), so tests don't need to know or care what VITE_API_URL resolves
// to in the test environment — `path: "/courses"` matches
// "http://localhost:3001/courses" just as well as "undefined/courses".
// Match order is registration order, first match wins — put more
// specific paths (e.g. "/enrollments/e1/retake") before more general
// ones (e.g. "/enrollments") if a test needs both.
//
// Usage:
//   const fetchMock = createFetchMock([
//     { method: "GET", path: "/courses", json: [] },
//     { method: "POST", path: "/enrollments/e1/retake", json: {} },
//   ]);
//   vi.stubGlobal("fetch", fetchMock);
//   ...
//   expect(fetchMock.calls).toContainEqual(
//     expect.objectContaining({ method: "POST", path: expect.stringContaining("/retake") }),
//   );
export function createFetchMock(routes = []) {
  const handlers = [...routes];
  const calls = [];

  const fetchMock = vi.fn((url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const headers = options.headers || {};
    calls.push({ url: String(url), method, headers, body: options.body });

    const handler = handlers.find(
      (h) => (h.method || "GET").toUpperCase() === method && String(url).includes(h.path),
    );

    if (!handler) {
      return Promise.reject(
        new Error(`mockFetch: no route registered for ${method} ${url}`),
      );
    }

    const status = handler.status ?? 200;
    const ok = handler.ok ?? (status >= 200 && status < 300);
    const body = typeof handler.json === "function" ? handler.json({ url, options }) : handler.json;

    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
    });
  });

  fetchMock.calls = calls;
  fetchMock.addRoute = (route) => handlers.push(route);

  return fetchMock;
}
