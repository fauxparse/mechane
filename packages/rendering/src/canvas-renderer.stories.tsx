import type { Meta, StoryObj } from "@storybook/react-vite";
import { createElement } from "react";

import type { Canvas, FrameElement } from "@mechane/domain/canvas";
import { prepareCanvasForRender } from "./canvas-presentation";
import { CanvasRenderer } from "./canvas-renderer";

const sampleImage = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
    <defs>
      <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#31748f"/>
        <stop offset="1" stop-color="#eb6f92"/>
      </linearGradient>
    </defs>
    <rect width="320" height="180" fill="url(#sky)"/>
    <circle cx="238" cy="58" r="28" fill="#f6c177"/>
    <path d="M0 150 72 88l48 38 54-60 146 84v30H0Z" fill="#191724"/>
    <path d="m0 152 72-64 48 38 54-60 146 84" fill="none" stroke="#9ccfd8" stroke-width="4"/>
  </svg>
`)}`;

const canvas: Canvas = {
  kind: "scene",
  root: {
    id: "scene-root",
    type: "frame",
    layoutMode: "absolute",
    fill: "#191724",
    children: [
      {
        id: "title",
        type: "text",
        rank: "a",
        content: "A shared Canvas renderer",
        color: "#f6f1f4",
        fontSize: 28,
        sizing: {
          width: { mode: "fixed", value: { value: 360, unit: "px" } },
          height: { mode: "hug" },
        },
        anchor: { horizontal: "center", vertical: "top", offsetY: 32 },
      },
      {
        id: "auto-frame",
        type: "frame",
        rank: "b",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 16,
        padding: 16,
        alignPrimary: "center",
        alignCounter: "center",
        sizing: {
          width: { mode: "fixed", value: { value: 540, unit: "px" } },
          height: { mode: "fixed", value: { value: 180, unit: "px" } },
        },
        anchor: { horizontal: "center", vertical: "center" },
        fill: {
          kind: "linear",
          angle: 90,
          stops: [
            { color: "#eb6f92", position: 0 },
            { color: "#c4a7e7", position: 0.5 },
            { color: "#9ccfd8", position: 1 },
          ],
        },
        children: [
          {
            id: "card-one",
            type: "rect",
            rank: "a",
            sizing: {
              width: { mode: "fixed", value: 120 },
              height: { mode: "fixed", value: 100 },
            },
            cornerRadius: 12,
            fill: "#26233a",
          },
          {
            id: "card-two",
            type: "frame",
            rank: "b",
            layoutMode: "absolute",
            sizing: {
              width: { mode: "fixed", value: 120 },
              height: { mode: "fixed", value: 100 },
            },
            padding: 8,
            fill: {
              kind: "radial",
              stops: [
                { color: "#31748f", position: 0 },
                { color: "#26233a", position: 1 },
              ],
            },
            children: [
              {
                id: "rotated-copy",
                type: "text",
                content: "90°",
                color: "#f6f1f4",
                fontSize: 24,
                layout: { rotation: 90 },
                sizing: {
                  width: { mode: "hug" },
                  height: { mode: "hug" },
                },
                anchor: { horizontal: "center", vertical: "center" },
              },
            ],
          },
        ],
      },
    ],
  },
};

