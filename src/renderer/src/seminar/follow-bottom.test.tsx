// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useFollowBottom } from "./parts";
import { createSeminarState } from "./seminar-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  vi.unstubAllGlobals();
});

function mount() {
  let height = 2000;
  let top = 0;
  let resize = (): void => undefined;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    },
  );
  const host = document.createElement("div");
  root = createRoot(host);
  let state = createSeminarState();
  function Conversation() {
    const { viewportRef, onScroll, showLatest, jumpToLatest } = useFollowBottom(state);
    return (
      <>
        <div
          ref={(element) => {
            viewportRef.current = element;
            if (!element) return;
            Object.defineProperties(element, {
              clientHeight: { configurable: true, get: () => 400 },
              scrollHeight: { configurable: true, get: () => height },
              scrollTop: {
                configurable: true,
                get: () => top,
                set: (value: number) => {
                  top = Math.max(0, Math.min(value, height - 400));
                },
              },
            });
          }}
          onScroll={onScroll}
        >
          <div>
            <textarea />
            <button>Embedded control</button>
          </div>
        </div>
        {showLatest && <button onClick={jumpToLatest}>Jump to latest</button>}
      </>
    );
  }
  const render = () => act(() => root?.render(<Conversation />));
  render();
  const viewport = host.firstElementChild as HTMLDivElement;
  return {
    viewport,
    latest: () =>
      Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Jump to latest"),
    scroll(value: number) {
      act(() => {
        viewport.scrollTop = value;
        viewport.dispatchEvent(new Event("scroll"));
      });
    },
    grow() {
      height += 80;
      act(() => resize());
    },
    token() {
      height += 20;
      state = { ...state, items: [...state.items] };
      render();
    },
    disconnect,
  };
}

it("keeps a small upward scroll stationary through tokens and late layout growth", () => {
  const view = mount();
  expect(view.viewport.scrollTop).toBe(1600);
  view.scroll(1592);
  view.token();
  view.grow();
  expect(view.viewport.scrollTop).toBe(1592);
  expect(view.latest()).toBeDefined();
});

it("releases before an upward wheel's scroll event, even if layout grows first", () => {
  const view = mount();
  act(() => view.viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -1 })));
  // A queued programmatic scroll event must not undo the input intent.
  view.scroll(1600);
  view.grow();
  expect(view.viewport.scrollTop).toBe(1600);
  expect(view.latest()).toBeDefined();
});

it.each(["ArrowUp", "PageUp", "Home", " "])("releases on %s before late layout", (key) => {
  const view = mount();
  act(() =>
    view.viewport.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: key === " " })),
  );
  view.grow();
  expect(view.viewport.scrollTop).toBe(1600);
  expect(view.latest()).toBeDefined();
});

it("shows the control immediately and releases even a fractional upward scroll", () => {
  const view = mount();
  view.scroll(1599.5);
  expect(view.latest()).toBeDefined();
  view.grow();
  expect(view.viewport.scrollTop).toBe(1599.5);
});

it("reattaches on manually reaching the rounded bottom, then follows new growth", () => {
  const view = mount();
  view.scroll(1592);
  view.token();
  view.scroll(1619.5);
  expect(view.latest()).toBeUndefined();
  view.grow();
  expect(view.viewport.scrollTop).toBe(1700);
});

it("jumping to latest reattaches through subsequent tokens and layout", () => {
  const view = mount();
  view.scroll(1592);
  view.grow();
  act(() => view.latest()?.click());
  expect(view.viewport.scrollTop).toBe(1680);
  expect(view.latest()).toBeUndefined();
  view.token();
  view.grow();
  expect(view.viewport.scrollTop).toBe(1780);
});

it("continues following layout growth and its queued scroll events while pinned", () => {
  const view = mount();
  view.token();
  view.scroll(1620);
  view.grow();
  view.scroll(1700);
  view.token();
  expect(view.viewport.scrollTop).toBe(1720);
  expect(view.latest()).toBeUndefined();
});

it("does not mistake editing or control keys, zoom, or downward input for scrolling up", () => {
  const view = mount();
  act(() => {
    for (const element of view.viewport.querySelectorAll("textarea, button")) {
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    }
    view.viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, ctrlKey: true }));
    view.viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    view.viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  });
  view.grow();
  expect(view.viewport.scrollTop).toBe(1680);
  expect(view.latest()).toBeUndefined();
});

it("disconnects the observer and input listeners on unmount", () => {
  const view = mount();
  const remove = vi.spyOn(view.viewport, "removeEventListener");
  act(() => root?.unmount());
  root = undefined;
  expect(view.disconnect).toHaveBeenCalledOnce();
  expect(remove.mock.calls.map(([type]) => type)).toEqual(
    expect.arrayContaining(["wheel", "keydown"]),
  );
});
