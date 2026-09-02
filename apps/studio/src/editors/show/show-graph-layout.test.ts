import type { ShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  FLOW_HEADER_HEIGHT,
  FLOW_NODE_TYPE,
  FLOW_PADDING,
  NODE_HEIGHT,
  NODE_WIDTH,
  PLACEHOLDER_NODE_TYPE,
} from "./graph/graph-to-flow";
import type { ShowFlowNode } from "./graph/graph-to-flow";
import {
  childrenPushedInside,
  clampIntoFlow,
  clearOfFlows,
  effectiveFlowDimensions,
  fitFlows,
  flowAtPoint,
  flowContentBox,
  moveOutPositions,
  nextChildPosition,
  relativeToFlow,
} from "./show-graph-layout";

function flowNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
): ShowFlowNode {
  return {
    id,
    type: FLOW_NODE_TYPE,
    position,
    style: size,
    data: { kind: "flow", name: id } as ShowFlowNode["data"],
  };
}

function childNode(id: string, parentId: string, position: { x: number; y: number }): ShowFlowNode {
  return {
    id,
    type: PLACEHOLDER_NODE_TYPE,
    position,
    parentId,
    style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
    data: { kind: "scene", name: id } as ShowFlowNode["data"],
  };
}

const FLOW = flowNode("flow_1", { x: 100, y: 100 }, { width: 600, height: 400 });
const OTHER = flowNode("flow_2", { x: 1000, y: 0 }, { width: 400, height: 300 });

describe("flowAtPoint", () => {
  it("finds the Flow whose box covers the point", () => {
    expect(flowAtPoint({ x: 200, y: 200 }, [FLOW, OTHER])?.id).toBe(FLOW.id);
    expect(flowAtPoint({ x: 1100, y: 100 }, [FLOW, OTHER])?.id).toBe(OTHER.id);
  });

  it("answers nothing for the bare canvas", () => {
    expect(flowAtPoint({ x: 50, y: 50 }, [FLOW, OTHER])).toBe(null);
  });

  // A node being dragged is not somewhere it can be dropped into.
  it("skips excluded Flows", () => {
    expect(flowAtPoint({ x: 200, y: 200 }, [FLOW, OTHER], new Set([FLOW.id]))).toBe(null);
  });
});

describe("clampIntoFlow", () => {
  const size = { width: NODE_WIDTH, height: NODE_HEIGHT };

  it("leaves a position that is already inside alone", () => {
    expect(clampIntoFlow(FLOW, { x: 40, y: 120 }, size)).toEqual({ x: 40, y: 120 });
  });

  // #508: a Flow-owned node is inside its Flow's box, no exceptions —
  // otherwise placement and containment tell the director different stories.
  it("pulls a node dropped past the right or bottom edge back inside", () => {
    expect(clampIntoFlow(FLOW, { x: 590, y: 390 }, size)).toEqual({
      x: 600 - FLOW_PADDING - NODE_WIDTH,
      y: 400 - FLOW_PADDING - NODE_HEIGHT,
    });
  });

  it("keeps a node clear of the header and the padding", () => {
    expect(clampIntoFlow(FLOW, { x: -100, y: 0 }, size)).toEqual({
      x: FLOW_PADDING,
      y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
    });
  });

  it("never inverts the box when the Flow is too small for the node", () => {
    const tiny = flowNode("flow_tiny", { x: 0, y: 0 }, { width: 80, height: 80 });
    const box = flowContentBox({ width: 80, height: 80 });
    expect(clampIntoFlow(tiny, { x: 500, y: 500 }, size)).toEqual({ x: box.left, y: box.top });
  });
});

describe("childrenPushedInside", () => {
  const size = { width: 400, height: 300 };

  it("leaves children a shrunk Flow still contains alone", () => {
    const child = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    expect(childrenPushedInside(size, [child])).toEqual([]);
  });

  // #508: the box wins and the children move to suit. Refusing to shrink
  // instead is a resize handle that stops working.
  it("names the children a shrunk Flow no longer holds, and where they go", () => {
    const inside = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    const crowded = childNode("scene_2", FLOW.id, { x: 500, y: 260 });
    expect(childrenPushedInside(size, [inside, crowded])).toEqual([
      {
        id: "scene_2",
        position: { x: 400 - FLOW_PADDING - NODE_WIDTH, y: 300 - FLOW_PADDING - NODE_HEIGHT },
      },
    ]);
  });

  it("stops at the content origin rather than inverting a too-small box", () => {
    const child = childNode("scene_1", FLOW.id, { x: 500, y: 500 });
    expect(childrenPushedInside({ width: 80, height: 80 }, [child])).toEqual([
      { id: "scene_1", position: { x: FLOW_PADDING, y: FLOW_HEADER_HEIGHT + FLOW_PADDING } },
    ]);
  });
});

