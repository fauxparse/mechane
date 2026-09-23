import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Element } from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import type { CanvasInspectorModel } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { SizeField } from "./SizeField";

const bar: Element = {
  id: "bar",
  type: "rect",
  sizing: {
    width: {
      mode: "fixed",
      value: {
        kind: "formula",
        formula: "item.votes / Total * 100",
        fallback: { value: 0, unit: "%" },
        unit: "%",
      },
    },
    height: { mode: "fill" },
  },
};

const focused: CanvasArtboardDocument = {
  canvasId: "canvas-block",
  artId: "block-tally-row",
  kind: "block",
  name: "TallyRow",
  canvas: { kind: "block", root: { id: "root", type: "frame", children: [bar] } },
  position: { x: 0, y: 0 },
};

const model: CanvasInspectorModel = {
  focused,
  target: bar,
  elements: [bar],
  selected: [bar],
  blocks: [],
  variables: [],
  shapes: [],
  imageAssets: [],
  deviceQrImages: {},
  fontFamilies: [],
  inspectorPreview: null,
  currentDimensions: null,
  absolute: false,
  common: (property) =>
    property
      .split(".")
      .reduce<unknown>(
        (value, key) => (value && typeof value === "object" ? Reflect.get(value, key) : undefined),
        bar,
      ),
  update: () => {},
  text: () => "",
  isAspectRatioLocked: false,
  setAspectRatioLock: () => {},
};

describe("SizeField", () => {
  it("shows the Formula driving a size instead of an empty input", () => {
    const html = renderToStaticMarkup(
      createElement(
        CanvasInspectorProvider,
        { value: model },
        createElement(SizeField, { axis: "width" }),
      ),
    );

    expect(html).toContain("item.votes / Total * 100");
  });
});
