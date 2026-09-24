import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Element } from "@mechane/domain/canvas";
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

const modelFor = (selected: readonly Element[]): CanvasInspectorModel => ({
  focused,
  target: selected[0] ?? bar,
  elements: selected,
  selected,
  blocks: [],
  variables: [],
  shapes: [],
  imageAssets: [],
  deviceQrImages: {},
  fontFamilies: [],
  inspectorPreview: null,
  currentDimensions: null,
  absolute: false,
  common: () => undefined,
  update: () => {},
  text: () => "",
  isAspectRatioLocked: false,
  setAspectRatioLock: () => {},
});

const render = (selected: readonly Element[]) =>
  renderToStaticMarkup(
    createElement(
      CanvasInspectorProvider,
      { value: modelFor(selected) },
      createElement(SizeField, { axis: "width" }),
    ),
  );

describe("SizeField", () => {
  it("reads at rest as what the Artboard renders, keeping the Formula out of the sidebar", () => {
    const html = render([bar]);

    expect(html).toContain('title="item.votes / Total * 100%"');
    expect(html).toMatch(/>0%<\/span>/);
    expect(html).toContain('data-slot="formula-badge"');
    expect(html).not.toContain("Loading Formula editor");
  });

  it("counts different Formulas across a selection instead of showing one", () => {
    const other: Element = {
      ...bar,
      id: "other",
      sizing: {
        width: {
          mode: "fixed",
          value: { kind: "formula", formula: "50", fallback: 10, unit: "px" },
        },
      },
    };

    const html = render([bar, other]);

    expect(html).toContain("2 Formulas");
    expect(html).not.toContain("title=");
  });
});
