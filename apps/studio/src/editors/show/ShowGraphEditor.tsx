import type { Ref } from "react";
import { ReactFlowProvider } from "./graph/react-flow";
import type { ShowGraphViewport } from "./graph/react-flow";
import type { GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain";
import type { ImageInputOnUploadProps } from "@mechane/design-system";

import type { SourceImageAsset } from "./graph/inspector/source-value-types";
import { ShowGraphEditorInner } from "./ShowGraphEditorInner";

export interface ShowGraphEditorHandle {
  fitToNodes(nodeIds: string[]): void;
  zoomToSelection(): boolean;
  fitToGraph(): void;
  applyAmendments(edits: readonly GraphEdit[]): void;
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
