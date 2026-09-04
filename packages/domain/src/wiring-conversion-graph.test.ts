// The positional array-to-single conversion as the graph sees it (#532):
// what may be connected, what the stored edge records, what reaches the Scene
// Variable, and what an operator is told when nothing does.
//
// Nothing here needs an Action that mutates Source data: the whole capability
// is exercised through read-only graph dataflow from authored Source defaults.

import { describe, expect, it } from "vitest";

import { canConnect, connectionError, planConnection } from "./connect";
import { assertValidShowGraph, InvalidShowGraphError } from "./graph";
import type { GraphEdge, SceneNode, ShowGraph, SourceNode, WiringEdge } from "./graph";
import { deriveShowGraphFacts } from "./graph-facts";
import { defaultSourceValues } from "./source-defaults";
import { sceneVariableResolution, wiringDiagnostics } from "./scene-variable-values";
import type { Shape } from "./shapes";

const at = { x: 0, y: 0 };

const candidate: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
  ],
};

function source(id: string, type: SourceNode["type"]): SourceNode {
  return { id, kind: "source", name: id, position: at, parentId: null, type };
}

function scene(variables: SceneNode["variables"]): SceneNode {
  return { id: "scene", kind: "scene", name: "Scene", position: at, parentId: null, variables };
}

/**
 * The Voting example from #532: a list of Candidates feeding a single
 * "leading candidate" Variable.
 */
function votingGraph(candidates: unknown[], edge: Partial<WiringEdge> = {}): ShowGraph {
  return {
    shapes: [candidate],
    nodes: [
      source("source_candidates", { kind: "array", of: { kind: "shape", shapeId: candidate.id } }),
      scene([
        { id: "variable_leader", name: "Leader", type: { kind: "shape", shapeId: candidate.id } },
      ]),
    ],
    edges: [
      {
        id: "edge_leader",
        kind: "wiring",
        sourceId: "source_candidates",
        targetId: "scene",
        sourcePath: [],
        targetPath: ["variable_leader"],
        conversion: "firstItem",
        ...edge,
      } as GraphEdge,
    ],
    sourceFieldDefaults: [{ nodeId: "source_candidates", fieldPath: [], value: candidates }],
  };
}

const alice = { field_name: "Alice", field_votes: 5 };
const beatrix = { field_name: "Beatrix", field_votes: 2 };

describe("connecting an array Source to a single target", () => {
  const graph = votingGraph([alice, beatrix]);
  const unconnected: ShowGraph = { ...graph, edges: [] };
  const request = {
    sourceId: "source_candidates",
    targetId: "scene",
    targetVariableId: "variable_leader",
  };

  it("permits the connection the type rules alone would refuse", () => {
    expect(canConnect(unconnected, request)).toBe(true);
    expect(connectionError(unconnected, request)).toBeNull();
  });

  it("records the conversion on the edge rather than leaving it implicit", () => {
    const plan = planConnection(unconnected, request, {
      edgeId: "edge_leader",
      variableId: "variable_new",
    });
    expect("edits" in plan).toBe(true);
    if (!("edits" in plan)) return;
    const added = plan.edits.find((edit) => edit.type === "graph.addEdge");
    expect(added).toMatchObject({ edge: { kind: "wiring", conversion: "firstItem" } });
  });

  it("still refuses a connection no conversion could rescue", () => {
    const incompatible: ShowGraph = {
      ...unconnected,
      nodes: [
        source("source_candidates", {
          kind: "array",
          of: { kind: "shape", shapeId: candidate.id },
        }),
        scene([{ id: "variable_leader", name: "Leader", type: "image" }]),
      ],
    };
    expect(connectionError(incompatible, request)).toBe("Those values have incompatible types.");
  });
});

