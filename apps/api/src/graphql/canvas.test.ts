import type { Canvas, FrameElement } from "@mechane/domain";
import { decodeCanvasDocument } from "@mechane/graphql-schema";
import { describe, expect, it } from "vitest";

import type { StoredCanvas } from "../db/canvas";
import { flattenCanvasElements, resolveCanvasElementType, serializeArtboard } from "./canvas";
import { schema } from "./schema";

function storedCanvas(root: FrameElement): StoredCanvas {
  return {
    id: "canvas_1",
    showId: "show_1",
    state: "draft",
    updatedAt: new Date(0),
    version: 1,
    position: { x: 12, y: -34 },
    ownerId: "scene_1",
    ownerName: "Opening",
    kind: "scene",
    root,
  } as StoredCanvas;
}

/** A Canvas deeper than the six levels the old recursive selection could reach. */
function deepCanvas(depth: number): FrameElement {
  let element: FrameElement = {
    id: `frame_${depth}`,
    type: "frame",
    rank: "a0",
    children: [{ id: "leaf", type: "text", rank: "a0", content: "Deep" }],
  };
  for (let level = depth - 1; level >= 0; level -= 1) {
    element = { id: `frame_${level}`, type: "frame", rank: "a0", children: [element] };
  }
  return element;
}

/**
 * The serialised Canvas as GraphQL actually delivers it: `type` is the
 * discriminator `Element.__resolveType` reads, and what reaches a client in its
 * place is the typename that resolver returns.
 */
function asDelivered(canvas: StoredCanvas) {
  const { elements, ...rest } = serializeArtboard(canvas).canvas;
  return {
    ...rest,
    elements: elements.map(({ type, ...fields }) => ({
      __typename: resolveCanvasElementType({ type }),
      ...fields,
    })),
  };
}

describe("Canvas GraphQL adapter", () => {
  it.each([
    ["rect", "RectElement"],
    ["ellipse", "EllipseElement"],
    ["text", "TextElement"],
    ["image", "ImageElement"],
    ["frame", "FrameElement"],
    ["slot", "SlotElement"],
  ] as const)("maps %s to %s", (type, graphqlType) => {
    expect(resolveCanvasElementType({ type })).toBe(graphqlType);
  });

  it("carries every Element's parent and rank so a client can rebuild the tree", () => {
    const elements = flattenCanvasElements({
      id: "root",
      type: "frame",
      children: [
        { id: "b", type: "text", rank: "a1", content: "Second" },
        { id: "a", type: "rect", rank: "a0" },
      ],
    });
    expect(elements).toEqual([
      { id: "root", type: "frame", parentId: null, rank: "" },
      { id: "b", type: "text", parentId: "root", rank: "a1", content: "Second" },
      { id: "a", type: "rect", parentId: "root", rank: "a0" },
    ]);
  });

  it("serialises an Artboard as framing beside Canvas content", () => {
    const artboard = serializeArtboard(storedCanvas({ id: "root", type: "frame", children: [] }));
    expect(artboard).toEqual({
      canvas: {
        id: "canvas_1",
        kind: "scene",
        elements: [{ id: "root", type: "frame", parentId: null, rank: "" }],
      },
      ownerId: "scene_1",
      ownerName: "Opening",
      position: { x: 12, y: -34 },
    });
  });

  it("round-trips a Canvas deeper than any recursive selection could reach", () => {
    const root = deepCanvas(40);
    const decoded: Canvas = decodeCanvasDocument(asDelivered(storedCanvas(root)));
    expect(decoded.root).toEqual(root);
  });
});

describe("Canvas GraphQL schema", () => {
  it.each([
    ["TextElement", "textAlign"],
    ["TextElement", "content"],
    ["ImageElement", "objectPosition"],
    ["TextElement", "alignSelf"],
    ["TextElement", "layout"],
  ])("exposes %s.%s so Canvas refreshes retain it", (type, field) => {
    const element = schema.getType(type);
    const fields = element && "getFields" in element ? element.getFields() : undefined;
    expect(fields?.[field]).toBeDefined();
  });

  it("exposes Canvas Elements flat, with no nesting to cap (ADR-0014)", () => {
    const canvas = schema.getType("Canvas");
    const fields = canvas && "getFields" in canvas ? canvas.getFields() : undefined;
    expect(fields?.elements).toBeDefined();
    expect(fields?.root).toBeUndefined();
  });

  it.each(["Element", "RectElement", "TextElement", "ImageElement", "FrameElement", "SlotElement"])(
    "gives %s a parent and a rank instead of children",
    (type) => {
      const element = schema.getType(type);
      const fields = element && "getFields" in element ? element.getFields() : undefined;
      expect(fields?.parentId).toBeDefined();
      expect(fields?.rank).toBeDefined();
      expect(fields?.children).toBeUndefined();
    },
  );

  it("keeps Artboard framing off Canvas content", () => {
    const canvas = schema.getType("Canvas");
    const canvasFields = canvas && "getFields" in canvas ? canvas.getFields() : undefined;
    expect(canvasFields?.position).toBeUndefined();
    expect(canvasFields?.ownerId).toBeUndefined();

    const artboard = schema.getType("Artboard");
    const artboardFields = artboard && "getFields" in artboard ? artboard.getFields() : undefined;
    expect(artboardFields?.position).toBeDefined();
    expect(artboardFields?.canvas).toBeDefined();
  });
});
