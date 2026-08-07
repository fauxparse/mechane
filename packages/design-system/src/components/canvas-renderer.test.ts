import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasRenderer } from "./canvas-renderer";
import type { Canvas } from "./canvas-model";

function markup(canvas: Canvas): string {
  return renderToStaticMarkup(createElement(CanvasRenderer, { canvas }));
}

describe("CanvasRenderer", () => {
  it("renders ranked absolute children in one CSS Grid cell without wrappers", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          { id: "second", type: "rect", rank: "b", fill: "red" },
          { id: "first", type: "rect", rank: "a", fill: "blue" },
        ],
      },
    });

    expect(html.indexOf('data-element-id="first"')).toBeLessThan(
      html.indexOf('data-element-id="second"'),
    );
    expect(html).toContain("display:grid");
    expect(html).toContain("grid-area:1 / 1");
    expect(html).not.toContain('data-element-id="first"><div');
  });

  it("uses flex layout, authored padding/gap, and the scene clipping boundary", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 12,
        padding: 20,
        children: [{ id: "child", type: "rect", width: { mode: "fill" } }],
      },
    });

    expect(html).toContain("display:flex");
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("gap:12px");
    expect(html).toContain("padding:20px");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("width:100%");
  });

  it("serializes gradients, min sizing, aspect ratio, and right-angle rotation as CSS", () => {
    const html = markup({
      kind: "block",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "child",
            type: "text",
            content: "hello",
            rotation: 90,
            width: { mode: "fixed", value: 80 },
            height: { mode: "fixed", value: 40 },
            minWidth: { value: 100, unit: "%" },
            aspectRatio: { ratio: 2, driver: "width" },
            fill: {
              type: "linear",
              angle: 45,
              stops: [
                { color: "red", position: 0 },
                { color: "green", position: 0.5 },
                { color: "blue", position: 1 },
              ],
            },
          },
          {
            id: "radial",
            type: "rect",
            fill: {
              kind: "radial",
              stops: [
                { colour: "white", position: 0 },
                { colour: "black", position: 1 },
              ],
            },
          },
        ],
      },
    });

    expect(html).toContain("linear-gradient(45deg, red 0%, green 50%, blue 100%)");
    expect(html).toContain("radial-gradient(circle, white 0%, black 100%)");
    expect(html).toContain("min-height:100%");
    expect(html).toContain("aspect-ratio:0.5");
    expect(html).toContain("writing-mode:vertical-rl");
    expect(html).toContain("text-orientation:sideways");
    expect(html).toContain("width:40px");
    expect(html).toContain("height:80px");
  });
});
