import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  ArrowRightIcon,
  Button,
  Section,
  SectionHelperText,
  SectionRow,
  TypeSelect,
  variableTypeIcon,
} from "@mechane/design-system";
import { type Shape, type SourceNode, type Type } from "@mechane/domain";
import { useState } from "react";

import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import { sourceTypeChangeHasImpact, type SourceTypeChangePlan } from "./source-type-change";

function typeLabel(type: Type, shapes: readonly Shape[]): string {
  if (typeof type === "string") return type;
  if (type.kind === "array") return `Array of ${typeLabel(type.of, shapes)}`;
  return shapes.find((shape) => shape.id === type.shapeId)?.name ?? "Shape";
}

function SourceTypeImpactDialog({
  plan,
  node,
  shapes,
  onCancel,
  onConfirm,
}: {
  plan: SourceTypeChangePlan;
  node: SourceNode;
  shapes: readonly Shape[];
  onCancel(): void;
  onConfirm(): void;
}) {
  const FromIcon = variableTypeIcon(plan.from);
  const ToIcon = variableTypeIcon(plan.to);
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogTitle>
          Change {node.name ? `“${node.name}”` : "source"} to {typeLabel(plan.to, shapes)}?
        </AlertDialogTitle>
        <div className="flex gap-2 items-center justify-center  p-4 rounded-md bg-muted/25">
          <FromIcon className="size-8" />
          <ArrowRightIcon className="size-4 text-muted-foreground" />
          <ToIcon className="size-8" />
        </div>
        <AlertDialogDescription>
          The new type is not completely compatible, and you may lose some data or connections as a
          result.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="destructive-primary">
            Change type
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SourceTypeSection({
  node,
  editing,
}: {
  node: SourceNode;
  editing: GraphInspectorEditing;
}) {
  const [pending, setPending] = useState<SourceTypeChangePlan | null>(null);
  const shapes = editing.graph.shapes ?? [];
  const selectType = (next: Type) => {
    setPending(editing.setSourceType(node.id, next));
  };
  return (
    <>
      <Section label="Type">
        <SectionRow>
          <TypeSelect
            value={node.type}
            shapes={shapes}
            vibe="inspector"
            aria-label="Source type"
            triggerClassName="col-span-full"
            onValueChange={selectType}
          />
        </SectionRow>
        {pending ? (
          <SectionHelperText>
            Review the connections and saved values before applying this change.
          </SectionHelperText>
        ) : null}
      </Section>
      {pending ? (
        <SourceTypeImpactDialog
          plan={pending}
          node={node}
          shapes={shapes}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const refreshed = editing.setSourceType(node.id, pending.to, pending);
            if (!refreshed) {
              setPending(null);
            } else if (sourceTypeChangeHasImpact(refreshed)) {
              setPending(refreshed);
            } else {
              setPending(null);
              editing.setSourceType(node.id, pending.to);
            }
          }}
        />
      ) : null}
    </>
  );
}
