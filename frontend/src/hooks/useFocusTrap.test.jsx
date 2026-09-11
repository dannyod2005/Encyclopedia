import { describe, it, expect, beforeAll } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useFocusTrap } from "./useFocusTrap";

// #435 — jsdom doesn't run a layout engine, so every element's
// `offsetParent` is always null by default — which would make the
// hook's own "is this element actually visible" filter (offsetParent
// !== null) exclude every element and always take the
// no-focusable-elements branch. Faking a non-null offsetParent here is
// the standard jsdom workaround for testing anything that depends on it,
// scoped to this file only (each Vitest test file gets its own jsdom
// instance, so this doesn't leak into other test files).
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    get() {
      return document.body;
    },
    configurable: true,
  });
});

function Harness() {
  const [active, setActive] = useState(false);
  const dialogRef = useFocusTrap(active);

  return (
    <div>
      <button onClick={() => setActive(true)}>Open</button>
      {active && (
        <div ref={dialogRef} tabIndex={-1} role="dialog">
          <button>First</button>
          <button>Second</button>
          <button>Last</button>
        </div>
      )}
      <button onClick={() => setActive(false)}>Close</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves focus to the first focusable element inside the container when activated", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open" });
    act(() => trigger.focus());
    fireEvent.click(trigger);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const last = screen.getByRole("button", { name: "Last" });
    act(() => last.focus());

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const first = screen.getByRole("button", { name: "First" });
    act(() => first.focus());

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
  });

  it("returns focus to whatever was focused before opening, once deactivated", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Open" });
    act(() => trigger.focus());
    fireEvent.click(trigger);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(document.activeElement).toBe(trigger);
  });
});
