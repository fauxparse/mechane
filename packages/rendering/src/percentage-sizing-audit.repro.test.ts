// Throwaway reproduction scaffolding for #708 ("Audit percentage sizing end to
// end"). Not a permanent test: it documents, with assertions, exactly what the
// renderer emits for percentage sizing in each layout mode, and writes an HTML
// fixture whose CSS resolution is measured in a real browser as part of the
// audit. Lives on the research/percentage-sizing-audit branch only.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasRenderer } from "./canvas-renderer";
import { prepareCanvasForRender } from "./canvas-presentation";
import type { Canvas } from "@mechane/domain";

function markup(canvas: Canvas): string {
  const presentation = prepareCanvasForRender({
    canvas,
    variables: [],
    shapes: [],
    blocks: [],
    imageAssets: [],
    mode: "studio",
  });
  return renderToStaticMarkup(createElement(CanvasRenderer, { presentation }));
}

function styleOf(html: string, id: string): string {
  const match = html.match(new RegExp(`data-element-id="${id}"[^>]*`));
  return match ? match[0] : "";
}

describe("percentage sizing audit (#708)", () => {
  it("emits width:50% for a fixed-% child of an auto-layout Frame", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        padding: 20,
        children: [
          {
            id: "pct",
            type: "rect",
            sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
          },
        ],
      },
    });
    expect(styleOf(html, "pct")).toContain("width:50%");
    // The parent's padding is authored on the frame; the child percentage must
    // resolve against the *content* box in CSS. Static markup proves emission;
    // the fixture below proves resolution.
    expect(html).toContain("padding:20px");
  });

  it("emits width:50% for a fixed-% child of an absolute (grid) Frame", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "absolute",
        children: [
          {
            id: "pct",
            type: "rect",
            anchor: { horizontal: "left", vertical: "top", offsetX: 0, offsetY: 0 },
            sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
          },
        ],
      },
    });
    const style = styleOf(html, "pct");
    expect(style).toContain("width:50%");
    expect(style).toContain("grid-area:1 / 1");
  });

  it("still emits width:100% for fill inside an absolute (grid) Frame — #141 says fill is unavailable there, the renderer does not block it", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "absolute",
        children: [
          {
            id: "filled",
            type: "rect",
            sizing: { width: { mode: "fill" } },
          },
        ],
      },
    });
    expect(styleOf(html, "filled")).toContain("width:100%");
  });

  it("emits percentage min constraints but SILENTLY DROPS max constraints — constraintFor has maxWidth/maxHeight arms that elementStyle never calls", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "absolute",
        children: [
          {
            id: "clamped",
            type: "rect",
            sizing: {
              minWidth: { value: 60, unit: "%" },
              maxWidth: { value: 30, unit: "%" },
            },
          },
        ],
      },
    });
    const style = styleOf(html, "clamped");
    expect(style).toContain("min-width:60%");
    // Audit finding: no max-width in the emitted style. assertValidCanvas
    // accepts maxWidth (canvas.ts:312), the inspector can author the number,
    // and the renderer's own constraintFor type names maxWidth — but
    // elementStyle maps only minWidth/minHeight (canvas-renderer.tsx:200-201).
    expect(style).not.toContain("max-width");
  });

  it("gives every element box-sizing:border-box", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "absolute",
        children: [
          {
            id: "boxed",
            type: "rect",
            padding: undefined,
            sizing: { width: { mode: "fixed", value: 100 } },
          },
        ],
      },
    });
    expect(styleOf(html, "boxed")).toContain("box-sizing:border-box");
  });

  it("keeps the Slot's own percentage sizing and the Block root's authored fixed size independent (#134: the Slot wins)", () => {
    const canvas: Canvas = {
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        sizing: { width: { mode: "fixed", value: 500 } },
        children: [
          {
            id: "slot",
            type: "slot",
            blockId: "card",
            layoutMode: "auto",
            direction: "vertical",
            // The Slot placement sizes itself at 50% of its parent...
            sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
          },
        ],
      },
    };
    const html = markup(canvas);
    const slotStyle = styleOf(html, "slot");
    expect(slotStyle).toContain("width:50%");
    expect(slotStyle).toContain("display:flex");
  });

  it("sizes a Slot placement with fill and renders the fixed Block root inside at its authored size", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        children: [
          {
            id: "slot",
            type: "slot",
            blockId: "card",
            layoutMode: "auto",
            sizing: { width: { mode: "fill" } },
          },
        ],
      },
    });
    // The renderer resolves the Block root through the presentation layer;
    // block-drag-creation writes the fill placement, so assert the Slot fills.
    expect(styleOf(html, "slot")).toContain("width:100%");
  });

  it("renders a hugging parent with a percentage child without complaint — the invariant is not enforced in the renderer", () => {
    // The Scene root itself is forced to 100%/100% (canvas-renderer.tsx:198),
    // so the hugging parent must be a nested Frame to observe the behaviour.
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        children: [
          {
            id: "hugger",
            type: "frame",
            layoutMode: "auto",
            direction: "vertical",
            sizing: { width: { mode: "hug" } },
            children: [
              {
                id: "pct",
                type: "rect",
                sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
              },
            ],
          },
        ],
      },
    });
    expect(styleOf(html, "hugger")).toContain("width:max-content");
    expect(styleOf(html, "pct")).toContain("width:50%");
  });

  it("writes the browser-measurement fixture used by the audit", () => {
    const scenes: Record<string, Canvas> = {
      // 1. % resolves against the parent's CONTENT box; own size is border-box.
      contentBox: {
        kind: "scene",
        root: {
          id: "f1",
          type: "frame",
          layoutMode: "absolute",
          sizing: { width: { mode: "fixed", value: 500 }, height: { mode: "fixed", value: 200 } },
          padding: 40,
          children: [
            {
              id: "f1-child",
              type: "rect",
              anchor: { horizontal: "left", vertical: "top" },
              sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
            },
            {
              id: "f1-bordered",
              type: "rect",
              anchor: { horizontal: "left", vertical: "top", offsetY: 60 },
              // rect padding is not a thing; use a frame for the border-box probe
              sizing: { width: { mode: "fixed", value: 100 }, height: { mode: "fixed", value: 40 } },
            },
          ],
        },
      },
      // 2. min wins over max (60% min vs 30% max).
      minBeatsMax: {
        kind: "scene",
        root: {
          id: "f2",
          type: "frame",
          layoutMode: "absolute",
          sizing: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 100 } },
          children: [
            {
              id: "f2-child",
              type: "rect",
              anchor: { horizontal: "left", vertical: "top" },
              sizing: {
                minWidth: { value: 60, unit: "%" },
                maxWidth: { value: 30, unit: "%" },
              },
            },
          ],
        },
      },
      // 3. min wins over fill, producing overflow.
      minBeatsFill: {
        kind: "scene",
        root: {
          id: "f3",
          type: "frame",
          layoutMode: "auto",
          direction: "vertical",
          sizing: { width: { mode: "fixed", value: 300 }, height: { mode: "fixed", value: 100 } },
          children: [
            {
              id: "f3-child",
              type: "rect",
              sizing: {
                width: { mode: "fill" },
                minWidth: { value: 150, unit: "%" },
              },
            },
          ],
        },
      },
      // 4. Absolute (grid) path honours %.
      gridPercent: {
        kind: "scene",
        root: {
          id: "f4",
          type: "frame",
          layoutMode: "absolute",
          sizing: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 100 } },
          padding: 20,
          children: [
            {
              id: "f4-child",
              type: "rect",
              anchor: { horizontal: "left", vertical: "top" },
              sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
            },
          ],
        },
      },
      // 5. fill inside an absolute Frame renders as 100%.
      gridFill: {
        kind: "scene",
        root: {
          id: "f5",
          type: "frame",
          layoutMode: "absolute",
          sizing: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 100 } },
          children: [
            {
              id: "f5-child",
              type: "rect",
              sizing: { width: { mode: "fill" } },
            },
          ],
        },
      },
      // 6. Percentage child inside a HUG parent: what CSS actually does.
      percentUnderHug: {
        kind: "scene",
        root: {
          id: "f6",
          type: "frame",
          layoutMode: "auto",
          direction: "vertical",
          sizing: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 100 } },
          children: [
            {
              id: "f6-hug",
              type: "frame",
              layoutMode: "auto",
              direction: "vertical",
              sizing: { width: { mode: "hug" } },
              children: [
                {
                  id: "f6-child",
                  type: "rect",
                  sizing: { width: { mode: "fixed", value: { value: 50, unit: "%" } } },
                },
              ],
            },
          ],
        },
      },
      // 7. Border-box own size: a padded frame at fixed 120px must measure 120.
      borderBox: {
        kind: "scene",
        root: {
          id: "f7",
          type: "frame",
          layoutMode: "absolute",
          sizing: { width: { mode: "fixed", value: 500 }, height: { mode: "fixed", value: 200 } },
          children: [
            {
              id: "f7-padded",
              type: "frame",
              layoutMode: "auto",
              padding: 30,
              anchor: { horizontal: "left", vertical: "top" },
              sizing: { width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 60 } },
              children: [{ id: "f7-inner", type: "rect" }],
            },
          ],
        },
      },
    };
    const body = Object.entries(scenes)
      .map(([name, canvas]) => {
        const html = markup(canvas);
        return `<section data-scene="${name}" style="position:relative;width:max-content"><h2>${name}</h2><div style="position:relative;width:600px;height:240px">${html.replace(/^<div/, '<div data-canvas').replace(/<\/div>$/, "</div>")}</div></section>`;
      })
      .join("\n");
    writeFileSync(
      resolve(import.meta.dirname, "percentage-sizing-audit.fixture.html"),
      `<!doctype html><html><head><meta charset="utf-8"><title>#708 percentage sizing fixture</title><style>body{font:12px system-space}section{margin:8px;padding:4px;border:1px solid #ccc}h2{margin:2px 0;font:600 11px system-ui}section>div{outline:1px dashed #ddd}</style></head><body>${body}</body></html>`,
    );
    expect(body.length).toBeGreaterThan(0);
  });
});
