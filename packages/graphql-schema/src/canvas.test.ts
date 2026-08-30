import type { Element } from "@mechane/domain";
import { print } from "graphql";
import { describe, expect, it } from "vitest";

import {
  CanvasDocumentError,
  CanvasElementFields,
  decodeCanvasDocument,
  GetShowCanvasesQuery,
  type CanvasDocumentErrorCode,
  type CanvasElementDocument,
} from "./canvas";

function element(
  typename: string,
  id: string,
  parentId: string | null,
  rank: string,
  fields: Record<string, unknown> = {},
): CanvasElementDocument {
  return { __typename: typename, id, parentId, rank, ...fields };
}

function canvasDocument(elements: CanvasElementDocument[], kind = "scene") {
  return { id: "canvas_1", kind, elements };
}

describe("Canvas GraphQL query", () => {
  it.each(["textAlign", "objectPosition", "content", "alignSelf", "layout"])(
    "requests %s when loading Canvas Elements",
    (field) => {
      expect(print(CanvasElementFields)).toContain(field);
    },
  );

  it("requests the parent and rank the tree is rebuilt from", () => {
    const printed = print(CanvasElementFields);
    expect(printed).toContain("parentId");
    expect(printed).toContain("rank");
  });

  it("selects Elements flat, so no depth is unreachable (ADR-0014)", () => {
    const printed = print(GetShowCanvasesQuery);
    expect(printed).toContain("elements");
    expect(printed).not.toContain("children");
  });
});

describe("decodeCanvasDocument", () => {
  it("rebuilds a whole Element tree, at any depth", () => {
    // Deeper than the six levels the recursive selection could reach.
    const elements: CanvasElementDocument[] = [element("FrameElement", "frame_0", null, "")];
    for (let level = 1; level <= 30; level += 1) {
      elements.push(element("FrameElement", `frame_${level}`, `frame_${level - 1}`, "a0"));
    }
    elements.push(element("TextElement", "leaf", "frame_30", "a0", { content: "Deep" }));

    const canvas = decodeCanvasDocument(canvasDocument(elements));
    let node: Element = canvas.root;
    for (let level = 1; level <= 30; level += 1) {
      node = node.children![0]!;
      expect(node.id).toBe(`frame_${level}`);
    }
    expect(node.children![0]).toEqual({
      id: "leaf",
      type: "text",
      rank: "a0",
      content: "Deep",
    });
  });

  it.each([
    ["RectElement", "rect"],
    ["EllipseElement", "ellipse"],
    ["TextElement", "text"],
    ["ImageElement", "image"],
    ["FrameElement", "frame"],
    ["SlotElement", "slot"],
  ])("decodes %s as a %s Element", (typename, kind) => {
    const canvas = decodeCanvasDocument(
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element(typename, "child", "root", "a0", kind === "slot" ? { blockId: "block_1" } : {}),
      ]),
    );
    expect(canvas.root.children![0]!.type).toBe(kind);
  });

  it("orders siblings by rank, not by the order the rows arrived in", () => {
    const canvas = decodeCanvasDocument(
      canvasDocument([
        element("RectElement", "third", "root", "a2"),
        element("FrameElement", "root", null, ""),
        element("RectElement", "first", "root", "a0"),
        element("RectElement", "second", "root", "a1"),
      ]),
    );
    expect(canvas.root.children!.map((child) => child.id)).toEqual(["first", "second", "third"]);
  });

  it("keeps every Property a Canvas set, and drops the nulls it did not", () => {
    const canvas = decodeCanvasDocument(
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("TextElement", "title", "root", "a0", {
          content: "Hello",
          textAlign: "center",
          fontSize: null,
          color: null,
        }),
      ]),
    );
    expect(canvas.root.children![0]).toEqual({
      id: "title",
      type: "text",
      rank: "a0",
      content: "Hello",
      textAlign: "center",
    });
  });

  it("reads the Canvas kind", () => {
    expect(
      decodeCanvasDocument(canvasDocument([element("FrameElement", "root", null, "")], "block"))
        .kind,
    ).toBe("block");
  });
});

describe("decodeCanvasDocument rejections", () => {
  function codeFor(document: unknown): CanvasDocumentErrorCode {
    try {
      decodeCanvasDocument(document);
    } catch (error) {
      if (error instanceof CanvasDocumentError) return error.code;
      throw error;
    }
    throw new Error("Expected the Canvas document to be rejected.");
  }

  it.each([
    ["a document that is not an object", "malformed-document" as const, "nope"],
    [
      "a document with no Element list",
      "malformed-document" as const,
      { id: "canvas_1", kind: "scene" },
    ],
    [
      "an Element kind this build has never heard of",
      "unknown-element-kind" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("VideoElement", "clip", "root", "a0"),
      ]),
    ],
    [
      "a duplicated Element id",
      "duplicate-element-id" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("RectElement", "twin", "root", "a0"),
        element("RectElement", "twin", "root", "a1"),
      ]),
    ],
    [
      "a parent the Canvas does not contain",
      "missing-parent" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("RectElement", "orphan", "missing", "a0"),
      ]),
    ],
    ["no parentless Element at all", "no-root" as const, canvasDocument([])],
    [
      "more than one parentless Element",
      "multiple-roots" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("FrameElement", "other", null, ""),
      ]),
    ],
    [
      "a root that is not a Frame",
      "root-not-frame" as const,
      canvasDocument([element("RectElement", "root", null, "")]),
    ],
    [
      "an Element unreachable from the root",
      "unreachable-element" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("FrameElement", "left", "right", "a0"),
        element("FrameElement", "right", "left", "a0"),
      ]),
    ],
    [
      "siblings that share a rank",
      "duplicate-sibling-rank" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("RectElement", "one", "root", "a0"),
        element("RectElement", "two", "root", "a0"),
      ]),
    ],
    [
      "a Canvas the domain itself refuses",
      "invalid-canvas" as const,
      canvasDocument([
        element("FrameElement", "root", null, ""),
        element("RectElement", "rect", "root", "a0"),
        element("RectElement", "nested", "rect", "a0"),
      ]),
    ],
  ])("refuses %s", (_name, code, document) => {
    expect(codeFor(document)).toBe(code);
  });

  it("names the Canvas and Element a reader would need to find the fault", () => {
    try {
      decodeCanvasDocument(
        canvasDocument([
          element("FrameElement", "root", null, ""),
          element("RectElement", "orphan", "missing", "a0"),
        ]),
      );
      throw new Error("Expected the Canvas document to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(CanvasDocumentError);
      const failure = error as CanvasDocumentError;
      expect(failure.canvasId).toBe("canvas_1");
      expect(failure.elementId).toBe("orphan");
    }
  });
});
