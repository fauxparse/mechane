import { describe, expect, it } from "vitest";

import {
  applyHandleOffsets,
  cornerRadius,
  edgeGeometry,
  edgeHandles,
  type Segment,
} from "./edge-path";
import { routeSmoothStep, type Point, type Side } from "./edge-routing";

/** A straight run of `points` as the router would hand them over. */
function polyline(...coordinates: [number, number][]): Point[] {
  return coordinates.map(([x, y]) => ({ x, y }));
}

/** The first and last coordinate pairs a path command string visits. */
function endpointsOf(d: string): { start: Point; end: Point } {
  const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const start = { x: numbers[0] ?? 0, y: numbers[1] ?? 0 };
  const end = { x: numbers.at(-2) ?? 0, y: numbers.at(-1) ?? 0 };
  return { start, end };
}

function endpoint(x: number, y: number, side: Side) {
  const rect = { x, y, width: 240, height: 56 };
  const point = {
    right: { x: x + rect.width, y: y + rect.height / 2 },
    left: { x, y: y + rect.height / 2 },
    top: { x: x + rect.width / 2, y },
    bottom: { x: x + rect.width / 2, y: y + rect.height },
  }[side];
  return { point, side, rect };
}

describe("cornerRadius", () => {
  const long = polyline([0, 0], [200, 0], [200, 200], [400, 200]);

  it("caps at the maximum however long the runs are", () => {
    expect(cornerRadius(long, 1, 8)).toBe(8);
    expect(cornerRadius(long, 2, 8)).toBe(8);
  });

  it("takes half the shorter run when that is tighter than the cap", () => {
    const tight = polyline([0, 0], [10, 0], [10, 200], [400, 200]);
    expect(cornerRadius(tight, 1, 8)).toBe(5);
  });

  it("lets two corners on one short run meet exactly in its middle", () => {
    const short = polyline([0, 0], [100, 0], [100, 12], [200, 12]);
    expect(cornerRadius(short, 1, 8) + cornerRadius(short, 2, 8)).toBe(12);
  });

  it("is zero at the ends of the route", () => {
    expect(cornerRadius(long, 0, 8)).toBe(0);
    expect(cornerRadius(long, long.length - 1, 8)).toBe(0);
  });

  it("is zero at a reversal, which is a hairpin rather than a corner", () => {
    const reversal = polyline([0, 0], [200, 0], [180, 0]);
    expect(cornerRadius(reversal, 1, 8)).toBe(0);
  });
});

describe("edgeGeometry", () => {
  const points = polyline([0, 0], [200, 0], [200, 200], [400, 200]);
  const geometry = edgeGeometry(points, { maxRadius: 8 });

  it("makes one segment per straight run", () => {
    expect(geometry.segments).toHaveLength(3);
    expect(geometry.segments.map((s) => s.orientation)).toEqual([
      "horizontal",
      "vertical",
      "horizontal",
    ]);
  });

  it("only makes the interior segments draggable", () => {
    expect(geometry.segments.map((s) => s.draggable)).toEqual([false, true, false]);
  });

  it("starts at the source and ends at the target", () => {
    const first = geometry.segments.at(0);
    const last = geometry.segments.at(-1);
    expect(endpointsOf(first?.d ?? "").start).toEqual(points.at(0));
    expect(endpointsOf(last?.d ?? "").end).toEqual(points.at(-1));
  });

  it("joins each segment's path to the next without a gap", () => {
    for (const [index, segment] of geometry.segments.entries()) {
      const next = geometry.segments[index + 1];
      if (!next) continue;
      expect(endpointsOf(segment.d).end).toEqual(endpointsOf(next.d).start);
    }
  });

  it("never lets a run's two corners consume more than the run", () => {
    for (const [index, segment] of geometry.segments.entries()) {
      const start = cornerRadius(points, index, 8);
      const end = cornerRadius(points, index + 1, 8);
      expect(start + end).toBeLessThanOrEqual(segment.length);
    }
  });

  describe("blend positions", () => {
    it("gives the runs touching each node that node's color exactly", () => {
      expect(geometry.segments.map((s) => s.position)).toEqual([0, 0.5, 1]);
    });

    it("puts both ends on a two-segment route", () => {
      const corner = edgeGeometry(polyline([0, 0], [100, 0], [100, 100]));
      expect(corner.segments.map((s) => s.position)).toEqual([0, 1]);
    });

    it("takes the middle of the blend when there is only one run to color", () => {
      expect(edgeGeometry(polyline([0, 0], [100, 0])).segments.map((s) => s.position)).toEqual([
        0.5,
      ]);
    });

    it("spreads the interior runs by length rather than by index", () => {
      // Five runs, the middle one ninety times the length of its neighbours.
      const lopsided = edgeGeometry(
        polyline([0, 0], [10, 0], [10, 10], [910, 10], [910, 20], [920, 20]),
      );
      const positions = lopsided.segments.map((s) => s.position);
      expect(positions[0]).toBe(0);
      expect(positions[4]).toBe(1);
      expect(positions[1]).toBeLessThan(0.02);
      expect(positions[2]).toBeCloseTo(0.5, 2);
      expect(positions[3]).toBeGreaterThan(0.98);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });
  });
});

