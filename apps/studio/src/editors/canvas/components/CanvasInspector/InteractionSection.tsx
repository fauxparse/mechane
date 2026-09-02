import {
  AlertTriangleIcon,
  Button,
  Section,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import { generateId } from "@mechane/domain";
import type { InteractionOwner } from "@mechane/domain";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";

function ownerKey(owner: InteractionOwner): string {
  return owner.kind === "scene" ? `scene:${owner.sceneId}` : `block:${owner.blockId}`;
}

export function InteractionSection() {
  const {
    focused,
    target,
    selected,
    cues = [],
    actions = [],
    eventBindings = [],
    onCreateCue,
    onFocusCue,
    onSetEventBindingCue,
    onCreateEventBinding,
    onRemoveEventBinding,
  } = useCanvasInspectorContext();

  if (!focused || selected.length !== 1) return null;

  const owner: InteractionOwner =
    focused.kind === "scene"
      ? { kind: "scene", sceneId: focused.artId }
      : { kind: "block", blockId: focused.artId };
  const ownedCues = cues.filter((cue) => ownerKey(cue.owner) === ownerKey(owner));
  const binding = eventBindings.find(
    (candidate) =>
      candidate.canvasId === focused.canvasId &&
      candidate.elementId === target.id &&
      candidate.eventKind === "tap",
  );
  const cue = binding ? ownedCues.find((candidate) => candidate.id === binding.cueId) : undefined;
  const cueActions = cue
    ? cue.actionIds
        .map((actionId) => actions.find((action) => action.id === actionId))
        .filter(Boolean)
    : [];

  return (
    <Section label="Interaction">
      <SectionRow className="grid-cols-[1fr_auto] items-center">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">
            {binding ? "Tap binding" : "No tap binding"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {owner.kind === "scene" ? "Scene" : "Block"} owner · {focused.name}
          </div>
        </div>
        {binding ? <span className="text-[11px] text-muted-foreground">tap</span> : null}
      </SectionRow>
      {ownedCues.length > 0 ? (
        <SectionRow className="grid-cols-[1fr_auto] items-center">
          <Select
            value={binding?.cueId ?? ""}
            onValueChange={(value) => {
              if (!value) return;
              if (binding) onSetEventBindingCue?.(binding.id, value);
              else
                onCreateEventBinding?.({
                  id: generateId("eventBinding"),
                  canvasId: focused.canvasId,
                  elementId: target.id,
                  eventKind: "tap",
                  cueId: value,
                });
            }}
            items={ownedCues.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
          >
            <SelectTrigger aria-label="Interaction Cue">
              <SelectValue placeholder="Choose a Cue" />
            </SelectTrigger>
            <SelectContent>
              {ownedCues.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => (binding ? onRemoveEventBinding?.(binding.id) : onCreateCue?.(owner))}
          >
            {binding ? "Unbind" : "New Cue"}
          </Button>
        </SectionRow>
      ) : (
        <SectionRow>
          <Button type="button" size="sm" variant="outline" onClick={() => onCreateCue?.(owner)}>
            Create Cue
          </Button>
        </SectionRow>
      )}
      {cue ? (
        <SectionRow>
          <div className="w-full rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{cue.name}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => onFocusCue?.(cue.id)}>
                Focus in graph
              </Button>
            </div>
            <div className="mt-1 text-muted-foreground">
              {cueActions.length} {cueActions.length === 1 ? "Action" : "Actions"} owned by this Cue
            </div>
          </div>
        </SectionRow>
      ) : null}
      {focused.kind === "block" ? (
        <SectionRow>
          <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Block interactions are authored here and inherited by Slots; Player dispatch is not
              available yet.
            </span>
          </div>
        </SectionRow>
      ) : null}
    </Section>
  );
}