const primitiveCanvas: Canvas = {
  kind: "block",
  root: {
    id: "primitive-root",
    type: "frame",
    sizing: {
      width: { mode: "fixed", value: 720 },
      height: { mode: "fixed", value: 420 },
    },
    fill: "#2a273f",
    children: [
      {
        id: "solid-card",
        name: "Solid card",
        type: "rect",
        rank: "a",
        sizing: {
          width: { mode: "fixed", value: 190 },
          height: { mode: "fixed", value: 130 },
        },
        cornerRadius: 24,
        opacity: 0.92,
        blendMode: "screen",
        fill: "#eb6f92",
        anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 24 },
      },
      {
        id: "text-card",
        name: "Text with constraints",
        type: "text",
        rank: "b",
        content: "Text can wrap, align, and use authored typography values.",
        color: "#f6f1f4",
        fontFamily: "Georgia, serif",
        fontSize: 23,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: 0.4,
        textAlign: "justify",
        padding: { top: 12, right: 16, bottom: 12, left: 16 },
        sizing: {
          width: { mode: "fixed", value: { value: 260, unit: "px" } },
          height: { mode: "hug" },
          minWidth: { value: 180, unit: "px" },
          maxWidth: { value: 300, unit: "px" },
        },
        anchor: { horizontal: "center", vertical: "top", offsetY: 42 },
      },
      {
        id: "image-card",
        name: "Image using a resolved image value",
        type: "image",
        rank: "c",
        image: {
          assetId: "i-demo",
          revision: "demo",
          url: sampleImage,
          width: 320,
          height: 180,
          alt: "A stylized mountain landscape",
          mimeType: "image/svg+xml",
          blurHash: null,
        },
        objectFit: "cover",
        layout: { aspectRatio: { ratio: 16 / 9, driver: "width" } },
        sizing: {
          width: { mode: "fixed", value: 250 },
          height: { mode: "fixed", value: 150 },
        },
        anchor: { horizontal: "right", vertical: "bottom", offsetX: 24, offsetY: 24 },
      },
      {
        id: "hidden-decoration",
        type: "rect",
        rank: "d",
        hidden: true,
        sizing: {
          width: { mode: "fixed", value: 24 },
          height: { mode: "fixed", value: 24 },
        },
        fill: "#f6c177",
      },
    ],
  },
};

const autoLayoutCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "auto-layout-root",
    type: "frame",
    layoutMode: "auto",
    direction: "vertical",
    gap: 18,
    padding: { top: 28, right: 32, bottom: 28, left: 32 },
    alignPrimary: "space-between",
    alignCounter: "centre",
    fill: "#191724",
    children: [
      {
        id: "auto-header",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 12,
        padding: 12,
        alignPrimary: "space-between",
        alignCounter: "center",
        sizing: {
          width: { mode: "fill" },
          height: { mode: "hug" },
        },
        fill: {
          kind: "linear",
          angle: 135,
          stops: [
            { color: "#26233a", position: 0 },
            { color: "#44415a", position: 0.5 },
            { color: "#31748f", position: 1 },
          ],
        },
        children: [
          {
            id: "header-label",
            type: "text",
            content: "AUTO LAYOUT",
            fontSize: 16,
            fontWeight: "bold",
            color: "#f6f1f4",
            sizing: {
              width: { mode: "hug" },
              height: { mode: "hug" },
            },
          },
          {
            id: "header-status",
            type: "text",
            content: "Live",
            fontSize: 14,
            color: "#9ccfd8",
            sizing: {
              width: { mode: "hug" },
              height: { mode: "hug" },
            },
          },
        ],
      },
      {
        id: "auto-content",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 14,
        padding: { top: 14, right: 14, bottom: 14, left: 14 },
        alignPrimary: "space-evenly",
        alignCounter: "end",
        sizing: {
          width: { mode: "fill" },
          height: { mode: "fill" },
        },
        fill: "#26233a",
        children: [
          {
            id: "fill-panel",
            type: "frame",
            layoutMode: "auto",
            direction: "vertical",
            gap: 8,
            padding: 18,
            alignPrimary: "center",
            alignCounter: "center",
            sizing: {
              width: { mode: "fill" },
              height: { mode: "fill" },
            },
            fill: "#393552",
            children: [
              {
                id: "fill-panel-title",
                type: "text",
                content: "Fill",
                color: "#f6c177",
                fontSize: 24,
                textAlign: "center",
                sizing: {
                  width: { mode: "fill" },
                  height: { mode: "hug" },
                },
              },
              {
                id: "fill-panel-copy",
                type: "text",
                content: "This panel grows with its parent.",
                color: "#e0def4",
                fontSize: 14,
                sizing: {
                  width: { mode: "fill" },
                  height: { mode: "hug" },
                },
              },
            ],
          },
          {
            id: "hug-panel",
            type: "frame",
            layoutMode: "auto",
            direction: "vertical",
            gap: 6,
            padding: { top: 20, right: 28, bottom: 20, left: 28 },
            alignPrimary: "center",
            alignCounter: "center",
            sizing: {
              width: { mode: "hug" },
              height: { mode: "hug" },
            },
            fill: "#eb6f92",
            children: [
              {
                id: "hug-panel-title",
                type: "text",
                content: "Hug",
                color: "#191724",
                fontSize: 24,
                fontWeight: 800,
                sizing: {
                  width: { mode: "hug" },
                  height: { mode: "hug" },
                },
              },
              {
                id: "hug-panel-copy",
                type: "text",
                content: "Natural size",
                color: "#191724",
                fontSize: 13,
                sizing: {
                  width: { mode: "hug" },
                  height: { mode: "hug" },
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

const constraintsCanvas: Canvas = {
  kind: "block",
  root: {
    id: "constraints-root",
    type: "frame",
    layoutMode: "absolute",
    fill: "#1f1d2e",
    children: [
      {
        id: "top-left-rotation",
        type: "text",
        rank: "a",
        content: "0°\nleft / top",
        color: "#f6c177",
        fontSize: 18,
        sizing: {
          width: { mode: "fixed", value: { value: 130, unit: "%" } },
          height: { mode: "fixed", value: 72 },
        },
        anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 24 },
      },
      {
        id: "right-center-rotation",
        type: "text",
        rank: "b",
        content: "90°\nright / center",
        layout: { rotation: 90 },
        color: "#9ccfd8",
        fontSize: 18,
        sizing: {
          width: { mode: "fixed", value: 72 },
          height: { mode: "fixed", value: 130 },
          maxWidth: 90,
        },
        anchor: { horizontal: "right", vertical: "center", offsetX: 18 },
      },
      {
        id: "bottom-center-rotation",
        type: "text",
        rank: "c",
        content: "180°\ncenter / bottom",
        layout: { rotation: 180, aspectRatio: { ratio: 2.5, driver: "width" } },
        color: "#c4a7e7",
        fontSize: 18,
        sizing: {
          width: { mode: "fixed", value: 160 },
          height: { mode: "fixed", value: 64 },
        },
        anchor: { horizontal: "center", vertical: "bottom", offsetY: 24 },
      },
      {
        id: "bottom-left-rotation",
        type: "text",
        rank: "d",
        content: "270°\nleft / bottom",
        layout: { rotation: 270 },
        color: "#eb6f92",
        fontSize: 18,
        sizing: {
          width: { mode: "fixed", value: 72 },
          height: { mode: "fixed", value: 130 },
          minHeight: { value: 90, unit: "%" },
        },
        anchor: { horizontal: "left", vertical: "bottom", offsetX: 18, offsetY: 18 },
      },
      {
        id: "constraint-square",
        type: "rect",
        rank: "e",
        sizing: {
          width: { mode: "fixed", value: 96 },
          height: { mode: "fixed", value: 96 },
          minWidth: 80,
          maxWidth: 120,
          minHeight: 80,
          maxHeight: 120,
        },
        cornerRadius: 48,
        fill: "#f6c177",
        anchor: { horizontal: "center", vertical: "center" },
      },
    ],
  },
};

const gradientOverflowCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "gradient-root",
    type: "frame",
    layoutMode: "absolute",
    fill: {
      kind: "linear",
      angle: 0,
      stops: [
        { color: "#191724", position: -0.2 },
        { color: "#26233a", position: 0.3 },
        { color: "#393552", position: 0.65 },
        { color: "#eb6f92", position: 1.2 },
      ],
    },
    children: [
      {
        id: "overflow-frame",
        type: "frame",
        layoutMode: "absolute",
        clip: false,
        sizing: {
          width: { mode: "fixed", value: 220 },
          height: { mode: "fixed", value: 160 },
        },
        padding: { top: 18, right: 28, bottom: 18, left: 28 },
        fill: {
          kind: "radial",
          stops: [
            { color: "#9ccfd8", position: 0 },
            { color: "#31748f", position: 0.35 },
            { color: "#26233a", position: 1 },
          ],
        },
        anchor: { horizontal: "center", vertical: "center" },
        children: [
          {
            id: "overflow-label",
            type: "text",
            content: "Visible outside the frame",
            color: "#f6f1f4",
            fontSize: 24,
            fontWeight: 700,
            sizing: {
              width: { mode: "fixed", value: 420 },
              height: { mode: "hug" },
            },
            anchor: { horizontal: "left", vertical: "top", offsetX: -100, offsetY: 38 },
          },
          {
            id: "clipped-frame",
            type: "frame",
            layoutMode: "absolute",
            clip: true,
            sizing: {
              width: { mode: "fixed", value: 128 },
              height: { mode: "fixed", value: 72 },
            },
            fill: "#191724",
            anchor: { horizontal: "center", vertical: "bottom", offsetY: 12 },
            children: [
              {
                id: "clipped-label",
                type: "text",
                content: "Clipped",
                color: "#f6c177",
                fontSize: 20,
                sizing: {
                  width: { mode: "fixed", value: 220 },
                  height: { mode: "hug" },
                },
                anchor: { horizontal: "left", vertical: "center", offsetX: -42 },
              },
            ],
          },
        ],
      },
    ],
  },
};

const imageCanvas: Canvas = {
  kind: "block",
  root: {
    id: "image-root",
    type: "frame",
    layoutMode: "auto",
    direction: "horizontal",
    gap: 12,
    padding: 16,
    alignPrimary: "center",
    alignCounter: "center",
    fill: "#26233a",
    children: (["contain", "cover", "none", "scale-down"] as const).map((objectFit, index) => ({
      id: `image-${objectFit}`,
      type: "frame" as const,
      layoutMode: "auto" as const,
      direction: "vertical" as const,
      gap: 8,
      padding: 8,
      sizing: { width: { mode: "fixed" as const, value: 150 }, height: { mode: "hug" as const } },
      alignPrimary: "center" as const,
      alignCounter: "center" as const,
      fill: index % 2 === 0 ? "#393552" : "#44415a",
      children: [
        {
          id: `image-label-${objectFit}`,
          type: "text" as const,
          content: objectFit,
          color: "#e0def4",
          fontSize: 13,
          sizing: {
            width: { mode: "hug" as const },
            height: { mode: "hug" as const },
          },
        },
        {
          id: `image-${objectFit}-content`,
          type: "image" as const,
          image: {
            assetId: "i-demo",
            revision: "demo",
            url: sampleImage,
            width: 320,
            height: 180,
            alt: `Sample image using ${objectFit}`,
            mimeType: "image/svg+xml",
            blurHash: null,
          },
          alt: `Sample image using ${objectFit}`,
          objectFit,
          sizing: {
            width: { mode: "fixed" as const, value: 130 },
            height: { mode: "fixed" as const, value: 100 },
          },
        },
      ],
    })),
  },
};

const responsiveSceneCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "responsive-scene-root",
    type: "frame",
    layoutMode: "auto",
    direction: "vertical",
    gap: 12,
    padding: 16,
    fill: "#191724",
    sizing: {
      width: { mode: "fill" },
      height: { mode: "fill" },
      minWidth: { value: 320, unit: "px" },
      minHeight: { value: 240, unit: "px" },
    },
    children: [
      {
        id: "responsive-header",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 12,
        padding: { top: 12, right: 16, bottom: 12, left: 16 },
        alignPrimary: "space-between",
        alignCounter: "center",
        sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
        fill: "#31748f",
        children: [
          {
            id: "responsive-title",
            type: "text",
            content: "Responsive scene",
            color: "#f6f1f4",
            fontSize: 18,
            fontWeight: 700,
            sizing: { width: { mode: "hug" }, height: { mode: "hug" } },
          },
          {
            id: "responsive-status",
            type: "text",
            content: "fill × fill",
            color: "#9ccfd8",
            fontSize: 13,
            sizing: { width: { mode: "hug" }, height: { mode: "hug" } },
          },
        ],
      },
      {
        id: "responsive-body",
        type: "frame",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 12,
        padding: 12,
        fill: "#26233a",
        sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
        children: [
          {
            id: "responsive-panel",
            type: "frame",
            layoutMode: "auto",
            direction: "vertical",
            gap: 8,
            padding: 16,
            alignPrimary: "center",
            alignCounter: "center",
            sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
            fill: "#393552",
            children: [
              {
                id: "responsive-panel-copy",
                type: "text",
                content:
                  "In the Player this scene tracks the viewport on both axes. Drag the dashed corner to resize.",
                color: "#e0def4",
                fontSize: 15,
                textAlign: "center",
                sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
              },
            ],
          },
          {
            id: "responsive-fixed-card",
            type: "rect",
            sizing: { width: { mode: "fixed", value: 96 }, height: { mode: "fixed", value: 96 } },
            cornerRadius: 16,
            fill: "#eb6f92",
          },
        ],
      },
      {
        id: "responsive-footer",
        type: "text",
        content:
          "Root minimums (320 × 240) feed the editor preview; the Player never enforces them.",
        color: "#908caa",
        fontSize: 12,
        sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
      },
    ],
  },
};

const responsiveMixedCanvas: Canvas = {
  kind: "scene",
  root: {
    id: "responsive-mixed-root",
    type: "frame",
    layoutMode: "absolute",
    fill: "#26233a",
    sizing: {
      width: { mode: "fill" },
      height: { mode: "fixed", value: 320 },
      minWidth: { value: 280, unit: "px" },
      minHeight: { value: 200, unit: "px" },
    },
    children: [
      {
        id: "mixed-axis-label",
        type: "text",
        rank: "a",
        content: "Fill width, fixed 320px height",
        color: "#f6f1f4",
        fontSize: 18,
        lineHeight: 1.4,
        sizing: { width: { mode: "fixed", value: 300 }, height: { mode: "hug" } },
        anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 24 },
      },
      {
        id: "mixed-fixed-square",
        type: "rect",
        rank: "b",
        sizing: { width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 120 } },
        cornerRadius: 20,
        fill: "#f6c177",
        anchor: { horizontal: "right", vertical: "bottom", offsetX: 24, offsetY: 24 },
      },
    ],
  },
};

