// PROTOTYPE (issue #675) — throwaway state for the Formula-authoring prototype.
//
// Descended from the #676 prototype's state module, whose Variant A won: ports
// are authored in the inspector and the node body is a read-only summary. That
// port model is taken as given here; what is in question is the Formula: where
// it is written, what feedback it gives while it is being written, and what a
// Transformer in error looks like at rest on the graph.
//
// Nothing here is production shaped. Port state and sample input values are in
// memory, seeded per node id, and thrown away on reload. Real data (the
// Transformer nodes and their wiring edges) comes from
// ./seed-prototype-transformers.sql. Evaluation is real, but by the throwaway
// engine in ./formula-language.ts, not by the vendored evaluator of #665.
import type { Type } from "@mechane/domain";

import { handleFor } from "../handle-ids";
import {
  absent,
  analyse,
  evaluate,
  number,
  text,
  type FormulaAnalysis,
  type FormulaScope,
  type FormulaType,
  type FormulaValue,
  type ShapeTable,
} from "./formula-language";

export type PrototypeTransformKind = "calculate" | "filter" | "shuffle";

export interface PrototypePort {
  id: string;
  name: string;
  type: Type | null;
  /** The producer this port is wired from, in the director's words. */
  wiredFrom: string | null;
  /** What is flowing through the wire right now. Absent when nothing is wired. */
  value: FormulaValue;
}

export interface PrototypeTransform {
  kind: PrototypeTransformKind;
  ports: PrototypePort[];
  /** Calculate: the output Formula. Filter: the per-item predicate. */
  formula: string;
  /** Calculate: authored. Filter and Shuffle: derived, shown read-only. */
  outputType: Type | null;
  /** Derived-type copy for Filter and Shuffle, which author no type. */
  derivedTypeLabel: string | null;
  /** Shuffle only. */
  seed: string;
}

const CANDIDATE: Type = { kind: "shape", shapeId: "shape_candidate" };
const CANDIDATE_ARRAY: Type = { kind: "array", of: CANDIDATE };

/** The Shape field tables the checker reads. Real Shapes live in the graph. */
export const PROTOTYPE_SHAPES: ShapeTable = {
  Candidate: { name: "text", votes: "number", tagline: "text" },
};

function candidate(name: string, votes: number, tagline: string): FormulaValue {
  return {
    kind: "record",
    shape: "Candidate",
    fields: { name: text(name), votes: number(votes), tagline: text(tagline) },
  };
}

/** The live value on the Candidates Source, as the graph would be carrying it. */
const CANDIDATES: FormulaValue = {
  kind: "array",
  items: [
    candidate("Ada", 42, "Steady hands"),
    candidate("Pat", 17, "Loud ideas"),
    candidate("Sam", 11, "Quiet ideas"),
    candidate("Jo", 6, "Late entry"),
    candidate("Kim", 3, "Very late entry"),
  ],
};

/**
 * The seeded state, keyed by the node ids ./seed-prototype-transformers.sql
 * inserts. Port ids are the handle ids the projection re-anchors real edges
 * onto, so a wire lands on the port row rather than the node header.
 */
const SEED: Record<string, PrototypeTransform> = {
  transformer_tally: {
    kind: "calculate",
    ports: [
      {
        id: "port_tally_candidates",
        name: "candidates",
        type: CANDIDATE_ARRAY,
        wiredFrom: "Candidates",
        value: CANDIDATES,
      },
      {
        id: "port_tally_threshold",
        name: "threshold",
        type: "number",
        wiredFrom: null,
        value: absent("nothing is wired into it"),
      },
    ],
    formula: 'FIRST(candidates).name & " leads with " & MAX(candidates.votes) & " votes"',
    outputType: "text",
    derivedTypeLabel: null,
    seed: "",
  },
  transformer_shortlist: {
    kind: "filter",
    ports: [
      {
        id: "port_shortlist_input",
        name: "input",
        type: CANDIDATE_ARRAY,
        wiredFrom: "Candidates",
        value: CANDIDATES,
      },
    ],
    formula: "item.votes >= 10",
    outputType: CANDIDATE_ARRAY,
    derivedTypeLabel: "Array of Candidate — from input",
    seed: "",
  },
  transformer_order: {
    kind: "shuffle",
    ports: [
      {
        id: "port_order_input",
        name: "input",
        type: CANDIDATE_ARRAY,
        wiredFrom: "Candidates",
        value: CANDIDATES,
      },
    ],
    formula: "",
    outputType: CANDIDATE_ARRAY,
    derivedTypeLabel: "Array of Candidate — from input",
    seed: "8f2a41",
  },
  // Seeded broken, and left broken: this is the node the variants are asked to
  // present "at rest", with nobody editing it.
  transformer_share: {
    kind: "calculate",
    ports: [
      {
        id: "port_share_candidates",
        name: "candidates",
        type: CANDIDATE_ARRAY,
        wiredFrom: "Candidates",
        value: CANDIDATES,
      },
    ],
    formula: 'ROUND(MAX(candidates.vote) / SUM(candidates.votes) * 100) & "% of the vote"',
    outputType: "text",
    derivedTypeLabel: null,
    seed: "",
  },
};