describe("label anchor", () => {
  const centre = (segments: readonly Segment[], index: number) => segments[index]?.midpoint;

  it("sits on the middle segment of an odd route", () => {
    const geometry = edgeGeometry(polyline([0, 0], [100, 0], [100, 100], [200, 100]));
    expect(geometry.label.segmentIndex).toBe(1);
    expect(geometry.label.point).toEqual(centre(geometry.segments, 1));
  });

  it("rounds down on an even route", () => {
    const geometry = edgeGeometry(polyline([0, 0], [100, 0], [100, 100], [200, 100], [200, 200]));
    expect(geometry.segments).toHaveLength(4);
    expect(geometry.label.segmentIndex).toBe(1);
  });

  it("sits on the middle of five segments", () => {
    const geometry = edgeGeometry(
      polyline([0, 0], [50, 0], [50, 100], [150, 100], [150, 200], [250, 200]),
    );
    expect(geometry.segments).toHaveLength(5);
    expect(geometry.label.segmentIndex).toBe(2);
  });

  it("falls back to the midpoint of the path when nothing is interior", () => {
    const geometry = edgeGeometry(polyline([0, 0], [100, 0], [100, 100]));
    expect(geometry.label.segmentIndex).toBeNull();
    expect(geometry.label.point).toEqual({ x: 100, y: 0 });
  });

  it("falls back on a straight route too", () => {
    const geometry = edgeGeometry(polyline([0, 0], [100, 0]));
    expect(geometry.label.segmentIndex).toBeNull();
    expect(geometry.label.point).toEqual({ x: 50, y: 0 });
  });
});

describe("edgeHandles", () => {
  it("offers one handle per interior segment, perpendicular to it", () => {
    const geometry = edgeGeometry(
      polyline([0, 0], [50, 0], [50, 100], [150, 100], [150, 200], [250, 200]),
    );
    expect(edgeHandles(geometry)).toEqual([
      { segmentIndex: 1, point: { x: 50, y: 50 }, orientation: "vertical" },
      { segmentIndex: 2, point: { x: 100, y: 100 }, orientation: "horizontal" },
      { segmentIndex: 3, point: { x: 150, y: 150 }, orientation: "vertical" },
    ]);
  });

  it("offers none when the route has no interior segment", () => {
    expect(edgeHandles(edgeGeometry(polyline([0, 0], [100, 0], [100, 100])))).toEqual([]);
  });
});

describe("applyHandleOffsets", () => {
  const points = polyline([0, 0], [100, 0], [100, 200], [200, 200]);

  it("moves the whole run perpendicular to itself", () => {
    const moved = applyHandleOffsets(points, { 1: 30 });
    expect(moved).toEqual(polyline([0, 0], [130, 0], [130, 200], [200, 200]));
  });

  it("leaves the route alone for an offset of zero", () => {
    expect(applyHandleOffsets(points, { 1: 0 })).toEqual(points);
  });

  it("ignores an offset on a segment with no run on both sides", () => {
    expect(applyHandleOffsets(points, { 0: 40, 2: 40 })).toEqual(points);
  });

  it("clamps a drag so the runs either side keep their margin", () => {
    const margin = 12;
    const moved = applyHandleOffsets(points, { 1: 500 }, { margin });
    expect(moved[1]?.x).toBe(200 - margin);
    expect(moved[2]?.x).toBe(200 - margin);
  });

  it("clamps a drag in the other direction too", () => {
    const margin = 12;
    const moved = applyHandleOffsets(points, { 1: -500 }, { margin });
    expect(moved[1]?.x).toBe(margin);
    expect(moved[2]?.x).toBe(margin);
  });

  describe("on a five-segment route, where the runs beside a handle are not stubs", () => {
    // The shape of a left-to-right-facing pair that has to double back: out of
    // the source, down, along the bottom, up, into the target.
    const detour = polyline(
      [400, 220],
      [350, 220],
      [350, 750],
      [1030, 750],
      [1030, 540],
      [990, 540],
    );

    it("lets a run cross the far end of the run beside it", () => {
      // Dragging the bottom run up between the two nodes takes it past where
      // the run into the target ends, turning that run over. Nothing about
      // that is illegal, and stopping the drag short of it is the bug.
      const moved = applyHandleOffsets(detour, { 2: -350 }, { margin: 12 });
      expect(moved[2]?.y).toBe(400);
      expect(moved[3]?.y).toBe(400);
    });

    it("turns the neighbouring run over rather than refusing the drag", () => {
      const before = detour[4]!.y - detour[3]!.y;
      const after = applyHandleOffsets(detour, { 2: -350 }, { margin: 12 });
      expect(Math.sign(after[4]!.y - after[3]!.y)).toBe(-Math.sign(before));
    });

    it("still never leaves a run shorter than the margin", () => {
      for (const requested of [-198, -205, -210, -215, -222]) {
        const moved = applyHandleOffsets(detour, { 2: requested }, { margin: 12 });
        expect(Math.abs(moved[4]!.y - moved[3]!.y)).toBeGreaterThanOrEqual(12);
        expect(Math.abs(moved[2]!.y - moved[1]!.y)).toBeGreaterThanOrEqual(12);
      }
    });

    it("still defends the stubs, which may not flip into their own node", () => {
      const moved = applyHandleOffsets(detour, { 1: 10_000 }, { margin: 12 });
      // The stub out of the source keeps its direction and its margin.
      expect(moved[1]!.x).toBe(detour[0]!.x - 12);
    });
  });

  it("keeps a real route drawable after a drag that would collapse it", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(600, 300, "left"));
    const moved = applyHandleOffsets(route.points, { 1: -10_000 });
    const geometry = edgeGeometry(moved);
    for (const segment of geometry.segments) {
      expect(segment.length).toBeGreaterThan(0);
      expect(segment.d).not.toContain("NaN");
    }
  });
});