describe("validating a stored conversion", () => {
  it("accepts an edge whose selected item fits its target", () => {
    expect(() => assertValidShowGraph(votingGraph([alice]))).not.toThrow();
  });

  it("refuses the same edge without the conversion recorded on it", () => {
    const graph = votingGraph([alice], { conversion: undefined });
    expect(() => assertValidShowGraph(graph)).toThrow(InvalidShowGraphError);
    expect(() => assertValidShowGraph(graph)).toThrow(/incompatible types/);
  });

  it("refuses a conversion that does not apply to the edge's endpoints", () => {
    const graph = votingGraph([alice]);
    const nonArray: ShowGraph = {
      ...graph,
      nodes: [
        source("source_candidates", { kind: "shape", shapeId: candidate.id }),
        ...graph.nodes.slice(1),
      ],
    };
    expect(() => assertValidShowGraph(nonArray)).toThrow(/does not apply/);
  });

  it("refuses an unknown conversion outright", () => {
    const graph = votingGraph([alice], { conversion: "lastItem" as never });
    expect(() => assertValidShowGraph(graph)).toThrow(/unknown conversion/);
  });
});

describe("edge facts", () => {
  it("reports the conversion and judges compatibility through it", () => {
    const facts = deriveShowGraphFacts(votingGraph([alice])).edges.get("edge_leader");
    expect(facts?.conversion).toBe("firstItem");
    expect(facts?.typeCompatibility).toBe("compatible");
  });

  it("asks the coercion question about the item, not the array", () => {
    const graph: ShowGraph = {
      nodes: [
        source("source_scores", { kind: "array", of: "number" }),
        scene([{ id: "variable_label", name: "Label", type: "text" }]),
      ],
      edges: [
        {
          id: "edge_label",
          kind: "wiring",
          sourceId: "source_scores",
          targetId: "scene",
          sourcePath: [],
          targetPath: ["variable_label"],
          conversion: "firstItem",
        },
      ],
    };
    expect(deriveShowGraphFacts(graph).edges.get("edge_label")?.typeCompatibility).toBe("coercing");
  });
});

describe("resolving values through a conversion", () => {
  it("carries position zero, and follows the array when it is reordered", () => {
    const graph = votingGraph([alice, beatrix]);
    expect(sceneVariableResolution(graph, "scene", defaultSourceValues(graph)).values).toEqual({
      variable_leader: alice,
    });

    const reordered = votingGraph([beatrix, alice]);
    expect(
      sceneVariableResolution(reordered, "scene", defaultSourceValues(reordered)).values,
    ).toEqual({ variable_leader: beatrix });
  });

  it("takes the current Run value, not the authored default", () => {
    const graph = votingGraph([alice, beatrix]);
    expect(
      sceneVariableResolution(graph, "scene", { source_candidates: [beatrix] }).values,
    ).toEqual({ variable_leader: beatrix });
  });

  it("produces typed absence and a diagnostic when the list is empty", () => {
    const graph = votingGraph([]);
    const resolution = sceneVariableResolution(graph, "scene", defaultSourceValues(graph));
    expect(resolution.values).toEqual({});
    expect(resolution.diagnostics).toEqual([
      {
        category: "emptyConversionSource",
        edgeId: "edge_leader",
        message: expect.stringContaining("empty"),
      },
    ]);
  });

  it("never falls back to a later item, whatever else the list holds", () => {
    const graph = votingGraph([alice, beatrix]);
    // The conversion is position zero and nothing else: an item that would
    // "work better" for the target is still not the item this edge carries.
    expect(
      sceneVariableResolution(graph, "scene", { source_candidates: [beatrix, alice] }).values,
    ).toEqual({ variable_leader: beatrix });
  });

  it("reports on every edge in the graph, not only the ones one Scene reaches", () => {
    const graph = votingGraph([]);
    const withSourceTarget: ShowGraph = {
      ...graph,
      nodes: [...graph.nodes, source("source_leader", { kind: "shape", shapeId: candidate.id })],
      edges: [
        ...graph.edges,
        {
          id: "edge_source_leader",
          kind: "wiring",
          sourceId: "source_candidates",
          targetId: "source_leader",
          sourcePath: [],
          targetPath: [],
          conversion: "firstItem",
        },
      ],
    };
    expect(() => assertValidShowGraph(withSourceTarget)).not.toThrow();
    expect(
      wiringDiagnostics(withSourceTarget, defaultSourceValues(withSourceTarget)).map(
        (diagnostic) => diagnostic.edgeId,
      ),
    ).toEqual(expect.arrayContaining(["edge_leader", "edge_source_leader"]));
  });
});
