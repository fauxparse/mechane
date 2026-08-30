import { describe, expect, it } from "vitest";

import {
  ARTBOARD_COMMAND_TYPES,
  CANVAS_COMMAND_TYPES,
  type ArtboardEdit,
  type CanvasEdit,
} from "./canvas-edits";
import type { CanvasWorkspaceEdit } from "./canvas-commands";
import {
  ARTBOARD_EDIT_CODECS,
  CANVAS_EDIT_CODECS,
  CanvasEditCodecError,
  decodeCanvasEdit,
  decodeCanvasWorkspaceEdit,
  encodeCanvasWorkspaceEdit,
  isCanvasWorkspaceEditType,
  type FlatCanvasEdit,
} from "./canvas-edit-codec";

const CANVAS_ID = "canvas_1";

/**
 * One example per Canvas content variant, keyed by type so the record is
 * exhaustive: a `CanvasEdit` variant nobody described here fails compilation,
 * which is the whole reason the codec is a mapped record rather than a switch.
 */
const CANVAS_EXAMPLES: { [T in CanvasEdit["type"]]: Extract<CanvasEdit, { type: T }> } = {
  [CANVAS_COMMAND_TYPES.addElement]: {
    type: CANVAS_COMMAND_TYPES.addElement,
    element: { id: "title", type: "text", content: "Hello", textAlign: "center" },
    parentId: "root",
    rank: "a0",
  },
  [CANVAS_COMMAND_TYPES.removeElement]: {
    type: CANVAS_COMMAND_TYPES.removeElement,
    elementId: "title",
  },
  [CANVAS_COMMAND_TYPES.updateElement]: {
    type: CANVAS_COMMAND_TYPES.updateElement,
    elementId: "title",
    properties: { content: "Updated", fontSize: 24 },
    unsetProperties: ["color"],
  },
  [CANVAS_COMMAND_TYPES.reparentElement]: {
    type: CANVAS_COMMAND_TYPES.reparentElement,
    elementId: "title",
    parentId: "group",
    rank: "a1",
  },
};

const ARTBOARD_EXAMPLES: { [T in ArtboardEdit["type"]]: Extract<ArtboardEdit, { type: T }> } = {
  [ARTBOARD_COMMAND_TYPES.move]: {
    type: ARTBOARD_COMMAND_TYPES.move,
    position: { x: 120.5, y: -40 },
  },
};

const EXAMPLES: CanvasWorkspaceEdit[] = [
  ...Object.values(CANVAS_EXAMPLES),
  ...Object.values(ARTBOARD_EXAMPLES),
].map((edit) => ({ canvasId: CANVAS_ID, edit }));

describe("Canvas workspace edit codec", () => {
  it("describes every Canvas content variant", () => {
    expect(Object.keys(CANVAS_EDIT_CODECS).sort()).toEqual(
      Object.values(CANVAS_COMMAND_TYPES).sort(),
    );
  });

  it("describes every Artboard variant", () => {
    expect(Object.keys(ARTBOARD_EDIT_CODECS).sort()).toEqual(
      Object.values(ARTBOARD_COMMAND_TYPES).sort(),
    );
  });

  it.each(EXAMPLES.map((edit) => [edit.edit.type, edit] as const))(
    "round-trips %s",
    (_type, edit) => {
      expect(decodeCanvasWorkspaceEdit(encodeCanvasWorkspaceEdit(edit))).toEqual(edit);
    },
  );

  it("keeps the Canvas id on every variant", () => {
    for (const edit of EXAMPLES) {
      expect(encodeCanvasWorkspaceEdit(edit).canvasId).toBe(CANVAS_ID);
    }
  });

  it("carries no unsetProperties when an update unsets nothing", () => {
    const edit: CanvasWorkspaceEdit = {
      canvasId: CANVAS_ID,
      edit: {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "title",
        properties: { content: "Updated" },
      },
    };
    const flat = encodeCanvasWorkspaceEdit(edit);
    expect(flat.unsetProperties).toBeUndefined();
    expect(decodeCanvasWorkspaceEdit(flat)).toEqual(edit);
  });

  it("recognises both vocabularies and nothing else", () => {
    expect(isCanvasWorkspaceEditType(CANVAS_COMMAND_TYPES.addElement)).toBe(true);
    expect(isCanvasWorkspaceEditType(ARTBOARD_COMMAND_TYPES.move)).toBe(true);
    expect(isCanvasWorkspaceEditType("graph.addNode")).toBe(false);
  });
});

describe("Canvas workspace edit codec rejections", () => {
  it("refuses an edit type this build has never heard of", () => {
    expect(() => decodeCanvasWorkspaceEdit({ type: "canvas.tint", canvasId: CANVAS_ID })).toThrow(
      CanvasEditCodecError,
    );
  });

  it("refuses an edit that names no Canvas", () => {
    expect(() =>
      decodeCanvasWorkspaceEdit({
        type: CANVAS_COMMAND_TYPES.removeElement,
        canvasId: "",
        elementId: "title",
      }),
    ).toThrow(/needs a canvasId/);
  });

  it.each([
    [{ type: CANVAS_COMMAND_TYPES.removeElement }, /needs a non-empty "elementId"/],
    [
      { type: CANVAS_COMMAND_TYPES.addElement, parentId: "root", rank: "a0" },
      /needs the "element" object/,
    ],
    [
      {
        type: CANVAS_COMMAND_TYPES.addElement,
        element: { type: "text" },
        parentId: "root",
        rank: "a0",
      },
      /needs a non-empty "element id"/,
    ],
    [
      { type: CANVAS_COMMAND_TYPES.addElement, element: { id: "t", type: "text" }, rank: "a0" },
      /needs a non-empty "parentId"/,
    ],
    [{ type: CANVAS_COMMAND_TYPES.updateElement, elementId: "title" }, /needs "properties"/],
    [
      {
        type: CANVAS_COMMAND_TYPES.updateElement,
        elementId: "title",
        properties: {},
        unsetProperties: [7],
      },
      /must all be strings/,
    ],
    [{ type: ARTBOARD_COMMAND_TYPES.move }, /needs the "position" object/],
    [{ type: ARTBOARD_COMMAND_TYPES.move, position: { x: 1 } }, /numeric position/],
  ])("refuses an edit missing a field its type needs (%#)", (payload, message) => {
    expect(() =>
      decodeCanvasWorkspaceEdit({ canvasId: CANVAS_ID, ...payload } as FlatCanvasEdit),
    ).toThrow(message);
  });
});

describe("Canvas content decoding", () => {
  it.each(Object.values(CANVAS_EXAMPLES).map((edit) => [edit.type, edit] as const))(
    "decodes %s as Canvas content",
    (_type, edit) => {
      expect(decodeCanvasEdit(encodeCanvasWorkspaceEdit({ canvasId: CANVAS_ID, edit }))).toEqual(
        edit,
      );
    },
  );

  it("refuses Artboard framing, which is not Canvas content", () => {
    const flat = encodeCanvasWorkspaceEdit({
      canvasId: CANVAS_ID,
      edit: ARTBOARD_EXAMPLES[ARTBOARD_COMMAND_TYPES.move],
    });
    expect(() => decodeCanvasEdit(flat)).toThrow(/not Canvas content/);
  });
});