const directFrame: FrameElement = {
  id: "direct-frame",
  type: "frame",
  layoutMode: "auto",
  direction: "vertical",
  gap: 10,
  padding: 24,
  alignPrimary: "center",
  alignCounter: "center",
  fill: "#393552",
  children: [
    {
      id: "direct-frame-title",
      type: "text",
      content: "A Frame can be rendered directly",
      color: "#f6f1f4",
      fontSize: 24,
      sizing: {
        width: { mode: "hug" },
        height: { mode: "hug" },
      },
    },
    {
      id: "direct-frame-body",
      type: "text",
      content: "This exercises the CanvasRenderer FrameElement input.",
      color: "#e0def4",
      fontSize: 15,
      textAlign: "center",
      sizing: {
        width: { mode: "fixed", value: 300 },
        height: { mode: "hug" },
      },
    },
  ],
};
function storyPresentation(canvas: Canvas | FrameElement, mode: "studio" | "player" = "studio") {
  return prepareCanvasForRender({
    canvas: "root" in canvas ? canvas : { root: canvas },
    variables: [],
    shapes: [],
    blocks: [],
    imageAssets: [],
    mode,
  });
}

function playerViewport(canvas: Canvas, width: number, height: number) {
  return createElement(
    "div",
    {
      style: {
        width,
        height,
        minWidth: 200,
        minHeight: 140,
        resize: "both",
        overflow: "hidden",
        border: "1px dashed #6e6a86",
      },
    },
    createElement(CanvasRenderer, { presentation: storyPresentation(canvas, "player") }),
  );
}

