import { ReactFlowProvider } from "@xyflow/react";
import type { Ref } from "react";
import type { GraphEdit } from "@mechane/commands";
import type { Viewport } from "@xyflow/react";
import type { ShowGraph } from "@mechane/domain";

import type { ApiGraph } from "./data/api-graph";
import { ShowGraphEditorInner } from "./ShowGraphEditorInner";

export interface ShowGraphEditorHandle {
  fitToNodes(nodeIds: string[]): void;
  zoomToSelection(): boolean;
  fitToGraph(): void;
  applyAmendments(edits: readonly GraphEdit[]): void;
}

export interface ShowGraphEditorProps {
  graph: ApiGraph | null | undefined;
  onEdit?: (edits: readonly GraphEdit[], graph: ShowGraph) => void;
  initialViewport?: Viewport;
  onViewportChange?(viewport: Viewport): void;
  className?: string;
  ref?: Ref<ShowGraphEditorHandle>;
}

export function ShowGraphEditor(props: ShowGraphEditorProps) {
  return (
    <ReactFlowProvider>
      <ShowGraphEditorInner {...props} />
    </ReactFlowProvider>
  );
}
export { MAX_ZOOM, MIN_ZOOM } from "./show-graph-editor-constants";

export type { ShowFlowNode } from "./graph/graph-to-flow";
