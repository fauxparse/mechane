import { describe, expect, it } from "vitest";
import { generateId, type StructuredValueId } from "./id";
import type { ShowGraph, SourceNode, TransformerNode, WiringEdge } from "./graph";
import type { Shape, Type } from "./shapes";
import type { RuntimeValue, StructuredValues } from "./structured-values";
import { evaluateTransformer } from "./transformers";

const candidateShape: Shape = {
  id: "shape_candidate",
  name: "Candidate",
  fields: [
    { id: "field_name", name: "name", type: "text", required: true, defaultValue: "" },
    { id: "field_votes", name: "votes", type: "number", required: true, defaultValue: 0 },
  ],
};
const candidateType = {
  kind: "shape",
  shapeId: candidateShape.id,
} satisfies Extract<Type, { kind: "shape" }>;
const candidatesType = {
  kind: "array",
  of: candidateType,
} satisfies Extract<Type, { kind: "array" }>;

function candidateValues(votes: readonly number[]): {
  value: RuntimeValue;
  records: StructuredValues;
  itemIds: StructuredValueId[];
} {
  const arrayId = generateId("structuredValue");
  const records: StructuredValues = {};
  const itemIds = votes.map((count, index) => {
    const id = generateId("structuredValue");
    records[id] = {
      id,
      kind: "shape",
      type: candidateType,
      fields: { field_name: `Candidate ${index + 1}`, field_votes: count },
    };
    return id;
  });
  records[arrayId] = {
    id: arrayId,
    kind: "array",
    type: candidatesType,
    items: itemIds.map((ref) => ({ ref })),
  };
  return { value: { ref: arrayId }, records, itemIds };
}

function graph(transformer: TransformerNode): ShowGraph {
  const source: SourceNode = {
    id: "source_candidates",
    kind: "source",
    name: "Candidates",
    parentId: null,
    position: { x: 0, y: 0 },
    type: candidatesType,
  };
  const edge: WiringEdge = {
    id: "edge_input",
    kind: "wiring",
    sourceId: source.id,
    targetId: transformer.id,
    sourcePath: [],
    targetPath: [transformer.ports[0]!.id],
  };
  return { shapes: [candidateShape], nodes: [source, transformer], edges: [edge] };
}

function outputItems(result: ReturnType<typeof evaluateTransformer>): readonly RuntimeValue[] {
  if (!result.value || typeof result.value !== "object" || !("ref" in result.value)) {
    throw new Error("Expected a computed Array reference.");
  }
  const record = result.computedStructuredValues[result.value.ref];
  if (record?.kind !== "array") throw new Error("Expected a computed Array record.");
  return record.items;
}

describe("Transformer evaluation", () => {
  it("filters an Array by a Boolean Formula while preserving item identity", () => {
    const transformer: TransformerNode = {
      id: "transformer_front_runners",
      kind: "transformer",
      name: "Front runners",
      parentId: null,
      position: { x: 0, y: 0 },
      ports: [{ id: "port_input", name: "input" }],
      transform: { kind: "filter", formula: "item.votes >= 3" },
    };
    const input = candidateValues([2, 5, 3]);
    const result = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: input.records,
    });
    expect(result.diagnostics).toEqual([]);
    expect(outputItems(result)).toEqual([{ ref: input.itemIds[1] }, { ref: input.itemIds[2] }]);
  });

  it("rejects only the item whose predicate fails at runtime", () => {
    const transformer: TransformerNode = {
      id: "transformer_valid_candidates",
      kind: "transformer",
      name: "Valid candidates",
      parentId: null,
      position: { x: 0, y: 0 },
      ports: [{ id: "port_input", name: "input" }],
      transform: { kind: "filter", formula: "item.votes >= 0" },
    };
    const input = candidateValues([2, 5, 3]);
    const brokenId = input.itemIds[1]!;
    const broken = input.records[brokenId];
    if (broken?.kind !== "shape") throw new Error("Expected a Candidate record.");
    const name = broken.fields.field_name;
    if (typeof name !== "string") throw new Error("Expected a Candidate name.");
    const records: StructuredValues = {
      ...input.records,
      [brokenId]: {
        ...broken,
        fields: { field_name: name },
      },
    };
    const result = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: records,
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "missingRequiredValue", severity: "runtime" }),
      ]),
    );
    expect(outputItems(result)).toEqual([{ ref: input.itemIds[0] }, { ref: input.itemIds[2] }]);
  });

  it("shuffles deterministically and keeps retained items in relative order", () => {
    const transformer: TransformerNode = {
      id: "transformer_order",
      kind: "transformer",
      name: "Candidate order",
      parentId: null,
      position: { x: 0, y: 0 },
      ports: [{ id: "port_input", name: "input" }],
      transform: { kind: "shuffle" },
    };
    const input = candidateValues([1, 2, 3, 4]);
    const full = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: input.records,
      shuffleSeed: "stable-seed",
    });
    const removedId = input.itemIds[1];
    const inputRecord = Object.values(input.records).find(
      (record) => record.kind === "array" && record.type === candidatesType,
    );
    if (inputRecord?.kind !== "array") throw new Error("Expected input Array.");
    const smallerRecords: StructuredValues = {
      ...input.records,
      [inputRecord.id]: {
        ...inputRecord,
        items: inputRecord.items.filter(
          (item) =>
            !(typeof item === "object" && item !== null && "ref" in item && item.ref === removedId),
        ),
      },
    };
    const smaller = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: smallerRecords,
      shuffleSeed: "stable-seed",
    });
    const withoutRemoved = outputItems(full).filter(
      (item) =>
        !(typeof item === "object" && item !== null && "ref" in item && item.ref === removedId),
    );
    expect(outputItems(smaller)).toEqual(withoutRemoved);
  });

  it("keeps duplicate references as distinct Shuffle occurrences", () => {
    const transformer: TransformerNode = {
      id: "transformer_duplicate_order",
      kind: "transformer",
      name: "Duplicate order",
      parentId: null,
      position: { x: 0, y: 0 },
      ports: [{ id: "port_input", name: "input" }],
      transform: { kind: "shuffle" },
    };
    const input = candidateValues([1, 2, 3]);
    const inputRecord = input.records[(input.value as { ref: StructuredValueId }).ref];
    if (inputRecord?.kind !== "array") throw new Error("Expected input Array.");
    const duplicateRecords: StructuredValues = {
      ...input.records,
      [inputRecord.id]: {
        ...inputRecord,
        items: [inputRecord.items[0]!, inputRecord.items[1]!, inputRecord.items[0]!],
      },
    };
    const first = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: duplicateRecords,
      shuffleSeed: "duplicate-seed",
    });
    const second = evaluateTransformer({
      graph: graph(transformer),
      node: transformer,
      inputValues: { port_input: input.value },
      structuredValues: duplicateRecords,
      shuffleSeed: "duplicate-seed",
    });
    expect(outputItems(first)).toEqual(outputItems(second));
    expect(
      outputItems(first).filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "ref" in item &&
          item.ref === input.itemIds[0],
      ),
    ).toHaveLength(2);
  });
});
