import { afterEach, describe, expect, it } from "vitest";

import { createShowWindowPresence, type ShowWindowPresence } from "./show-window-presence";

const opened: ShowWindowPresence[] = [];

function open(showId: string, windowId: string): ShowWindowPresence {
  const presence = createShowWindowPresence({ showId, windowId });
  opened.push(presence);
  presence.join();
  return presence;
}

afterEach(() => {
  for (const presence of opened.splice(0)) presence.leave();
});

describe("createShowWindowPresence", () => {
  it("counts the windows that arrived before and after this one", async () => {
    const first = open("show_a", "one");
    const second = open("show_a", "two");
    const third = open("show_a", "three");

    await expect.poll(() => first.otherWindows()).toBe(2);
    await expect.poll(() => second.otherWindows()).toBe(2);
    await expect.poll(() => third.otherWindows()).toBe(2);
  });

  it("stops counting a window once it leaves", async () => {
    const remaining = open("show_a", "one");
    const closing = open("show_a", "two");
    await expect.poll(() => remaining.otherWindows()).toBe(1);

    closing.leave();

    await expect.poll(() => remaining.otherWindows()).toBe(0);
  });

  it("ignores windows open on a different Show", async () => {
    const mine = open("show_a", "one");
    const elsewhere = open("show_b", "two");
    open("show_b", "three");
    await expect.poll(() => elsewhere.otherWindows()).toBe(1);

    expect(mine.otherWindows()).toBe(0);
  });

  it("forgets a window that vanished without leaving once it re-joins", async () => {
    const survivor = open("show_a", "one");
    open("show_a", "two");
    // A tab that crashed: it arrived, then went away without a goodbye.
    const crashed = new BroadcastChannel("mechane:studio-windows:show_a");
    crashed.postMessage({ type: "arrive", windowId: "crashed" });
    await expect.poll(() => survivor.otherWindows()).toBe(2);
    crashed.close();

    survivor.join();

    await expect.poll(() => survivor.otherWindows()).toBe(1);
  });
});
