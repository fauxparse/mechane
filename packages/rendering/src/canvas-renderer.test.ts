import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasRenderer } from "./canvas-renderer";
import type { Canvas } from "@mechane/domain";

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
  it("marks empty frames as painted hit targets", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [{ id: "empty-frame", type: "frame", children: [] }],
      },
    });

    expect(html).toMatch(/data-element-id="empty-frame"[^>]*data-element-painted="true"/);
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
  it("renders individual rectangle corner radii", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "rounded",
            type: "rect",
            cornerRadius: { topLeft: 8, topRight: 12, bottomRight: 16, bottomLeft: 20 },
          },
        ],
      },
    });

    expect(html).toContain("border-radius:8px 12px 16px 20px");
  });
  it("renders corner radii on frames", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "rounded-frame",
        type: "frame",
        cornerRadius: 24,
        children: [],
      },
    });

    expect(html).toContain("border-radius:24px");
  });
  it("uses auto gap to distribute flex children with space-between", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        gap: "auto",
        children: [{ id: "child", type: "rect" }],
      },
    });

    expect(html).toContain("gap:0px");
    expect(html).toContain("justify-content:space-between");
  });

  it("grows only on the primary axis when an auto-layout child fills", () => {
    const verticalWidthFill = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        children: [{ id: "child", type: "rect", width: { mode: "fill" } }],
      },
    });
    const horizontalHeightFill = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        children: [{ id: "child", type: "rect", height: { mode: "fill" } }],
      },
    });
    const verticalHeightFill = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        children: [{ id: "child", type: "rect", height: { mode: "fill" } }],
      },
    });

    expect(verticalWidthFill).not.toContain("flex-grow:1");
    expect(horizontalHeightFill).not.toContain("flex-grow:1");
    expect(verticalHeightFill).toContain("flex-grow:1");
  });

  it("uses positional offsets for anchored absolute Elements", () => {
    const html = markup({
      kind: "block",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "child",
            type: "rect",
            anchor: { horizontal: "left", vertical: "top", offsetX: 12, offsetY: 18 },
          },
        ],
      },
    });

    expect(html).toContain("position:relative");
    expect(html).toContain("left:12px");
    expect(html).toContain("top:18px");
    expect(html).not.toContain("margin-inline-start:12px");
    expect(html).not.toContain("margin-block-start:18px");
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
                { color: "white", position: 0 },
                { color: "black", position: 1 },
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
  it("renders ellipse primitives as circular shapes", () => {
    const html = markup({
      kind: "block",
      root: {
        id: "root",
        type: "frame",
        children: [{ id: "ellipse", type: "ellipse", fill: "red" }],
      },
    });

    expect(html).toContain('data-element-id="ellipse"');
    expect(html).toContain("border-radius:50%");
  });
  it("renders element strokes as CSS borders", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "stroked",
            type: "rect",
            stroke: { width: 3, style: "dashed", color: "#f43f5e" },
          },
        ],
      },
    });

    expect(html).toContain("border-color:#f43f5e");
    expect(html).toContain("border-style:dashed");
    expect(html).toContain("border-width:3px");
  });
});
