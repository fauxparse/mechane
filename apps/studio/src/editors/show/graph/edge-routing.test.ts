import { describe, expect, it } from "vitest";

import {
  DEFAULT_MARGIN,
  routeSmoothStep,
  type Endpoint,
  type Point,
  type Rect,
  type Side,
} from "./edge-routing";

const SIDES: readonly Side[] = ["right", "bottom", "left", "top"];

const SIZE = { width: 240, height: 56 };

/** The outward direction a handle on `side` faces. */
const OUTWARD: Record<Side, Point> = {
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  top: { x: 0, y: -1 },
};

/** A node box with its handle at the middle of `side`. */
function endpoint(x: number, y: number, side: Side): Endpoint {
  const rect: Rect = { x, y, ...SIZE };
  const point: Point = {
    right: { x: x + rect.width, y: y + rect.height / 2 },
    left: { x, y: y + rect.height / 2 },
    top: { x: x + rect.width / 2, y },
    bottom: { x: x + rect.width / 2, y: y + rect.height },
  }[side];
  return { point, side, rect };
}

/**
 * Placements far enough apart that no route needs the cramped-layout squeeze,
 * so the clearance invariants hold unconditionally.
 */
const PLACEMENTS = {
  ahead: { x: 600, y: 0 },
  behind: { x: -600, y: 0 },
  above: { x: 0, y: -400 },
  below: { x: 0, y: 400 },
  diagonal: { x: 500, y: 380 },
  reverseDiagonal: { x: -500, y: -380 },
} as const;

type Segment = { from: Point; to: Point; horizontal: boolean; length: number };

function segments(points: readonly Point[]): Segment[] {
  const result: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    const horizontal = Math.abs(from.y - to.y) < 0.01;
    result.push({
      from,
      to,
      horizontal,
      length: horizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y),
    });
  }
  return result;
}

/** Whether an axis-aligned segment passes through the interior of `rect`. */
function crosses(segment: Segment, rect: Rect): boolean {
  const low = {
    x: Math.min(segment.from.x, segment.to.x),
    y: Math.min(segment.from.y, segment.to.y),
  };
  const high = {
    x: Math.max(segment.from.x, segment.to.x),
    y: Math.max(segment.from.y, segment.to.y),
  };
  return (
    high.x > rect.x + 0.01 &&
    low.x < rect.x + rect.width - 0.01 &&
    high.y > rect.y + 0.01 &&
    low.y < rect.y + rect.height - 0.01
  );
}

const MATRIX = SIDES.flatMap((sourceSide) =>
  SIDES.flatMap((targetSide) =>
    Object.entries(PLACEMENTS).map(([placement, offset]) => ({
      name: `${sourceSide} → ${targetSide}, target ${placement}`,
      source: endpoint(0, 0, sourceSide),
      target: endpoint(offset.x, offset.y, targetSide),
    })),
  ),
);

