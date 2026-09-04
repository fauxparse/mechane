import { describe, expect, it } from "vitest";

import {
  cornerRadius,
  dragRoute,
  edgeGeometry,
  type HandleOffsets,
  type Segment,
} from "./edge-path";
import { routeSignature, routeSmoothStep, type Point, type Side } from "./edge-routing";

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

  it("makes the segments in path order", () => {
    expect(geometry.segments.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  // Dragging one run into line with another lands a float hair off square,
  // because `a + (b - a)` is not `b`. A hair is still a whole unit of sign,
  // and corner radii are shifted along the sign, so an unsquared one puts an
  // arc on the wrong axis and kinks a straight line by the corner radius.
  it("draws a run a float hair off square as square", () => {
    const noisy = polyline([0, 0], [100, 0], [100, 50], [300, 50.000000000000014], [300, 200]);
    const [move, line] = (edgeGeometry(noisy, { maxRadius: 8 }).segments[2]?.d ?? "").split(" L ");
    const startY = Number(move?.split(" ").at(-1));
    const endY = Number(line?.split(" ").at(1));

    expect(startY).toBe(50);
    expect(endY).toBe(50);
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

describe("dragRoute handles", () => {
  const long = polyline([0, 0], [200, 0], [200, 200], [400, 200]);

  it("offers one handle per interior run, perpendicular to it", () => {
    const route = polyline([0, 0], [50, 0], [50, 100], [150, 100], [150, 200], [250, 200]);
    const interior = dragRoute(route, {}, { margin: 12 }).handles.filter(
      (handle) => handle.key !== "0" && handle.key !== "4",
    );

    expect(interior).toEqual([
      { key: "1", point: { x: 50, y: 50 }, orientation: "vertical", drawnIndex: 1 },
      { key: "2", point: { x: 100, y: 100 }, orientation: "horizontal", drawnIndex: 2 },
      { key: "3", point: { x: 150, y: 150 }, orientation: "vertical", drawnIndex: 3 },
    ]);
  });

  // Without these an HVH route can never become an HVHVH one, and an edge with
  // a node standing between its two ends has no way around it.
  it("offers a handle on each run that ends at a node", () => {
    expect(dragRoute(long, {}, { margin: 12 }).handles.map((h) => h.key)).toEqual(["0", "1", "2"]);
  });

  it("puts an end run's handle past the middle, towards the bend", () => {
    const [first] = dragRoute(long, {}, { margin: 12 }).handles;
    // The run leaves the node at x=0 and bends at x=200. The handle rides what
    // is left after the jog's stub, so it sits at (12 + 200) / 2.
    expect(first?.point).toEqual({ x: 106, y: 0 });
  });

  it("leaves a run with no room for a jog without a handle", () => {
    // A 30-long stub at margin 12: the jog would leave 18 to ride, under the
    // two margins that takes.
    const cramped = polyline([0, 0], [30, 0], [30, 200], [400, 200]);
    expect(dragRoute(cramped, {}, { margin: 12 }).handles.map((h) => h.key)).toEqual(["1", "2"]);
  });

  it("offers a single centre handle on a straight route", () => {
    const straight = polyline([0, 0], [400, 0]);
    expect(dragRoute(straight, {}, { margin: 12 }).handles).toEqual([
      { key: "0", point: { x: 200, y: 0 }, orientation: "horizontal", drawnIndex: 0 },
    ]);
  });

  it("offers nothing on a straight route too short to jog twice", () => {
    expect(dragRoute(polyline([0, 0], [40, 0]), {}, { margin: 12 }).handles).toEqual([]);
  });

  // The shape from the report: an HVH dragged at both ends is drawn HVHVHVH,
  // and every run in it but the two node stubs answers to a handle.
  it("gives a jog's own run a handle, so every run but the stubs has one", () => {
    const { points, handles } = dragRoute(long, { 0: -200, 2: 200 }, { margin: 12 });

    expect(routeSignature(points)).toBe("HVHVHVH");
    expect(handles.map((handle) => handle.key)).toEqual(["0.head", "0", "1", "2", "2.tail"]);
    // Drawn runs 0 and 6 are the stubs; every other one is claimed.
    expect(handles.map((handle) => handle.drawnIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it("slides a jog along its run rather than across it", () => {
    const jogged = dragRoute(long, { 0: -200 }, { margin: 12 });
    const [jog] = jogged.handles;
    expect(jog?.key).toBe("0.head");
    // The jog cuts at the stub, so its run is the vertical at x=12.
    expect(jog?.orientation).toBe("vertical");
    expect(jog?.point).toEqual({ x: 12, y: -100 });

    const slid = dragRoute(long, { 0: -200, "0.head": 60 }, { margin: 12 });
    expect(slid.points[1]).toEqual({ x: 72, y: 0 });
    expect(slid.points[2]).toEqual({ x: 72, y: -200 });
  });

  it("keeps a jog inside its own run however far it is dragged", () => {
    for (const along of [-500, -13, 0, 500]) {
      const { points } = dragRoute(long, { 0: -200, "0.head": along }, { margin: 12 });
      const cut = points[1]?.x ?? 0;
      expect(cut).toBeGreaterThanOrEqual(12);
      expect(cut).toBeLessThanOrEqual(200 - 12);
    }
  });

  it("shares one run between the two jogs of a straight route", () => {
    const straight = polyline([0, 0], [400, 0]);
    const { points, handles } = dragRoute(
      straight,
      { 0: 80, "0.head": 500, "0.tail": 500 },
      { margin: 12 },
    );

    expect(handles.map((handle) => handle.key)).toEqual(["0.head", "0", "0.tail"]);
    const [, first, , , second] = points;
    // Both slid as far as they can, and there is still a run between them.
    expect((second?.x ?? 0) - (first?.x ?? 0)).toBeGreaterThanOrEqual(12);
  });

  it("leaves a jog too short to grab without a handle of its own", () => {
    const shallow = dragRoute(long, { 0: -20 }, { margin: 12 });
    expect(shallow.handles.map((handle) => handle.key)).toEqual(["0", "1", "2"]);
  });
});

describe("dragRoute jogs", () => {
  const hvh = polyline([0, 0], [200, 0], [200, 200], [400, 200]);

  it("cuts a jog into the run out of the source rather than moving the handle", () => {
    const { points } = dragRoute(hvh, { 0: -60 }, { margin: 12 });

    // H out of the node, V across, H on to the bend, then the route as it was:
    // HVH has become HVHVH.
    expect(points).toEqual(
      polyline([0, 0], [12, 0], [12, -60], [200, -60], [200, 200], [400, 200]),
    );
  });

  it("cuts a jog into the run into the target the same way", () => {
    const { points } = dragRoute(hvh, { 2: 60 }, { margin: 12 });

    expect(points).toEqual(
      polyline([0, 0], [200, 0], [200, 260], [388, 260], [388, 200], [400, 200]),
    );
  });

  it("leaves the node's own point where the router put it", () => {
    const dragsBothEnds: HandleOffsets[] = [{ 0: -400 }, { 2: 400 }, { 0: 90, 2: -90 }];
    for (const offsets of dragsBothEnds) {
      const { points } = dragRoute(hvh, offsets, { margin: 12 });
      expect(points.at(0)).toEqual({ x: 0, y: 0 });
      expect(points.at(-1)).toEqual({ x: 400, y: 200 });
    }
  });

  it("jogs a straight route at both ends, since both of them are a node", () => {
    const { points } = dragRoute(polyline([0, 0], [400, 0]), { 0: 80 }, { margin: 12 });

    expect(points).toEqual(polyline([0, 0], [12, 0], [12, 80], [388, 80], [388, 0], [400, 0]));
  });

  it("carries the run's own handle on the piece the jog left", () => {
    const { handles } = dragRoute(hvh, { 0: -60 }, { margin: 12 });
    const run = handles.find((handle) => handle.key === "0");
    expect(run?.point).toEqual({ x: 106, y: -60 });
    // Two points further down the drawn polyline than the run it came from.
    expect(run?.drawnIndex).toBe(2);
  });

  // Both ends jogged draws HVHVHVH. Dragging one end's run into line with the
  // other's leaves the run between them flat, and a flat run is no run: the
  // two become one and the shape comes back to HVHVH.
  it("flattens the run between two end runs dragged into line", () => {
    const bothJogged = dragRoute(hvh, { 0: -90, 2: 90 }, { margin: 12 });
    expect(routeSignature(bothJogged.points)).toBe("HVHVHVH");

    // Run 0 leaves the node at y=0 and run 2 arrives at y=200, so -90 and
    // -290 put the two of them on the same line.
    const level = dragRoute(hvh, { 0: -90, 2: -290 }, { margin: 12 });
    expect(routeSignature(level.points)).toBe("HVHVH");
    expect(level.points).toEqual(
      polyline([0, 0], [12, 0], [12, -90], [388, -90], [388, 200], [400, 200]),
    );
  });

  it("keeps the handles that are left on the merged run", () => {
    const { handles } = dragRoute(hvh, { 0: -90, 2: -290 }, { margin: 12 });

    // Run 1 was dragged flat, so it has nothing to grab; runs 0 and 2 both
    // ride the merged run, either of them enough to bring run 1 back.
    expect(handles.map((handle) => handle.key)).toEqual(["0.head", "0", "2", "2.tail"]);
    expect(handles.map((handle) => handle.drawnIndex)).toEqual([1, 2, 2, 3]);
  });

  it("brings the flattened run back when the drag carries on past level", () => {
    const { points } = dragRoute(hvh, { 0: -90, 2: -350 }, { margin: 12 });
    expect(routeSignature(points)).toBe("HVHVHVH");

    // The run between the two has turned over rather than stopping at level:
    // it ran downwards on the routed shape and now runs up.
    expect((hvh[2]?.y ?? 0) - (hvh[1]?.y ?? 0)).toBeGreaterThan(0);
    expect((points[4]?.y ?? 0) - (points[3]?.y ?? 0)).toBeLessThan(0);
  });

  // The whole point of the flatten band: a drag that comes back to the line
  // draws as the simpler shape, so releasing there is what the user just saw.
  it("drops the jog for a drag back within the flatten band", () => {
    const { points } = dragRoute(hvh, { 0: 3 }, { margin: 12, flattenWithin: 5 });
    expect(points).toEqual(hvh);
  });

  it("flattens a dragged straight route back to a single run", () => {
    const straight = polyline([0, 0], [400, 0]);
    const { points } = dragRoute(straight, { 0: -4 }, { margin: 12, flattenWithin: 5 });
    expect(points).toEqual(straight);
  });

  it("keeps the jog once the drag is outside the band", () => {
    const { points } = dragRoute(hvh, { 0: 6 }, { margin: 12, flattenWithin: 5 });
    expect(points).toHaveLength(6);
  });
});

/**
 * The shape rule, whatever the drags: runs alternate H and V. Two runs on one
 * axis are one run — an `HH` in a signature means either a run of nothing left
 * where a drag flattened one, or a run that doubled back over the one before
 * it. Both are the same bug wearing different clothes, and both were reachable
 * by hand before this was pinned.
 */
describe("dragRoute shape", () => {
  const routes = {
    hvh: polyline([0, 0], [200, 0], [200, 200], [400, 200]),
    straight: polyline([0, 0], [400, 0]),
    detour: polyline([400, 220], [350, 220], [350, 750], [1030, 750], [1030, 540], [990, 540]),
  };
  const sweep = [-350, -290, -210, -90, -4, 0, 4, 90, 210, 290, 350];

  for (const [name, route] of Object.entries(routes)) {
    const last = route.length - 2;

    it(`alternates H and V on a ${name} route however it is dragged`, () => {
      for (const across of sweep) {
        for (const other of sweep) {
          for (const along of [-200, 0, 200]) {
            const offsets: HandleOffsets = {
              0: across,
              1: other,
              [`${last}`]: other,
              "0.head": along,
              [`${last}.tail`]: -along,
            };
            const { points, handles } = dragRoute(route, offsets, { margin: 12 });
            expect(routeSignature(points)).not.toMatch(/HH|VV/);
            // And every handle is on a run that is actually drawn.
            for (const handle of handles) {
              expect(points[handle.drawnIndex]).toBeDefined();
              expect(points[handle.drawnIndex + 1]).toBeDefined();
            }
          }
        }
      }
    });
  }
});

describe("dragRoute moves", () => {
  const points = polyline([0, 0], [100, 0], [100, 200], [200, 200]);

  it("moves the whole run perpendicular to itself", () => {
    expect(dragRoute(points, { 1: 30 }).points).toEqual(
      polyline([0, 0], [130, 0], [130, 200], [200, 200]),
    );
  });

  it("leaves the route alone for an offset of zero", () => {
    expect(dragRoute(points, { 1: 0 }).points).toEqual(points);
  });

  it("clamps a drag so the runs either side keep their margin", () => {
    const margin = 12;
    const moved = dragRoute(points, { 1: 500 }, { margin }).points;
    expect(moved[1]?.x).toBe(200 - margin);
    expect(moved[2]?.x).toBe(200 - margin);
  });

  it("clamps a drag in the other direction too", () => {
    const margin = 12;
    const moved = dragRoute(points, { 1: -500 }, { margin }).points;
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
      const moved = dragRoute(detour, { 2: -350 }, { margin: 12 }).points;
      expect(moved[2]?.y).toBe(400);
      expect(moved[3]?.y).toBe(400);
    });

    it("turns the neighbouring run over rather than refusing the drag", () => {
      const before = detour[4]!.y - detour[3]!.y;
      const after = dragRoute(detour, { 2: -350 }, { margin: 12 }).points;
      expect(Math.sign(after[4]!.y - after[3]!.y)).toBe(-Math.sign(before));
    });

    it("leaves no run between a margin and nothing at all", () => {
      // Either side of the flat point the neighbour keeps its margin; a drag
      // that lands on the flat point takes it and the run goes.
      for (const requested of [-198, -205, -215, -222]) {
        const moved = dragRoute(detour, { 2: requested }, { margin: 12 }).points;
        expect(Math.abs(moved[4]!.y - moved[3]!.y)).toBeGreaterThanOrEqual(12);
        expect(Math.abs(moved[2]!.y - moved[1]!.y)).toBeGreaterThanOrEqual(12);
      }
    });

    it("takes the run between two runs dragged into line out of the route", () => {
      // The run into the target ends 210 above the bottom run, so a drag of
      // -210 puts them in line and the run between them has nothing left.
      const { points, handles } = dragRoute(detour, { 2: -210 }, { margin: 12 });

      expect(routeSignature(detour)).toBe("HVHVH");
      expect(routeSignature(points)).toBe("HVH");
      expect(points).toEqual(polyline([400, 220], [350, 220], [350, 540], [990, 540]));
      // Run 3 was dragged flat and run 4 doubled back inside the run that
      // swallowed it; neither is drawn, so neither can be grabbed. The run
      // that flattened them brings both back.
      expect(handles.map((handle) => handle.key)).toEqual(["0", "1", "2"]);
    });

    it("still defends the stubs, which may not flip into their own node", () => {
      const moved = dragRoute(detour, { 1: 10_000 }, { margin: 12 }).points;
      // The stub out of the source keeps its direction and its margin.
      expect(moved[1]!.x).toBe(detour[0]!.x - 12);
    });
  });

  it("keeps a real route drawable after a drag that would collapse it", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(600, 300, "left"));
    const geometry = edgeGeometry(dragRoute(route.points, { 1: -10_000 }).points);
    for (const segment of geometry.segments) {
      expect(segment.length).toBeGreaterThan(0);
      expect(segment.d).not.toContain("NaN");
    }
  });

  it("jogs and moves on the same route without either losing its place", () => {
    const { points, handles } = dragRoute(
      polyline([0, 0], [200, 0], [200, 200], [400, 200]),
      { 0: -50, 1: 40 },
      { margin: 12 },
    );

    expect(points).toEqual(
      polyline([0, 0], [12, 0], [12, -50], [240, -50], [240, 200], [400, 200]),
    );
    expect(handles.map((handle) => handle.key)).toEqual(["0.head", "0", "1", "2"]);
    expect(handles.map((handle) => handle.drawnIndex)).toEqual([1, 2, 3, 4]);
  });
});
