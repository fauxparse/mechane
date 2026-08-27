import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CanvasRenderer } from "./canvas-renderer";
import type { CanvasRendererProps } from "./canvas-render";
import type { Block, Canvas, SlotVariableValue } from "@mechane/domain";

function markup(canvas: Canvas, props: Omit<CanvasRendererProps, "canvas"> = {}): string {
  return renderToStaticMarkup(createElement(CanvasRenderer, { canvas, ...props }));
}

describe("CanvasRenderer", () => {
  it("resolves a Slot State Selector before rendering its Block", () => {
    const block: Block = {
      id: "card",
      name: "Card",
      canvas: {
        id: "card-canvas",
        kind: "block",
        root: {
          id: "card-root",
          type: "frame",
          children: [{ id: "title", type: "text", content: "Base" }],
        },
      },
      variables: [{ id: "selector", name: "State", type: "text", required: false }],
      states: [
        { id: "default", name: "Default", isDefault: true, overrides: [] },
        {
          id: "live",
          name: "Live",
          isDefault: false,
          overrides: [{ elementId: "title", property: "content", value: "Live" }],
        },
      ],
      stateSelectorVariableId: "selector",
    };
    const variables: SlotVariableValue[] = [{ id: "selector", type: "text", value: "Live" }];
    const html = markup(
      {
        kind: "scene",
        root: {
          id: "scene-root",
          type: "frame",
          children: [
            {
              id: "slot",
              type: "slot",
              blockId: block.id,
              assignments: [
                {
                  variableId: "selector",
                  source: { kind: "variable", variableId: "selector" },
                },
              ],
            },
          ],
        },
      },
      { blocks: [block], variables, mode: "player" },
    );

    expect(html).toContain("Live");
    expect(html).not.toContain("Base");
  });
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

  it("disables native image dragging so the Canvas owns pointer drags", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "image",
            type: "image",
            image: {
              assetId: "image-1",
              revision: "revision-1",
              url: "https://example.com/image.png",
              width: 320,
              height: 180,
              alt: "Stage lights",
              mimeType: "image/png",
              blurHash: null,
            },
          },
        ],
      },
    });

    expect(html).toMatch(/<img[^>]*data-element-id="image"[^>]*draggable="false"/);
  });

  it("defaults image fitting to cover and center and serializes overrides", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "default-image",
            type: "image",
            image: {
              assetId: "image-1",
              revision: "revision-1",
              url: "https://example.com/image.png",
              width: 320,
              height: 180,
              alt: "",
              mimeType: "image/png",
              blurHash: null,
            },
          },
          {
            id: "positioned-image",
            type: "image",
            objectFit: "contain",
            objectPosition: "right bottom",
            image: {
              assetId: "image-2",
              revision: "revision-2",
              url: "https://example.com/other.png",
              width: 320,
              height: 180,
              alt: "",
              mimeType: "image/png",
              blurHash: null,
            },
          },
        ],
      },
    });

    expect(html).toContain("object-fit:cover");
    expect(html).toContain("object-position:center");
    expect(html).toContain("object-fit:contain");
    expect(html).toContain("object-position:right bottom");
  });

  it("leaves an image without a fill transparent", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "image",
            type: "image",
            image: {
              assetId: "image-1",
              revision: "revision-1",
              url: "https://example.com/image.png",
              width: 320,
              height: 180,
              alt: "",
              mimeType: "image/png",
              blurHash: null,
            },
          },
        ],
      },
    });

    expect(html).not.toContain("background-color:#e5e7eb");
  });

  it("does not replace an image fill with the blur placeholder", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "image",
            type: "image",
            fill: "#123456",
            image: {
              assetId: "image-1",
              revision: "revision-1",
              url: "https://example.com/image.png",
              width: 320,
              height: 180,
              alt: "",
              mimeType: "image/png",
              blurHash: "blur-hash",
            },
          },
        ],
      },
    });

    expect(html).toContain("background-color:#123456");
    expect(html).not.toContain("background-color:#d8dee9");
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
        children: [{ id: "child", type: "rect", sizing: { width: { mode: "fill" } } }],
      },
    });

    expect(html).toContain("display:flex");
    expect(html).toContain("flex-direction:row");
    expect(html).toContain("gap:12px");
    expect(html).toContain("padding:20px");
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("width:100%");
  });
  it("applies authored padding to text elements", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "text",
            type: "text",
            padding: { top: 4, right: 8, bottom: 12, left: 16 },
            content: "Padded text",
          },
        ],
      },
    });

    expect(html).toContain("padding:4px 8px 12px 16px");
  });
  it("supports text hug sizing and clipping or ellipsis overflow", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "hugged",
            type: "text",
            content: "Hugged",
            sizing: {
              width: { mode: "hug" },
              height: { mode: "hug" },
            },
          },
          {
            id: "clipped",
            type: "text",
            content: "Clipped",
            sizing: {
              width: { mode: "fixed", value: 80 },
              height: { mode: "fixed", value: 20 },
            },
            textOverflow: "clip",
          },
          {
            id: "truncated",
            type: "text",
            content: "Truncated",
            sizing: {
              width: { mode: "fixed", value: 80 },
              height: { mode: "fixed", value: 20 },
            },
            textOverflow: "ellipsis",
          },
        ],
      },
    });

    expect(html).toContain('data-element-id="hugged"');
    expect(html).toContain("width:max-content");
    expect(html).toContain("height:max-content");
    expect(html).toContain('data-element-id="clipped"');
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("text-overflow:clip");
    expect(html).toContain('data-element-id="truncated"');
    expect(html).toMatch(
      /data-element-id="truncated"[^>]*>.*<span style="display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Truncated<\/span>/,
    );
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("white-space:nowrap");
  });
  it("renders numeric line height as pixels", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [{ id: "text", type: "text", content: "Line height", lineHeight: 24 }],
      },
    });

    expect(html).toContain("line-height:24px");
  });
  it("renders text weight, style, and decoration", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "text",
            type: "text",
            content: "Styled",
            fontWeight: 700,
            fontStyle: "italic",
            textDecoration: "underline",
          },
        ],
      },
    });

    expect(html).toContain("font-weight:700");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("text-decoration:underline");
  });
  it("renders text vertical alignment", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          { id: "top", type: "text", content: "Top", textVerticalAlign: "top" },
          { id: "center", type: "text", content: "Center", textVerticalAlign: "center" },
          { id: "bottom", type: "text", content: "Bottom", textVerticalAlign: "bottom" },
        ],
      },
    });

    expect(html.match(/justify-content:flex-start/g)).toHaveLength(1);
    expect(html.match(/justify-content:center/g)).toHaveLength(1);
    expect(html.match(/justify-content:flex-end/g)).toHaveLength(1);
  });
  it("renders numeric-string line height as pixels and maps auto to a normal default", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          { id: "pixels", type: "text", content: "Pixels", lineHeight: "24" },
          { id: "auto", type: "text", content: "Auto", lineHeight: "auto" },
          { id: "missing", type: "text", content: "Missing" },
        ],
      },
    });

    expect(html).toContain("line-height:24px");
    expect(html.match(/line-height:normal/g)).toHaveLength(2);
    expect(html).not.toContain("line-height:auto");
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
  it("renders corner radii on images", () => {
    const html = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "rounded-image",
            type: "image",
            cornerRadius: 24,
            image: { assetId: "asset-1", revision: "1" },
          },
        ],
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
        children: [{ id: "child", type: "rect", sizing: { width: { mode: "fill" } } }],
      },
    });
    const horizontalHeightFill = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        children: [{ id: "child", type: "rect", sizing: { height: { mode: "fill" } } }],
      },
    });
    const verticalHeightFill = markup({
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        layoutMode: "auto",
        direction: "vertical",
        children: [{ id: "child", type: "rect", sizing: { height: { mode: "fill" } } }],
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
            sizing: {
              width: { mode: "fixed", value: 80 },
              height: { mode: "fixed", value: 40 },
              minWidth: { value: 100, unit: "%" },
            },
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
            stroke: { color: "black", style: "solid", width: 4 },
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
    expect(html).toContain("background-clip:border-box");
    expect(html).toContain("background-origin:border-box");
    expect(html).toContain("border-width:4px");
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
  it("makes only the active text Element editable", () => {
    const html = renderToStaticMarkup(
      createElement(CanvasRenderer, {
        canvas: {
          kind: "scene",
          root: {
            id: "root",
            type: "frame",
            children: [
              { id: "active", type: "text", content: "Edit me" },
              { id: "inactive", type: "text", content: "Leave me" },
            ],
          },
        },
        editingElementId: "active",
        onTextDoubleClick: () => {},
        onTextKeyDown: () => {},
      }),
    );

    expect(html).toMatch(/data-element-id="active"[^>]*user-select:text/);
    expect(html).toMatch(/data-element-id="inactive"[^>]*user-select:none/);
  });
});
