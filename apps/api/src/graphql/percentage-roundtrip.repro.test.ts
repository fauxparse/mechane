// Throwaway reproduction scaffolding for #708 ("Audit percentage sizing end to
// end"). Follows a { value: 50, unit: "%" } through the write path
// (canvas workspace edit codec), JSONB row shaping, the GraphQL document, and
// decodeCanvasDocument + assertValidCanvas, and back out as an inspector-ready
// Element. Lives on the research/percentage-sizing-audit branch only.
import { describe, expect, it } from "vitest";

import { flattenCanvasElements, resolveCanvasElementType, type SerializedElement } from "./canvas";
import { decodeCanvasDocument } from "@mechane/graphql-schema";
import type { Canvas } from "@mechane/domain";

/** The flat list as GraphQL delivers it: typenames instead of the discriminator. */
const asDelivered = (elements: readonly SerializedElement[]) =>
  elements.map(({ type, ...fields }) => ({
    __typename: resolveCanvasElementType({ type }),
    ...fields,
  }));

const percentageCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "root",
    type: "frame",
    layoutMode: "auto",
    direction: "vertical",
    children: [
      {
        id: "pct",
        type: "rect",
        sizing: {
          width: { mode: "fixed", value: { value: 50, unit: "%" } },
          minWidth: { value: 10, unit: "%" },
          maxWidth: { value: 90, unit: "%" },
        },
      },
    ],
  },
};

/** jsonb + the GraphQL JSON scalar both carry values as JSON text. */
const jsonRoundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("percentage sizing persistence round-trip (#708)", () => {
  it("keeps the % unit through flatten → JSON → decodeCanvasDocument → assertValidCanvas", () => {
    // Server read side: StoredCanvas.root → flat Element list (apps/api/src/db/canvas.ts
    // stores the same object minus id/type/rank/name/hidden/children in the
    // canvasElements.properties jsonb column; toElement spreads it back verbatim).
    const elements = asDelivered(flattenCanvasElements(percentageCanvas.root));
    // Wire: the GraphQL schema exposes sizing as a JSON scalar (schema.ts:840).
    const document = jsonRoundTrip({ id: "canvas_1", kind: "scene", elements });

    const canvas = decodeCanvasDocument(document);
    const pct = canvas.root.children![0]!;
    expect(pct.sizing?.width).toEqual({ mode: "fixed", value: { value: 50, unit: "%" } });
    expect(pct.sizing?.minWidth).toEqual({ value: 10, unit: "%" });
    expect(pct.sizing?.maxWidth).toEqual({ value: 90, unit: "%" });
    // decodeCanvasDocument ends in assertValidCanvas, so acceptance is proven
    // by the absence of a throw.
  });

  it("rejects an unknown unit at the same gate, proving the unit is validated, not ignored", () => {
    const elements = asDelivered(flattenCanvasElements(percentageCanvas.root));
    elements[1]!.sizing = { width: { mode: "fixed", value: { value: 50, unit: "vw" } } };
    expect(() => decodeCanvasDocument({ id: "canvas_1", kind: "scene", elements })).toThrow(
      /px or %/,
    );
  });

  it("rejects a negative percentage value at the same gate", () => {
    const elements = asDelivered(flattenCanvasElements(percentageCanvas.root));
    elements[1]!.sizing = { width: { mode: "fixed", value: { value: -50, unit: "%" } } };
    expect(() => decodeCanvasDocument({ id: "canvas_1", kind: "scene", elements })).toThrow(
      /non-negative/,
    );
  });
});
