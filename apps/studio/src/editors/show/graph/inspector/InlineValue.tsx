import type { Gesture, GraphEdit } from "@mechane/commands";
import { setSourceFieldDefault } from "@mechane/commands";
import { formatValuePath, type ShowGraph } from "@mechane/domain";
import { useEffect, useRef, type ReactNode } from "react";

import type { GraphEditing } from "../../commands/use-graph-editing";
import { SourcePrimitiveInput } from "./SourcePrimitiveInput";
import type { SourceValueRow } from "./source-value-types";

type SourceValueGesture = Gesture<ShowGraph, GraphEdit>;

export function InlineValue({
  row,
  nodeId,
  editing,
  actions,
}: {
  row: SourceValueRow;
  nodeId: string;
  editing: GraphEditing;
  actions?: ReactNode;
}) {
  const gesture = useRef<SourceValueGesture | null>(null);
  const commitTimer = useRef<number | null>(null);
  const primitiveType = typeof row.type === "string" ? row.type : "text";

  useEffect(
    () => () => {
      if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
      gesture.current?.commit();
    },
    [],
  );

  const finishGesture = () => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    gesture.current?.commit();
    gesture.current = null;
  };

  const scheduleFinish = () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(finishGesture, 400);
  };

  const updateValue = (value: unknown) => {
    const currentGesture =
      gesture.current ??
      (gesture.current = editing.commands.beginGesture({
        key: `sourceFieldDefault:${nodeId}:${formatValuePath([...row.fieldPath])}`,
        label: `Edit ${row.label}`,
      }));
    currentGesture.update(setSourceFieldDefault(nodeId, row.fieldPath, value));
  };

  return (
    <SourcePrimitiveInput
      type={primitiveType}
      value={row.value}
      path={row.fieldPath}
      label={row.label}
      actions={actions}
      onChange={(value) => {
        updateValue(value);
        if (primitiveType === "boolean") finishGesture();
        else scheduleFinish();
      }}
      onValidityChange={() => {}}
    />
  );
}