describe("routeSmoothStep", () => {
  describe.each(MATRIX)("$name", ({ source, target }) => {
    const route = routeSmoothStep(source, target);
    const parts = segments(route.points);

    it("starts at the source handle and ends at the target handle", () => {
      expect(route.points.at(0)).toEqual(source.point);
      expect(route.points.at(-1)).toEqual(target.point);
    });

    it("is made only of axis-aligned segments, none of them redundant", () => {
      expect(parts.length).toBeGreaterThan(0);
      for (const [index, part] of parts.entries()) {
        expect(part.length).toBeGreaterThan(0);
        const next = parts[index + 1];
        if (!next) continue;
        // Consecutive segments on the same axis are only legal as a reversal:
        // two same-side handles on one row force the route to double back.
        if (part.horizontal !== next.horizontal) continue;
        const forward = part.horizontal ? part.to.x > part.from.x : part.to.y > part.from.y;
        const nextForward = next.horizontal ? next.to.x > next.from.x : next.to.y > next.from.y;
        expect(forward).not.toBe(nextForward);
      }
    });

    it("leaves the source perpendicular to its handle, clearing the margin", () => {
      const first = parts.at(0);
      if (!first) throw new Error("no segments");
      const outward = OUTWARD[source.side];
      expect(Math.sign(first.to.x - first.from.x)).toBe(outward.x);
      expect(Math.sign(first.to.y - first.from.y)).toBe(outward.y);
      expect(first.length).toBeGreaterThanOrEqual(DEFAULT_MARGIN);
    });

    it("arrives at the target along its handle, clearing the margin", () => {
      const last = parts.at(-1);
      if (!last) throw new Error("no segments");
      const outward = OUTWARD[target.side];
      expect(Math.sign(last.from.x - last.to.x)).toBe(outward.x);
      expect(Math.sign(last.from.y - last.to.y)).toBe(outward.y);
      expect(last.length).toBeGreaterThanOrEqual(DEFAULT_MARGIN);
    });

    it("never passes through either endpoint's box", () => {
      for (const part of parts) {
        expect(crosses(part, source.rect)).toBe(false);
        expect(crosses(part, target.rect)).toBe(false);
      }
    });

    it("reports a signature matching its own segments", () => {
      expect(route.signature).toBe(parts.map((p) => (p.horizontal ? "H" : "V")).join(""));
      expect(route.signature).toHaveLength(parts.length);
    });
  });

  it("routes facing handles with a single bend when they line up", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(600, 0, "left"));
    expect(route.signature).toBe("H");
    expect(route.detour).toBeNull();
  });

  it("routes facing handles as H-V-H when the target is ahead", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(600, 300, "left"));
    expect(route.signature).toBe("HVH");
    expect(route.detour).toBeNull();
  });

  it("detours around the outside when the target is behind", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(-600, 20, "left"));
    expect(route.signature).toBe("HVHVH");
    expect(route.detour).not.toBeNull();
  });

  it("turns once when perpendicular handles already point at each other", () => {
    const route = routeSmoothStep(endpoint(0, 0, "right"), endpoint(600, 300, "top"));
    expect(route.signature).toBe("HV");
  });
});

describe("detour side", () => {
  const source = endpoint(0, 0, "right");

  it("sweeps towards whichever side the target is already on", () => {
    expect(routeSmoothStep(source, endpoint(-600, -400, "left")).detour).toBe("negative");
    expect(routeSmoothStep(source, endpoint(-600, 400, "left")).detour).toBe("positive");
  });

  it("holds its previous side while the target has barely crossed over", () => {
    // The target handle sits 5px above the source's — the other side, but by
    // less than the margin, so a drag jittering across the tie point is quiet.
    const held = routeSmoothStep(source, endpoint(-600, -5, "left"), {
      previousDetour: "positive",
    });
    expect(held.detour).toBe("positive");
  });

  it("flips once the target commits to the other side", () => {
    const flipped = routeSmoothStep(source, endpoint(-600, 400, "left"), {
      previousDetour: "negative",
    });
    expect(flipped.detour).toBe("positive");
  });

  it("reports a detour when same-facing handles have to go around", () => {
    // Same row, so doubling back directly would run straight through the
    // target. The detour is real geometry, not a float comparison on a point.
    const route = routeSmoothStep(source, endpoint(300, 0, "right"));
    expect(route.signature).toBe("HVHVH");
    expect(route.detour).not.toBeNull();
  });

  it("reports none when same-facing handles can double back directly", () => {
    const route = routeSmoothStep(source, endpoint(300, 300, "right"));
    expect(route.signature).toBe("HVH");
    expect(route.detour).toBeNull();
  });

  it("reports no detour when the route did not need one", () => {
    expect(routeSmoothStep(source, endpoint(600, 300, "left")).detour).toBeNull();
  });
});

