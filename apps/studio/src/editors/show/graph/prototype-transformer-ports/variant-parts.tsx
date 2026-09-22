// PROTOTYPE (issue #676) — the little that all three variants share.
//
// Deliberately thin: the variants disagree about layout, so only the props
// contract, the React Flow handle bookkeeping and the fake diagnostics live
// here. Anything shaping a variant's layout belongs in the variant.
import type { GraphNode, Shape } from "@mechane/domain";
import { useUpdateNodeInternals, type HandleProps } from "@xyflow/react";
import { useEffect, type ComponentType } from "react";

import type { PrototypeTransform } from "./transform-prototype-state";
import { countReferences } from "./transform-prototype-state";

export interface VariantNodeProps {
  nodeId: string;
  transform: PrototypeTransform;
  handle: ComponentType<HandleProps>;
  connectedHandleIds: ReadonlySet<string>;
  targetable: boolean;
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

export interface PrototypeDiagnostic {
  portId: string;
  /** What the director sees; the prototype has no diagnostic model yet. */
  message: string;
}

/**
 * The two states a port can be in that the director has to notice: nothing
 * wired into it, and nothing in the Formula reading it.
 */
export function portDiagnostics(transform: PrototypeTransform): PrototypeDiagnostic[] {
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
