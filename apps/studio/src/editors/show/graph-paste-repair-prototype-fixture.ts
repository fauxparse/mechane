import type { GraphNode, ShowGraph } from "@mechane/domain/graph";
import { SAMPLE_GRAPH } from "./data/sample-graph";

export interface RepairTarget {
  id: string;
  label: string;
  scope?: string;
  unavailableReason?: string;
}

export interface RepairSource extends RepairTarget {
  fields: readonly RepairTarget[];
}

export interface RepairImage {
  id: string;
  revision: string;
  name: string;
  color: string;
}

export interface PasteRepairFixture {
  graph: ShowGraph;
  navigateTargets: readonly RepairTarget[];
  updateSources: readonly RepairSource[];
  optionalInputs: readonly RepairTarget[];
  replacementImages: readonly RepairImage[];
}

export const STATIC_PASTE_REPAIR_FIXTURE: PasteRepairFixture = {
  graph: {
    ...SAMPLE_GRAPH,
    nodes: [
      ...SAMPLE_GRAPH.nodes.map((node): GraphNode =>
        node.kind === "source" && node.id === "source_tally"
          ? { ...node, type: { kind: "shape", shapeId: "shape_tally" } }
          : node,
      ),
      {
        id: "source_total",
        kind: "source",
        name: "House total",
        parentId: null,
        position: { x: 500, y: 480 },
        type: "number",
      },
      {
        id: "source_message",
        kind: "source",
        name: "House message",
        parentId: null,
        position: { x: -320, y: 540 },
        type: "text",
      },
    ],
    shapes: [
      {
        id: "shape_tally",
        name: "Tally",
        fields: [
          { id: "field_count", name: "count", type: "number", required: true, defaultValue: 0 },
          { id: "field_label", name: "label", type: "text", required: true, defaultValue: "" },
        ],
      },
    ],
  },
  navigateTargets: [
    { id: "scene_results", label: "The house has spoken · Audience vote", scope: "Audience vote" },
    { id: "scene_voting", label: "Cast your vote · Audience vote", scope: "Audience vote" },
    {
      id: "scene_lobby",
      label: "Foyer holding slide · Show-level",
      scope: "Show-level",
      unavailableReason: "Navigate must stay in Audience vote, the destination Flow.",
    },
  ],
  updateSources: [
    {
      id: "source_tally",
      label: "Vote tally · Audience vote",
      scope: "Audience vote",
      fields: [
        { id: "field_count", label: "count · Number" },
        {
          id: "field_label",
          label: "label · Text",
          unavailableReason: "The Action supplies Number, not Text.",
        },
      ],
    },
    {
      id: "source_total",
      label: "House total · Show-level",
      scope: "Show-level",
      fields: [{ id: "root", label: "Whole Source · Number" }],
    },
  ],
  optionalInputs: [
    {
      id: "source_message",
      label: "House message · output · Text · Show-level",
      scope: "Show-level",
    },
  ],
  replacementImages: [
    { id: "asset_wash", revision: "rev_2", name: "Evening wash", color: "#596a9d" },
    { id: "asset_warm", revision: "rev_4", name: "Warm backdrop", color: "#9c7652" },
  ],
};
