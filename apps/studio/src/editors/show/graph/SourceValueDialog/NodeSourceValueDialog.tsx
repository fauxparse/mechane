import type { ImageInputOnUploadProps } from "@mechane/design-system";
import { formatValuePath, type SourceNode } from "@mechane/domain/graph";
import { valueAtPath } from "@mechane/domain/property-values";
import { defaultSourceValues } from "@mechane/domain/source-defaults";
import { useState } from "react";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import type { SourceImageAsset, SourceValueRow } from "../inspector/source-value-types";
import { sourceValueRows, sourceValuesEqual } from "../inspector/source-values-helpers";
import { useNodeInteraction } from "../node-interaction";
import { SourceValueDialog } from ".";

type NodeSourceValueDialogProps = {
  editing: SourceValueEditing;
  imageAssets?: readonly SourceImageAsset[];
  onImageUpload?: (props: ImageInputOnUploadProps) => void;
};

/**
 * The one Source value editor, opened from a Source node's Edit button or from
 * the inspector's Source values section. It reads the open value out of the
 * node-interaction seam, so it renders whether or not the inspector does.
 */
export function NodeSourceValueDialog({
  editing,
  imageAssets,
  onImageUpload,
}: NodeSourceValueDialogProps) {
  const { sourceValueEditor: location } = useNodeInteraction();
  const node = location
    ? editing.graph.nodes.find((candidate) => candidate.id === location.nodeId)
    : undefined;
  if (!location || node?.kind !== "source") return null;
  const row = sourceValueRows(node, editing).find(
    (candidate) =>
      candidate.fieldPath.length === location.fieldPath.length &&
      candidate.fieldPath.every((segment, index) => segment === location.fieldPath[index]),
  );
  if (!row) return null;
  return (
    <OpenSourceValueDialog
      key={`${node.id}:${formatValuePath([...row.fieldPath])}`}
      node={node}
      openedRow={row}
      editing={editing}
      imageAssets={imageAssets}
      onImageUpload={onImageUpload}
    />
  );
}

function OpenSourceValueDialog({
  node,
  openedRow,
  editing,
  imageAssets,
  onImageUpload,
}: NodeSourceValueDialogProps & { node: SourceNode; openedRow: SourceValueRow }) {
  const { closeSourceValueEditor } = useNodeInteraction();
  // The row as it was when the dialog opened: Apply refuses to overwrite a
  // value that changed elsewhere in the meantime.
  const [row] = useState(openedRow);
  const readOnly = editing.graph.edges.some(
    (edge) => edge.kind === "wiring" && edge.targetId === node.id,
  );
  return (
    <SourceValueDialog
      nodeName={node.name}
      row={row}
      shapes={editing.graph.shapes ?? []}
      columnSizes={node.editorMetadata?.columnSizes}
      onColumnSizesChange={(columnSizes) => editing.setSourceColumnSizes(node.id, columnSizes)}
      imageAssets={imageAssets}
      onImageUpload={onImageUpload}
      readOnly={readOnly}
      open
      onOpenChange={(open) => {
        if (!open) closeSourceValueEditor();
      }}
      onImmediateChange={(value) => editing.setSourceFieldDefault(node.id, row.fieldPath, value)}
      onSave={(value) => {
        const currentValue = valueAtPath(
          defaultSourceValues(editing.graph)[node.id],
          row.fieldPath,
        );
        if (!sourceValuesEqual(currentValue, row.value)) {
          return "This value changed elsewhere. Cancel and reopen it before applying.";
        }
        editing.setSourceFieldDefault(node.id, row.fieldPath, value);
        return null;
      }}
    />
  );
}