describe("relativeToFlow", () => {
  it("rebases a canvas point onto the Flow that will own it", () => {
    const byId = new Map([[FLOW.id, FLOW]]);
    expect(relativeToFlow({ x: 250, y: 300 }, FLOW, byId)).toEqual({ x: 150, y: 200 });
  });
});

describe("nextChildPosition", () => {
  it("starts at the content origin in an empty Flow", () => {
    expect(nextChildPosition(FLOW, [])).toEqual({
      x: FLOW_PADDING,
      y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
    });
  });

  it("drops below whatever is already in there", () => {
    const existing = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    expect(nextChildPosition(FLOW, [existing]).y).toBeGreaterThan(74 + NODE_HEIGHT);
  });

  it("stays inside the box even when the column runs out of room", () => {
    const low = childNode("scene_1", FLOW.id, { x: 24, y: 380 });
    const position = nextChildPosition(FLOW, [low]);
    expect(position.y).toBeLessThanOrEqual(400 - FLOW_PADDING - NODE_HEIGHT);
  });
});

describe("clearOfFlows", () => {
  const size = { width: NODE_WIDTH, height: NODE_HEIGHT };

  it("leaves a point on open canvas where it is", () => {
    expect(clearOfFlows({ x: 20, y: 700 }, size, [FLOW, OTHER])).toEqual({ x: 20, y: 700 });
  });

  // #508: a Show-level node inside a Flow's box would read as belonging to it.
  it("moves a Show-level node off the Flow it landed on", () => {
    const position = clearOfFlows({ x: 300, y: 250 }, size, [FLOW, OTHER]);
    const covered =
      position.x < 700 &&
      position.x + NODE_WIDTH > 100 &&
      position.y < 500 &&
      position.y + NODE_HEIGHT > 100;
    expect(covered).toBe(false);
  });
});

describe("moveOutPositions", () => {
  it("lands an extracted node outside the Flow it came from", () => {
    const child = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    const [position] = moveOutPositions([child.id], [FLOW, child]);
    const stillInside =
      position!.x < 700 &&
      position!.x + NODE_WIDTH > 100 &&
      position!.y < 500 &&
      position!.y + NODE_HEIGHT > 100;
    expect(stillInside).toBe(false);
  });
});

describe("fitFlows", () => {
  function graphWith(children: { id: string; parentId: string; y: number }[]): ShowGraph {
    return {
      nodes: [
        {
          id: "flow_1",
          kind: "flow",
          name: "Flow",
          position: { x: 0, y: 0 },
          parentId: null,
          defaultSceneId: null,
        },
        ...children.map((child) => ({
          id: child.id,
          kind: "scene" as const,
          name: child.id,
          position: { x: 24, y: child.y },
          parentId: child.parentId,
          variables: [],
        })),
      ],
      edges: [],
    };
  }

  it("fits a Flow around the children it has", () => {
    const fitted = fitFlows(graphWith([{ id: "scene_1", parentId: "flow_1", y: 400 }]), new Map());
    expect(fitted.get("flow_1")?.dimensions.height).toBeGreaterThan(400);
  });

  // The whole point of #508: the box must not chase a child around.
  it("holds the size when only a child's position changes", () => {
    const before = fitFlows(graphWith([{ id: "scene_1", parentId: "flow_1", y: 74 }]), new Map());
    const after = fitFlows(graphWith([{ id: "scene_1", parentId: "flow_1", y: 900 }]), before);
    expect(after).toBe(before);
    expect(after.get("flow_1")?.dimensions).toEqual(before.get("flow_1")?.dimensions);
  });

  it("re-fits when membership changes", () => {
    const before = fitFlows(graphWith([{ id: "scene_1", parentId: "flow_1", y: 74 }]), new Map());
    const after = fitFlows(
      graphWith([
        { id: "scene_1", parentId: "flow_1", y: 74 },
        { id: "scene_2", parentId: "flow_1", y: 600 },
      ]),
      before,
    );
    expect(after.get("flow_1")?.dimensions.height).toBeGreaterThan(600);
  });
});

describe("effectiveFlowDimensions", () => {
  const fitted = new Map([["flow_1", { childKey: "", dimensions: { width: 400, height: 300 } }]]);

  it("uses the fit when the director has not resized anything", () => {
    expect(effectiveFlowDimensions(fitted, new Map()).get("flow_1")).toEqual({
      width: 400,
      height: 300,
    });
  });

  // Flooring a manual size at the fit pins every inward drag, because the fit
  // sits right against the children — the resize handle stops working.
  it("lets a manual resize shrink the box as well as grow it", () => {
    const manual = new Map([["flow_1", { width: 900, height: 200 }]]);
    expect(effectiveFlowDimensions(fitted, manual).get("flow_1")).toEqual({
      width: 900,
      height: 200,
    });
  });
});
