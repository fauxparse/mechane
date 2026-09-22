// PROTOTYPE (issue #676) — throwaway state for the Calculate-port prototype.
//
// Question: how does a director add, name and wire the inputs of a Calculate
// node? Three variants of the Transformer node body and its inspector,
// switchable with `?variant=A|B|C` on the real Show graph route.
//
// Nothing here is production shaped. Port state is in-memory, seeded per node
// id, and thrown away on reload; evaluation is a hardcoded sample value because
// there is no evaluator yet. Real data (the Transformer nodes and their wiring
// edges) comes from ./seed-prototype-transformers.sql.
import type { Type } from "@mechane/domain";

import { handleFor } from "../handle-ids";

export type PrototypeTransformKind = "calculate" | "filter" | "shuffle";

export interface PrototypePort {
  id: string;
  name: string;
  type: Type | null;
  /** The producer this port is wired from, in the director's words. */
  wiredFrom: string | null;
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
  /** A sample output. Faked: the prototype has no evaluator. */
  preview: string;
}

const CANDIDATE: Type = { kind: "shape", shapeId: "shape_candidate" };
const CANDIDATE_ARRAY: Type = { kind: "array", of: CANDIDATE };

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
      },
      { id: "port_tally_threshold", name: "threshold", type: "number", wiredFrom: null },
    ],
    formula: 'FIRST(candidates).name & " leads with " & MAX(candidates.votes) & " votes"',
    outputType: "text",
    derivedTypeLabel: null,
    seed: "",
    preview: "Ada leads with 42 votes",
  },
  transformer_shortlist: {
    kind: "filter",
    ports: [
      { id: "port_shortlist_input", name: "input", type: CANDIDATE_ARRAY, wiredFrom: "Candidates" },
    ],
    formula: "item.votes >= 10",
    outputType: CANDIDATE_ARRAY,
    derivedTypeLabel: "Array of Candidate — from input",
    seed: "",
    preview: "3 of 5 candidates: Ada, Pat, Sam",
  },
  transformer_order: {
    kind: "shuffle",
    ports: [
      { id: "port_order_input", name: "input", type: CANDIDATE_ARRAY, wiredFrom: "Candidates" },
    ],
    formula: "",
    outputType: CANDIDATE_ARRAY,
    derivedTypeLabel: "Array of Candidate — from input",
    seed: "8f2a41",
    preview: "Pat, Sam, Ada, Jo, Kim",
  },
};

/** Which port each seeded wiring edge really feeds (see the SQL's note). */
const EDGE_PORTS: Record<string, string> = {
  edge_candidates_tally_port: "port_tally_candidates",
  edge_candidates_shortlist_port: "port_shortlist_input",
  edge_candidates_order_port: "port_order_input",
};

export const BLANK_TRANSFORM: PrototypeTransform = {
  kind: "calculate",
  ports: [],
  formula: "",
  outputType: "text",
  derivedTypeLabel: null,
  seed: "",
  preview: "—",
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
 * foreign key), so the projection asks here instead.
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
        { id, name: name ?? uniqueName(current, "input"), type: null, wiredFrom: null },
      ],
    }));
    return id;
  },

  /**
   * Renames a port and rewrites the Formula that references it, returning how
   * many references moved — the number every variant presents differently.
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

  movePort(nodeId: string, portId: string, delta: number): void {
    update(nodeId, (current) => {
      const index = current.ports.findIndex((port) => port.id === portId);
      const next = index + delta;
      if (index === -1 || next < 0 || next >= current.ports.length) return current;
      const ports = [...current.ports];
      const [moved] = ports.splice(index, 1);
      if (moved) ports.splice(next, 0, moved);
      return { ...current, ports };
    });
  },

  reorderPorts(nodeId: string, portIds: readonly string[]): void {
    update(nodeId, (current) => ({
      ...current,
      ports: portIds.flatMap((id) => current.ports.filter((port) => port.id === id)),
    }));
  },

  setFormula(nodeId: string, formula: string): void {
    update(nodeId, (current) => ({ ...current, formula, ...syncedPorts(current, formula) }));
  },

  setOutputType(nodeId: string, outputType: Type): void {
    update(nodeId, (current) => ({ ...current, outputType }));
  },

  reshuffle(nodeId: string): void {
    update(nodeId, (current) => ({
      ...current,
      seed: Math.random().toString(16).slice(2, 8),
      preview: shuffled(current.preview),
    }));
  },

  reset(): void {
    commit({ ...SEED });
  },
};

/**
 * Every port reference in a Formula, with its span. A "reference" is an
 * identifier that is not inside a string literal, not a Function call, not a
 * field after a dot, and not Filter's own `item` binding — text inside quotes
 * is content, so `" votes"` must not count as reading the `votes` port.
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

/** The ports a Formula reads, in first-appearance order. */
export function formulaIdentifiers(formula: string): string[] {
  const names: string[] = [];
  for (const reference of formulaReferences(formula)) {
    if (!names.includes(reference.name)) names.push(reference.name);
  }
  return names;
}

/**
 * Variant B's model: the Formula is canonical, so its identifiers decide the
 * ports. Identifiers with no port get one; ports with no reference are kept but
 * marked unused, because deleting on every keystroke would lose a wire.
 */
function syncedPorts(
  current: PrototypeTransform,
  formula: string,
): Pick<PrototypeTransform, "ports"> | Record<string, never> {
  if (current.kind !== "calculate") return {};
  const identifiers = formulaIdentifiers(formula);
  const added = identifiers
    .filter((name) => !current.ports.some((port) => port.name === name))
    .map((name, index) => ({
      id: `port_formula_${name}_${index}`,
      name,
      type: null,
      wiredFrom: null,
    }));
  return added.length > 0 ? { ports: [...current.ports, ...added] } : {};
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

function shuffled(preview: string): string {
  const parts = preview.split(", ");
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const held = parts[index]!;
    parts[index] = parts[swap]!;
    parts[swap] = held;
  }
  return parts.join(", ");
}
