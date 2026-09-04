// The editor state an edge needs but can't be told through props (#475).
//
// React Flow constructs edge components itself, handing them only the ids,
// endpoints and `data` it computed — so "record where this edge was dragged"
// has to arrive through context, exactly as ./node-interaction carries the
// equivalent for node bodies.
import { createContext, useContext } from "react";
import type { EdgeLayout } from "@mechane/domain";

export interface EdgeInteraction {
  /**
   * Records what has been dragged on an edge. `committed` is false while the
   * pointer is still down and true on release, so a drag previews live and
   * leaves one entry on the undo stack rather than one per frame.
   *
   * `null` clears it: an edge dragged back to its routed shape has nothing
   * authored on it, and storing an empty layout instead would leave an undo
   * entry that undoes nothing.
   */
  moveEdge(edgeId: string, layout: EdgeLayout | null, options: { committed: boolean }): void;
}

const IDLE: EdgeInteraction = { moveEdge: () => {} };

const EdgeInteractionContext = createContext<EdgeInteraction>(IDLE);

export const EdgeInteractionProvider = EdgeInteractionContext.Provider;

/**
 * Defaults to inert, so an edge rendered outside the editor — a Storybook
 * story, a screenshot — draws and drags without a graph behind it to record
 * the drag in.
 */
export function useEdgeInteraction(): EdgeInteraction {
  return useContext(EdgeInteractionContext);
}