describe("fanning parallel edges", () => {
  const source = endpoint(0, 0, "right");

  it("leaves a route alone when it has no rivals", () => {
    const plain = routeSmoothStep(source, endpoint(600, 300, "left"));
    const fanned = routeSmoothStep(source, endpoint(600, 300, "left"), { fan: 0 });
    expect(fanned.points).toEqual(plain.points);
  });

  it("steps the middle run aside when there is one to move", () => {
    const target = endpoint(600, 300, "left");
    const plain = routeSmoothStep(source, target);
    const fanned = routeSmoothStep(source, target, { fan: 16 });

    expect(fanned.signature).toBe(plain.signature);
    expect(fanned.points[1]?.x).toBe((plain.points[1]?.x ?? 0) + 16);
    expect(fanned.points[2]?.x).toBe((plain.points[2]?.x ?? 0) + 16);
  });

  it("cuts a jog into a straight route, which has no middle run to move", () => {
    const target = endpoint(600, 0, "left");
    expect(routeSmoothStep(source, target).signature).toBe("H");

    const fanned = routeSmoothStep(source, target, { fan: 16 });
    expect(fanned.signature).toBe("HVHVH");
    expect(fanned.points.at(0)).toEqual(source.point);
    expect(fanned.points.at(-1)).toEqual(target.point);
  });

  it("separates rivals from each other rather than merely from centre", () => {
    const target = endpoint(600, 0, "left");
    const left = routeSmoothStep(source, target, { fan: -16 });
    const right = routeSmoothStep(source, target, { fan: 16 });
    expect(left.points).not.toEqual(right.points);
  });

  it("leaves a run too short to hold a jog alone", () => {
    // Nowhere to put two stubs and a step between them, so overlapping beats
    // a jog whose corners have no room.
    const target = endpoint(SIZE.width + 20, 0, "left");
    const fanned = routeSmoothStep(source, target, { fan: 16 });
    expect(fanned.signature).toBe("H");
  });

  it("keeps every invariant a fanned route still owes", () => {
    const target = endpoint(600, 0, "left");
    const fanned = routeSmoothStep(source, target, { fan: 16 });
    const parts = segments(fanned.points);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(crosses(part, source.rect)).toBe(false);
      expect(crosses(part, target.rect)).toBe(false);
    }
    expect(parts.at(0)?.length).toBeGreaterThanOrEqual(DEFAULT_MARGIN);
    expect(parts.at(-1)?.length).toBeGreaterThanOrEqual(DEFAULT_MARGIN);
  });
});

describe("obstacles", () => {
  const source = endpoint(0, 0, "right");
  const target = endpoint(600, 300, "left");

  it("slides the crossing segment clear rather than adding a bend", () => {
    const plain = routeSmoothStep(source, target);
    const middle = plain.points[1];
    if (!middle) throw new Error("expected a bend");

    // Sits astride the vertical run only, clear of the horizontals at either
    // end, so sliding it sideways is enough — no bend required.
    const obstacle: Rect = { x: middle.x - 40, y: 100, width: 80, height: 150 };
    const avoided = routeSmoothStep(source, target, { obstacles: [obstacle] });

    expect(avoided.signature).toBe(plain.signature);
    for (const part of segments(avoided.points)) {
      expect(crosses(part, obstacle)).toBe(false);
    }
  });

  it("crosses an obstacle it cannot clear without bending", () => {
    const obstacle: Rect = { x: 252, y: -1000, width: 348, height: 2000 };
    const route = routeSmoothStep(source, target, { obstacles: [obstacle] });
    expect(route.signature).toBe("HVH");
  });
});

describe("cramped layouts", () => {
  it("squeezes both stubs rather than giving up on the step", () => {
    const source = endpoint(0, 0, "right");
    const target = endpoint(SIZE.width + 10, 200, "left");
    const route = routeSmoothStep(source, target);
    const parts = segments(route.points);

    expect(route.signature).toBe("HVH");
    expect(parts.at(0)?.length).toBeCloseTo(5);
    expect(parts.at(-1)?.length).toBeCloseTo(5);
  });
});
