import { describe, expect, it } from "vitest";

import { PAN_STEP, PAN_STEP_LARGE, viewportIntentFor, type FocusContext } from "./viewport-keys";

const FREE: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: false };
const NODE_FOCUSED: FocusContext = { nodeHasFocus: true, inKeyConsumingWidget: false };
const TYPING: FocusContext = { nodeHasFocus: false, inKeyConsumingWidget: true };

describe("viewportIntentFor", () => {
  describe("panning", () => {
    it("pans the camera in the arrow's direction", () => {
      expect(viewportIntentFor({ key: "ArrowRight" }, FREE)).toEqual({
        type: "pan",
        dx: PAN_STEP,
        dy: 0,
      });
      expect(viewportIntentFor({ key: "ArrowLeft" }, FREE)).toEqual({
        type: "pan",
        dx: -PAN_STEP,
        dy: 0,
      });
      expect(viewportIntentFor({ key: "ArrowDown" }, FREE)).toEqual({
        type: "pan",
        dx: 0,
        dy: PAN_STEP,
      });
      expect(viewportIntentFor({ key: "ArrowUp" }, FREE)).toEqual({
        type: "pan",
        dx: 0,
        dy: -PAN_STEP,
      });
    });

    it("takes a bigger step with Shift", () => {
      expect(viewportIntentFor({ key: "ArrowRight", shiftKey: true }, FREE)).toEqual({
        type: "pan",
        dx: PAN_STEP_LARGE,
        dy: 0,
      });
    });

    // The one rule that keeps the camera out of React Flow's way: a focused
    // node moves itself with the arrows (PRD §6.3).
    it("does not pan while a node holds focus", () => {
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        expect(viewportIntentFor({ key }, NODE_FOCUSED)).toBeNull();
      }
    });

    it("leaves modified arrows alone", () => {
      expect(viewportIntentFor({ key: "ArrowRight", metaKey: true }, FREE)).toBeNull();
      expect(viewportIntentFor({ key: "ArrowRight", ctrlKey: true }, FREE)).toBeNull();
      expect(viewportIntentFor({ key: "ArrowRight", altKey: true }, FREE)).toBeNull();
    });
  });

  describe("zooming", () => {
    it("zooms in on + and its unshifted face", () => {
      expect(viewportIntentFor({ key: "+" }, FREE)).toEqual({ type: "zoom", direction: "in" });
      expect(viewportIntentFor({ key: "=" }, FREE)).toEqual({ type: "zoom", direction: "in" });
    });

    it("zooms out on - and its shifted face", () => {
      expect(viewportIntentFor({ key: "-" }, FREE)).toEqual({ type: "zoom", direction: "out" });
      expect(viewportIntentFor({ key: "_" }, FREE)).toEqual({ type: "zoom", direction: "out" });
    });

    // Claiming the browser's page-zoom chord is the point, not an accident.
    it("claims Cmd+/Cmd- and Ctrl+/Ctrl-", () => {
      expect(viewportIntentFor({ key: "+", metaKey: true }, FREE)).toEqual({
        type: "zoom",
        direction: "in",
      });
      expect(viewportIntentFor({ key: "-", ctrlKey: true }, FREE)).toEqual({
        type: "zoom",
        direction: "out",
      });
    });

    // Zoom is camera-only, so a focused node has no claim on it — unlike the
    // arrow keys, which the node is already using.
    it("still zooms while a node holds focus", () => {
      expect(viewportIntentFor({ key: "+" }, NODE_FOCUSED)).toEqual({
        type: "zoom",
        direction: "in",
      });
    });
  });

  it("yields nothing while the user is typing", () => {
    for (const key of ["ArrowRight", "+", "-"]) {
      expect(viewportIntentFor({ key }, TYPING)).toBeNull();
    }
  });

  it("yields nothing for keys it doesn't own", () => {
    for (const key of ["a", "Enter", "Escape", " ", "Tab", "PageDown"]) {
      expect(viewportIntentFor({ key }, FREE)).toBeNull();
    }
  });
});
