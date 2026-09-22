// PROTOTYPE (issue #675) — the little that all three variants share.
//
// Deliberately thin: the variants disagree about where the Formula is written
// and how its feedback is presented, so only the props contract, the React Flow
// handle bookkeeping and the analysis hook live here. Anything shaping a
// variant's layout belongs in the variant.
import type { GraphNode, Shape } from "@mechane/domain";
import { useUpdateNodeInternals, type HandleProps } from "@xyflow/react";
import { useEffect, useMemo, type ComponentType } from "react";

import { previewText, type FormulaValue } from "./formula-language";
import {
  analyseTransform,
  countReferences,
  type PrototypeTransform,
  type TransformAnalysis,
} from "./formula-state";

export interface VariantNodeProps {
  nodeId: string;
  transform: PrototypeTransform;
  handle: ComponentType<HandleProps>;
  connectedHandleIds: ReadonlySet<string>;
  targetable: boolean;
  selected: boolean;
}

export interface VariantInspectorProps {
  node: GraphNode;
  transform: PrototypeTransform;
  shapes: readonly Shape[];
}

export interface PrototypeVariantComponents {
  NodeBody: ComponentType<VariantNodeProps>;
  Inspector: ComponentType<VariantInspectorProps>;
  /**
   * False when the variant draws its own output handle, because two handles
   * cannot share the `out` id.
   */
  headerOutputHandle: boolean;
}

/**
 * React Flow caches handle positions, so a node that grows or loses a port row
 * has to say so or its edges keep pointing at the old geometry.
 */
export function usePortHandles(nodeId: string, transform: PrototypeTransform): void {
  const updateNodeInternals = useUpdateNodeInternals();
  const key = transform.ports.map((port) => port.id).join("|");
  useEffect(() => {
    updateNodeInternals(nodeId);
  }, [nodeId, updateNodeInternals, key]);
}

export function useAnalysis(transform: PrototypeTransform): TransformAnalysis {
  return useMemo(() => analyseTransform(transform), [transform]);
}

/** A short, safe rendering of a live value for a one-line slot. */
export function shortValue(value: FormulaValue, limit = 40): string {
  if (value.kind === "array") {
    const count = value.items.length;
    const inner = previewText(value);
    const summary = `${count} ${count === 1 ? "item" : "items"}`;
    return inner.length > limit ? summary : `${summary} · ${inner}`;
  }
  const rendered = previewText(value);
  return rendered.length > limit ? `${rendered.slice(0, limit - 1)}…` : rendered;
}

export interface PortWarning {
  portId: string;
  /** What the director sees. */
  message: string;
}

/**
 * The two states a port can be in that the director has to notice, carried over
 * from #676: nothing wired into it, and nothing in the Formula reading it.
 */
export function portWarnings(transform: PrototypeTransform): PortWarning[] {
  if (transform.kind !== "calculate") return [];
  return transform.ports.flatMap((port) => {
    if (port.wiredFrom === null) {
      return [{ portId: port.id, message: `${port.name} has nothing wired into it` }];
    }
    if (countReferences(transform.formula, port.name) === 0) {
      return [{ portId: port.id, message: `${port.name} is never read by the Formula` }];
    }
    return [];
  });
}