/** Which port each seeded wiring edge really feeds (see the SQL's note). */
const EDGE_PORTS: Record<string, string> = {
  edge_candidates_tally_port: "port_tally_candidates",
  edge_candidates_shortlist_port: "port_shortlist_input",
  edge_candidates_order_port: "port_order_input",
  edge_candidates_share_port: "port_share_candidates",
};

export const BLANK_TRANSFORM: PrototypeTransform = {
  kind: "calculate",
  ports: [],
  formula: "",
  outputType: "text",
  derivedTypeLabel: null,
  seed: "",
};

let state: Record<string, PrototypeTransform> = { ...SEED };
const listeners = new Set<() => void>();

function commit(next: Record<string, PrototypeTransform>): void {
  state = next;
  for (const listener of listeners) listener();
}

function update(nodeId: string, change: (current: PrototypeTransform) => PrototypeTransform): void {
  const current = state[nodeId] ?? BLANK_TRANSFORM;
  commit({ ...state, [nodeId]: change(current) });
}

export function subscribePrototype(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function prototypeSnapshot(): Record<string, PrototypeTransform> {
  return state;
}

export function prototypeTransform(nodeId: string): PrototypeTransform {
  return state[nodeId] ?? BLANK_TRANSFORM;
}

/**
 * The port handle a real wiring edge should land on. The schema cannot store a
 * Transformer port in `target_path` (generated column plus a Scene Variable
 * foreign key, found while building #676), so the projection asks here instead.
 */
export function prototypeEdgePortHandle(edgeId: string): string | null {
  const portId = EDGE_PORTS[edgeId];
  return portId ? handleFor({ kind: "field", id: portId }) : null;
}

let nextPort = 0;

export const prototypeActions = {
  addPort(nodeId: string, name?: string): string {
    nextPort += 1;
    const id = `port_proto_${nextPort}`;
    update(nodeId, (current) => ({
      ...current,
      ports: [
        ...current.ports,
        {
          id,
          name: name ?? uniqueName(current, "input"),
          type: null,
          wiredFrom: null,
          value: absent("nothing is wired into it"),
        },
      ],
    }));
    return id;
  },

  /**
   * Renames a port and rewrites the Formula that references it, returning how
   * many references moved (#676's winning presentation: silent, then a toast).
   */
  renamePort(nodeId: string, portId: string, name: string): number {
    const current = prototypeTransform(nodeId);
    const port = current.ports.find((candidate) => candidate.id === portId);
    if (!port || name === port.name || name.trim() === "") return 0;
    const spans = formulaReferences(current.formula).filter(
      (reference) => reference.name === port.name,
    );
    // Back to front, so an earlier rewrite cannot shift a later span.
    let formula = current.formula;
    for (const span of [...spans].reverse()) {
      formula = `${formula.slice(0, span.start)}${name}${formula.slice(span.end)}`;
    }
    update(nodeId, (latest) => ({
      ...latest,
      ports: latest.ports.map((candidate) =>
        candidate.id === portId ? { ...candidate, name } : candidate,
      ),
      formula,
    }));
    return spans.length;
  },

  setPortType(nodeId: string, portId: string, type: Type): void {
    update(nodeId, (current) => ({
      ...current,
      ports: current.ports.map((port) => (port.id === portId ? { ...port, type } : port)),
    }));
  },

  removePort(nodeId: string, portId: string): void {
    update(nodeId, (current) => ({
      ...current,
      ports: current.ports.filter((port) => port.id !== portId),
    }));
  },

  reorderPorts(nodeId: string, portIds: readonly string[]): void {
    update(nodeId, (current) => ({
      ...current,
      ports: portIds.flatMap((id) => current.ports.filter((port) => port.id === id)),
    }));
  },

  setFormula(nodeId: string, formula: string): void {
    update(nodeId, (current) => ({ ...current, formula }));
  },

  setOutputType(nodeId: string, outputType: Type): void {
    update(nodeId, (current) => ({ ...current, outputType }));
  },

  reshuffle(nodeId: string): void {
    update(nodeId, (current) => ({
      ...current,
      seed: Math.random().toString(16).slice(2, 8),
    }));
  },

  reset(): void {
    commit({ ...SEED });
  },
};

// ---------------------------------------------------------------------------
// Analysis: what every variant renders, however it chooses to render it
// ---------------------------------------------------------------------------

export interface TransformAnalysis {
  /** The Formula's own analysis. Null for Shuffle, which authors no Formula. */
  formula: FormulaAnalysis | null;
  /** What this Transformer is producing right now. */
  output: FormulaValue;
  /** Blocking Formula diagnostics stop publication (#672). */
  blocked: boolean;
}

function scopeFor(transform: PrototypeTransform): FormulaScope {
  return {
    ports: transform.ports.map((port) => ({
      name: port.name,
      type: formulaType(port.type),
      value: port.value,
    })),
    shapes: PROTOTYPE_SHAPES,
    expected: transform.kind === "filter" ? "boolean" : formulaType(transform.outputType),
  };
}

export function analyseTransform(transform: PrototypeTransform): TransformAnalysis {
  const input = transform.ports[0]?.value ?? absent("nothing is wired into it");

  if (transform.kind === "shuffle") {
    return { formula: null, output: shuffle(input, transform.seed), blocked: false };
  }

  if (transform.kind === "filter") {
    const items = input.kind === "array" ? input.items : [];
    const scope: FormulaScope = {
      ...scopeFor(transform),
      itemBinding: {
        name: "item",
        type: elementType(formulaType(transform.ports[0]?.type ?? null)),
        value: items[0] ?? absent("the input is empty"),
      },
    };
    const analysis = analyse(transform.formula, scope);
    if (analysis.blocked || !analysis.expression) {
      return { formula: analysis, output: absent("the predicate can't run"), blocked: true };
    }
    const kept = items.filter((item) => {
      const result = evaluate(analysis.expression!, {
        ...scope,
        itemBinding: { ...scope.itemBinding!, value: item },
      });
      return result.kind === "boolean" && result.value;
    });
    return { formula: analysis, output: { kind: "array", items: kept }, blocked: false };
  }

  const analysis = analyse(transform.formula, scopeFor(transform));
  return {
    formula: analysis,
    output: analysis.value ?? absent("the Formula can't run"),
    blocked: analysis.blocked,
  };
}

/** Deterministic in (seed, membership), as #671's Shuffle seed requires. */
function shuffle(input: FormulaValue, seed: string): FormulaValue {
  if (input.kind !== "array") return input;
  const items = [...input.items];
  let hash = [...seed].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  for (let index = items.length - 1; index > 0; index -= 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const swap = hash % (index + 1);
    const held = items[index]!;
    items[index] = items[swap]!;
    items[swap] = held;
  }
  return { kind: "array", items };
}

export function formulaType(type: Type | null): FormulaType {
  if (type === null) return "unknown";
  if (type === "text" || type === "number" || type === "boolean") return type;
  if (typeof type === "object" && "kind" in type) {
    if (type.kind === "array") return { array: formulaType(type.of as Type) };
    if (type.kind === "shape") return { record: "Candidate" };
  }
  return "unknown";
}

function elementType(type: FormulaType): FormulaType {
  return typeof type === "object" && "array" in type ? type.array : "unknown";
}

/**
 * Every port reference in a Formula, with its span. A "reference" is an
 * identifier that is not inside a string literal, not a Function call, not a
 * field after a dot, and not Filter's own `item` binding.
 */
export function formulaReferences(formula: string): { name: string; start: number; end: number }[] {
  const references: { name: string; start: number; end: number }[] = [];
  let index = 0;
  while (index < formula.length) {
    const char = formula[index]!;
    if (char === '"' || char === "'") {
      index += 1;
      while (index < formula.length && formula[index] !== char) {
        index += formula[index] === "\\" ? 2 : 1;
      }
      index += 1;
      continue;
    }
    if (!/[A-Za-z_]/.test(char)) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < formula.length && /[A-Za-z0-9_]/.test(formula[end]!)) end += 1;
    const name = formula.slice(index, end);
    const isCall = formula[end] === "(";
    const isField = formula[index - 1] === ".";
    const isFunctionName = /^[A-Z][A-Z0-9_]*$/.test(name);
    if (!isCall && !isField && !isFunctionName && name !== "item") {
      references.push({ name, start: index, end });
    }
    index = end;
  }
  return references;
}

export function countReferences(formula: string, name: string): number {
  return formulaReferences(formula).filter((reference) => reference.name === name).length;
}

function uniqueName(current: PrototypeTransform, base: string): string {
  const taken = new Set(current.ports.map((port) => port.name));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}${index}`)) index += 1;
  return `${base}${index}`;
}