const meta: Meta<typeof CanvasRenderer> = {
  title: "rendering/CanvasRenderer",
  component: CanvasRenderer,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof CanvasRenderer>;

export const MixedLayout: Story = {
  args: {
    presentation: storyPresentation(canvas),
    style: { width: 640, height: 360, background: "#191724" },
  },
};

export const PrimitiveElements: Story = {
  args: {
    presentation: storyPresentation(primitiveCanvas),
    style: { width: 720, height: 420 },
  },
};

export const AutoLayout: Story = {
  args: {
    presentation: storyPresentation(autoLayoutCanvas),
    style: { width: 720, height: 480 },
  },
};

export const ConstraintsAndRotations: Story = {
  args: {
    presentation: storyPresentation(constraintsCanvas),
    style: { width: 640, height: 420 },
  },
};

export const GradientsAndOverflow: Story = {
  args: {
    presentation: storyPresentation(gradientOverflowCanvas),
    style: { width: 640, height: 420 },
  },
};

export const ImageObjectFitModes: Story = {
  args: {
    presentation: storyPresentation(imageCanvas),
    style: { width: 720, height: 260 },
  },
};

export const DirectFrame: Story = {
  args: {
    presentation: storyPresentation(directFrame),
    style: { width: 420, height: 220 },
  },
};

export const PlayerResponsiveScene: Story = {
  render: () => playerViewport(responsiveSceneCanvas, 480, 360),
};

export const PlayerMixedSceneAxes: Story = {
  render: () => playerViewport(responsiveMixedCanvas, 480, 320),
};
