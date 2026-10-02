import type { ReactNode, Ref } from "react";
import { ReactFlowProvider } from "./graph/react-flow";
import type { ShowGraphViewport } from "./graph/react-flow";
import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import type { ImageInputOnUploadProps } from "@mechane/design-system";

import type { SourceImageAsset } from "./graph/inspector/source-value-types";
import { ShowGraphEditorInner } from "./ShowGraphEditorInner";

export interface ShowGraphEditorHandle {
  fitToNodes(nodeIds: string[]): void;
  zoomToSelection(): boolean;
  fitToGraph(): void;
  applyAmendments(edits: readonly GraphEdit[]): void;
  // PROTOTYPE (#875): throwaway hooks for the graph clipboard gesture prototype.
  selectedNodeIds(): string[];
  selectNodes(nodeIds: readonly string[]): void;
  toFlowPosition(screen: { x: number; y: number }): { x: number; y: number };
}

export interface ShowGraphValueLocation {
  nodeId: string;
  fieldPath: readonly string[];
}

export interface ShowGraphEditorProps {
  graph: ShowGraph | null | undefined;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
  onEdit?: (edits: readonly GraphEdit[], graph: ShowGraph) => void;
  initialViewport?: ShowGraphViewport;
  onViewportChange?(viewport: ShowGraphViewport): void;
  initialSourceValue?: ShowGraphValueLocation;
  onSourceValueChange?(location: ShowGraphValueLocation | null): void;
  runActive?: boolean;
  reshufflingTransformerId?: string | null;
  onReshuffleTransformer?(transformerId: string, deviceId?: string): void;
  className?: string;
  /** PROTOTYPE (#875): extra items at the top of the canvas context menu. */
  contextMenuItems?: ReactNode;
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
