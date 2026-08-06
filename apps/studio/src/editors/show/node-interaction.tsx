// The editor state a node body needs but can't be told through props (issue
// #42).
//
// React Flow constructs node components itself, handing them only `id`, `data`,
// and its own interaction flags — so "is this node being renamed?" and "may
// this Variable accept the connection I'm dragging?" have to arrive through
// context. Both are *editor* state rather than graph data, which is why they
// aren't in `ShowNodeData`: putting them there would rebuild every node's data
// object on every frame of a connection drag.
import { createContext, useContext } from "react";
import type { ConnectionTargets } from "@mechane/domain";

export interface NodeInteraction {
  /** The node whose name is being edited inline, if any. */
  renaming: string | null;
  /** Starts an inline rename — double-click on a node, or F2 (#37). */
  beginRename(nodeId: string): void;
  /** One keystroke of the rename. Coalesced into a single undo entry (#28). */
  renameTo(name: string): void;
  /** Ends the rename, keeping it: blur, or Enter. */
  commitRename(): void;
  /** Ends the rename, discarding it: Escape. */
  cancelRename(): void;
  /** True while a connection is being dragged from a handle. */
  connecting: boolean;
  /** What that drag may land on (`connectionTargets`), or null when idle. */
  targets: ConnectionTargets | null;
  /** Toggles a Flow's local collapsed view state; not an edit command. */
  toggleCollapse(flowId: string): void;
}

const IDLE: NodeInteraction = {
  renaming: null,
  beginRename: () => {},
  renameTo: () => {},
  commitRename: () => {},
  cancelRename: () => {},
  connecting: false,
  targets: null,
  toggleCollapse: () => {},
};

const NodeInteractionContext = createContext<NodeInteraction>(IDLE);

export const NodeInteractionProvider = NodeInteractionContext.Provider;

/**
 * The editor interaction state for the node being rendered. Defaults to inert,
 * so a node rendered outside the editor (a Storybook story of the body alone)
 * shows its resting state rather than crashing.
 */
export function useNodeInteraction(): NodeInteraction {
  return useContext(NodeInteractionContext);
}
