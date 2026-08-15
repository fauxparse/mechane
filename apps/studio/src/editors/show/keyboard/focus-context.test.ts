import { afterEach, describe, expect, it } from "vitest";

import { focusContext } from "./focus-context";

class TestHTMLElement {
  closest(selector: string): TestHTMLElement | null {
    return selector.split(", ").includes("button") ? this : null;
  }
}

const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: originalHTMLElement,
  });
});

describe("focusContext", () => {
  it("treats a focused inspector button as a key-consuming widget", () => {
    const activeElement = new TestHTMLElement();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement },
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: TestHTMLElement,
    });

    expect(focusContext()).toEqual({ nodeHasFocus: false, inKeyConsumingWidget: true });
  });
});
