import { describe, expect, it } from "vitest";

import { opacityFromPercent, opacityToPercent, resolveCanvasProperties } from "./canvas-properties";
import { DEVICE_SOURCE_HANDLES } from "./graph";
import type { Canvas } from "./canvas";
import type { SceneVariable, ShowGraph } from "./graph";
import type { Shape } from "./shapes";
const variables: SceneVariable[] = [
  { id: "score", name: "Score", type: "number" },
  { id: "headline", name: "Headline", type: "text" },
];

const canvas: Canvas = {
  kind: "scene",
  root: {
    id: "root",
    type: "frame",
    children: [
      {
        id: "text",
        type: "text",
        content: { kind: "variable", variableId: "headline" },
        fontSize: { kind: "variable", variableId: "score" },
        children: [],
      },
    ],
  },
};

describe("resolveCanvasProperties", () => {
  it("materialises connected values without mutating persisted Canvas data", () => {
    const resolved = resolveCanvasProperties(canvas, { variables });
    const text = resolved.root.children?.[0];

    expect(text && "content" in text ? text.content : undefined).toBe("");
    expect(text && "fontSize" in text ? text.fontSize : undefined).toBe(0);
    expect(canvas.root.children?.[0]).toMatchObject({
      content: { kind: "variable", variableId: "headline" },
      fontSize: { kind: "variable", variableId: "score" },
    });
  });

  it("materialises an assigned image reference for the renderer", () => {
    const imageCanvas: Canvas = {
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "image",
            type: "image",
            image: { assetId: "image-1", revision: "revision-1" },
          },
        ],
      },
    };

    const resolved = resolveCanvasProperties(imageCanvas, {
      variables: [],
      imageAssets: [
        {
          assetId: "image-1",
          revision: "revision-1",
          url: "http://localhost:9000/mechane/blobs/revision-1",
          width: 320,
          height: 180,
          mimeType: "image/png",
          alt: "Stage lights",
          blurHash: null,
        },
      ],
    });

    expect(resolved.root.children?.[0]).toMatchObject({
      image: {
        assetId: "image-1",
        url: "http://localhost:9000/mechane/blobs/revision-1",
      },
    });
  });

  it("uses supplied ShapeValue or raw values and defaults incompatible connections", () => {
    const resolved = resolveCanvasProperties(canvas, {
      variables,
      values: { score: { kind: "number", value: 42 }, headline: "Live" },
    });
    const text = resolved.root.children?.[0];

    expect(text && "content" in text ? text.content : undefined).toBe("Live");
    expect(text && "fontSize" in text ? text.fontSize : undefined).toBe(42);

    const incompatible = resolveCanvasProperties(
      {
        ...canvas,
        root: {
          ...canvas.root,
          children: [
            {
              id: "bad",
              type: "text",
              content: { kind: "variable", variableId: "missing" },
            },
          ],
        },
      },
      { variables },
    );
    expect(incompatible.root.children?.[0]).toMatchObject({ content: "" });
  });
  it("renders a Device QR connection as a resolved image and tracks code changes", () => {
    const graph: ShowGraph = {
      shapes: [],
      nodes: [
        {
          id: "device_qr",
          kind: "device",
          name: "Audience",
          parentId: null,
          position: { x: 0, y: 0 },
          perConnection: true,
          pairingCode: "AB23C",
        },
        {
          id: "scene_qr",
          kind: "scene",
          name: "Join",
          parentId: null,
          position: { x: 0, y: 0 },
          variables: [{ id: "variable_qr", name: "QR", type: "image" }],
        },
      ],
      edges: [
        {
          id: "edge_qr",
          kind: "wiring",
          sourceId: "device_qr",
          targetId: "scene_qr",
          sourcePath: [DEVICE_SOURCE_HANDLES.qrCode],
          targetPath: ["variable_qr"],
        },
      ],
    };
    const imageCanvas: Canvas = {
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [{ id: "qr", type: "image", image: { kind: "variable", variableId: "variable_qr" } }],
      },
    };
    const first = resolveCanvasProperties(imageCanvas, { graph, variables: graph.nodes[1]?.kind === "scene" ? graph.nodes[1].variables : [] });
    const firstImage = first.root.children?.[0];
    expect(firstImage && "image" in firstImage ? firstImage.image : undefined).toMatchObject({
      assetId: "device-qr:device_qr",
      revision: "AB23C",
      mimeType: "image/svg+xml",
    });
    const firstUrl = firstImage && "image" in firstImage && typeof firstImage.image === "object" && firstImage.image !== null && "url" in firstImage.image ? firstImage.image.url : "";
    expect(firstUrl).toMatch(/^data:image\/svg\+xml,/);
    const changedGraph: ShowGraph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "device" ? { ...node, pairingCode: "CD45E" } : node,
      ),
    };
    const changed = resolveCanvasProperties(imageCanvas, {
      graph: changedGraph,
      variables: graph.nodes[1]?.kind === "scene" ? graph.nodes[1].variables : [],
    });
    const changedImage = changed.root.children?.[0];
    const changedUrl = changedImage && "image" in changedImage && typeof changedImage.image === "object" && changedImage.image !== null && "url" in changedImage.image ? changedImage.image.url : "";
    expect(changedUrl).not.toBe(firstUrl);

  });
  it("resolves a Shape Field path before coercing an Element property", () => {
    const candidate: Shape = {
      id: "shape_candidate",
      name: "Candidate",
      fields: [
        { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
        { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
      ],
    };
    const shapeCanvas: Canvas = {
      kind: "scene",
      root: {
        id: "root",
        type: "frame",
        children: [
          {
            id: "name",
            type: "text",
            content: { kind: "variable", variableId: "candidate", fieldPath: ["field_name"] },
          },
          {
            id: "votes",
            type: "text",
            content: { kind: "variable", variableId: "candidate", fieldPath: ["field_votes"] },
          },
        ],
      },
    };
    const resolved = resolveCanvasProperties(shapeCanvas, {
      variables: [{ id: "candidate", name: "Candidate", type: { kind: "shape", shapeId: candidate.id } }],
      shapes: [candidate],
      values: { candidate: { field_name: "Alice", field_votes: 12 } },
    });
    expect(resolved.root.children?.[0]).toMatchObject({ content: "Alice" });
    expect(resolved.root.children?.[1]).toMatchObject({ content: "12" });
  });
  it("converts opacity at the inspector boundary", () => {
    expect(opacityToPercent(0.42)).toBe(42);
    expect(opacityFromPercent(42)).toBe(0.42);
  });
});
