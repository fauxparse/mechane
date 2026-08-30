import { afterEach, describe, expect, it } from "vitest";

import { focusContext } from "./focus-context";

class TestHTMLElement {
  constructor(private readonly role: string) {}

  closest(selector: string): TestHTMLElement | null {
    return selector.split(", ").includes(this.role) ? this : null;
  }
}

class CanvasPanelButton extends TestHTMLElement {
  closest(selector: string): TestHTMLElement | null {
    return selector === '[aria-label="Layers"], [aria-label="Properties"]'
      ? this
      : super.closest(selector);
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
    const activeElement = new TestHTMLElement("button");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement },
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: TestHTMLElement,
    });

    expect(focusContext()).toEqual({
      nodeHasFocus: false,
      inKeyConsumingWidget: true,
      inCanvasPanel: false,
      inTextInput: false,
      inUndoBlockingWidget: false,
    });
  });
  it("treats plaintext-only text editing as a key-consuming widget", () => {
    const activeElement = new TestHTMLElement("[contenteditable]");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement },
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: TestHTMLElement,
    });

    expect(focusContext()).toEqual({
      nodeHasFocus: false,
      inKeyConsumingWidget: true,
      inCanvasPanel: false,
      inTextInput: true,
      inUndoBlockingWidget: false,
    });
  });
  it("marks Layers and Properties focus as canvas panel focus", () => {
    const activeElement = new CanvasPanelButton("button");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement },
    });
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: CanvasPanelButton,
    });

    expect(focusContext()).toEqual({
      nodeHasFocus: false,
      inKeyConsumingWidget: true,
      inCanvasPanel: true,
      inTextInput: false,
      inUndoBlockingWidget: false,
    });
  });
});
