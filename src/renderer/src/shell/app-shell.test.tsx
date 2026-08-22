// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PraxeumApi } from "../../../shared/ipc";
import type { UpdateStatus } from "../../../shared/update";
import { AppShell } from "./app-shell";
import { forgetDismissedUpdateNotices } from "./update-notice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as typeof globalThis & { React: typeof React }).React = React;

beforeAll(() => {
  /* jsdom has the element but not its modal methods. The shape the component
     relies on — `open` attribute, and a `close` event on close — is enough. */
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    act(() => root?.unmount());
    root = null;
  }
  forgetDismissedUpdateNotices();
});

function install(status: UpdateStatus): {
  checkForUpdate: ReturnType<typeof vi.fn>;
  downloadUpdate: ReturnType<typeof vi.fn>;
  handoffUpdate: ReturnType<typeof vi.fn>;
  openUpdateReleasePage: ReturnType<typeof vi.fn>;
} {
  const api = {
    checkForUpdate: vi.fn(async () => ({ phase: "current" }) as const),
    downloadUpdate: vi.fn(async () => status),
    handoffUpdate: vi.fn(async () => status),
    openUpdateReleasePage: vi.fn(async () => undefined),
  };
  Object.defineProperty(window, "praxeum", {
    configurable: true,
    value: {
      ...api,
      getUpdateStatus: vi.fn(async () => status),
      onUpdateStatusChanged: vi.fn(() => () => undefined),
      getTheme: vi.fn(() => new Promise(() => undefined)),
      onThemeChanged: vi.fn(() => () => undefined),
    } as unknown as PraxeumApi,
  });
  return api;
}

async function mount(): Promise<HTMLElement> {
  const host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root?.render(<AppShell children={<main>Course</main>} />));
  return host;
}

function button(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
}

const toast = (host: HTMLElement): Element | null => host.querySelector('[role="status"]');
const dialog = (host: HTMLElement): HTMLDialogElement | null => host.querySelector("dialog");

describe("update notice", () => {
  it("keeps a failed automatic check in the status bar and retries it from the dialog", async () => {
    const api = install({
      phase: "error",
      operation: "check",
      detail: "Updates could not be checked right now.",
    });
    const host = await mount();

    await vi.waitFor(() => expect(host.textContent).toContain("Update check failed"));
    // Nothing the learner did went wrong, so nothing interrupts them.
    expect(toast(host)).toBeNull();
    expect(dialog(host)?.open).toBe(false);

    await act(async () => button(host, "Update check failed")?.click());
    expect(dialog(host)?.open).toBe(true);
    expect(dialog(host)?.textContent).toContain("Updates could not be checked right now.");

    await act(async () => button(host, "Try again")?.click());
    expect(api.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("announces an offered version once, then keeps only the status-bar fact", async () => {
    const api = install({ phase: "available", version: "0.0.9", releaseNotes: "## Changed" });
    const host = await mount();

    await vi.waitFor(() =>
      expect(toast(host)?.textContent).toContain("Lerience 0.0.9 is available."),
    );
    // The raw notes never reach the shell.
    expect(host.textContent).not.toContain("## Changed");

    await act(async () => button(host, "Download")?.click());
    expect(api.downloadUpdate).toHaveBeenCalledOnce();

    await act(async () => button(host, "Dismiss this update notice")?.click());
    expect(toast(host)).toBeNull();
    expect(host.textContent).toContain("0.0.9 available");

    // A remount — the shell does this between the dashboard and a course —
    // does not bring the toast back for the same offer.
    act(() => root?.unmount());
    root = null;
    const again = await mount();
    await vi.waitFor(() => expect(again.textContent).toContain("0.0.9 available"));
    expect(toast(again)).toBeNull();
  });

  it("offers the restart for a verified download and opens the release page from the dialog", async () => {
    const api = install({
      phase: "ready",
      version: "0.0.9",
      releaseNotes: "",
      action: "install-restart",
    });
    const host = await mount();

    await vi.waitFor(() => expect(toast(host)?.textContent).toContain("downloaded and verified"));
    await act(async () => button(host, "Details")?.click());
    // Engaging with the notice retires the toast; the dialog carries on.
    expect(toast(host)).toBeNull();
    expect(dialog(host)?.open).toBe(true);
    expect(dialog(host)?.textContent).toContain("Lerience 0.0.9");
    expect(dialog(host)?.textContent).toContain("installs the update, and reopens");

    await act(async () => button(host, "View release notes")?.click());
    expect(api.openUpdateReleasePage).toHaveBeenCalledOnce();

    await act(async () => button(host, "Restart to update")?.click());
    expect(api.handoffUpdate).toHaveBeenCalledOnce();
  });
});
