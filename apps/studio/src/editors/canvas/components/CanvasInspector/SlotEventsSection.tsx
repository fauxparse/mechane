import {
  ArrowRightIcon,
  Button,
  PlusIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Trash2Icon,
  ZapIcon,
} from "@mechane/design-system";
import type { Cue, InteractionOwner, SlotEventBinding } from "@mechane/domain/interactions";
import type { Shape } from "@mechane/domain/shapes";
import { sortBy } from "es-toolkit";
import { useMemo } from "react";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import {
  fieldPathLabels,
  retargetSlotEventBinding,
  slotCueParameterMappings,
} from "./slot-event-options";

/** The picker's stand-in value for "grow a new owner Cue for this link". */
const CREATE_NEW_CUE_VALUE = "create-new-cue";

function ownerKey(owner: InteractionOwner): string {
  return owner.kind === "scene" ? `scene:${owner.sceneId}` : `block:${owner.blockId}`;
}

type SlotEventBindingRowProps = {
  binding: SlotEventBinding;
  cuesById: ReadonlyMap<string, Cue>;
  ownedCues: readonly Cue[];
  shapes: readonly Shape[];
  onSetSlotEventBinding?(binding: SlotEventBinding): void;
  onRemoveSlotEventBinding?(bindingId: string): void;
  onCreateSlotCueBinding?(sourceCueId: string, slotElementId: string, bindingId?: string): void;
};

/**
 * One saved Slot Event Binding: a Block Cue this Slot renders, handed to a Cue
 * owned by the focused Scene or Block. Creation lives in the Interactions
 * menu; this row is the authored link — read the source event, choose where
 * it lands, see what crosses over, and delete it when it should not exist.
 */
function SlotEventBindingRow({
  binding,
  cuesById,
  ownedCues,
  shapes,
  onSetSlotEventBinding,
  onRemoveSlotEventBinding,
  onCreateSlotCueBinding,
}: SlotEventBindingRowProps) {
  const source = cuesById.get(binding.sourceCueId);
  const sourceName = source?.name ?? "Unknown";
  const targetCue = cuesById.get(binding.targetCueId);
  const targetName = targetCue?.name ?? "Unknown";

  // A Cue is offered only if every one of its parameters can be fed, so the
  // picker never proposes a link the graph would reject on save.
  const handlableCues = source
    ? ownedCues.filter(
        (cue) =>
          slotCueParameterMappings(
            source,
            cue,
            shapes,
            cue.id === binding.targetCueId ? binding.parameterMappings : undefined,
          ) !== null,
      )
    : [];

  // The saved mappings are what the readout shows; this is only the health
  // check that says whether they still line up with both Cues as authored.
  const resolvedMappings =
    source && targetCue
      ? slotCueParameterMappings(source, targetCue, shapes, binding.parameterMappings)
      : null;
  const mappingsSound =
    resolvedMappings !== null &&
    resolvedMappings.length === binding.parameterMappings.length &&
    resolvedMappings.every((mapping) => binding.parameterMappings.includes(mapping));

  const chooseCue = (cueId: string) => {
    if (cueId === CREATE_NEW_CUE_VALUE) {
      // The bindingId makes creation a retarget of this row, not a new link.
      onCreateSlotCueBinding?.(binding.sourceCueId, binding.slotElementId, binding.id);
      return;
    }
    const nextCue = cuesById.get(cueId);
    if (!source || !nextCue) return;
    const next = retargetSlotEventBinding(binding, source, nextCue, shapes);
    if (next) onSetSlotEventBinding?.(next);
  };

  return (
    <div className="col-span-full grid grid-cols-subgrid grid-rows-[repeat(2,1.75rem)_auto] gap-y-2 rounded-sm">
      <dl className="col-span-2 row-span-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-subgrid items-center gap-2 *:[dt]:label *:[dt]:col-start-1 *:[dd]:col-start-2">
        <dt>On</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <ZapIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{sourceName}</span>
        </dd>
        <dt>Then</dt>
        <dd className="min-w-0">
          <Select
            value={binding.targetCueId}
            onValueChange={(cueId) => {
              if (cueId) chooseCue(cueId);
            }}
          >
            <SelectTrigger aria-label={`Cue handling ${sourceName}`} className="w-full min-w-0">
              <SelectValue placeholder="Choose a Cue" className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ZapIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{targetName}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {handlableCues.map((cue) => (
                <SelectItem key={cue.id} value={cue.id}>
                  <ZapIcon className="size-4 text-muted-foreground" />
                  {cue.name}
                </SelectItem>
              ))}
              <SelectItem value={CREATE_NEW_CUE_VALUE} disabled={!onCreateSlotCueBinding}>
                <PlusIcon className="size-4 text-muted-foreground" />
                Create new Cue
              </SelectItem>
            </SelectContent>
          </Select>
        </dd>
        {(binding.parameterMappings.length > 0 || !mappingsSound) && (
          <>
            <dt>Maps</dt>
            <dd className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {binding.parameterMappings.map((mapping, index) => {
                  const sourceParameter = source?.parameters?.find(
                    (candidate) => candidate.id === mapping.sourceParameterId,
                  );
                  const targetParameter = targetCue?.parameters?.find(
                    (candidate) => candidate.id === mapping.targetParameterId,
                  );
                  const fieldNames =
                    sourceParameter && mapping.sourceFieldPath
                      ? (fieldPathLabels(sourceParameter.type, mapping.sourceFieldPath, shapes) ??
                        mapping.sourceFieldPath)
                      : [];
                  const sourceLabel = [
                    sourceParameter?.name ?? mapping.sourceParameterId,
                    ...fieldNames,
                  ].join(".");
                  const targetLabel = targetParameter?.name ?? mapping.targetParameterId;
                  return (
                    <span
                      key={`${mapping.sourceParameterId}>${mapping.targetParameterId}>${index}`}
                      title={`${sourceLabel} → ${targetLabel}`}
                      className="flex min-w-0 items-center gap-1"
                    >
                      <span className="truncate">{sourceLabel}</span>
                      <ArrowRightIcon className="size-3 shrink-0" />
                      <span className="truncate">{targetLabel}</span>
                    </span>
                  );
                })}
                {!mappingsSound && (
                  <span className="text-destructive">
                    Not every parameter can be mapped to this Cue
                  </span>
                )}
              </div>
            </dd>
          </>
        )}
      </dl>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${sourceName} relay`}
        title="Delete relay"
        className="col-start-3 row-start-1 self-center justify-self-end"
        onClick={() => onRemoveSlotEventBinding?.(binding.id)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

/**
 * The selected Slot's saved Block Cue links, one row per Slot Event Binding in
 * authored order. Unbound Block Cues are deliberately not offered here — the
 * Interactions menu owns creation — so a Slot with no links yet renders
 * nothing and the section adds no chrome of its own.
 */
export function SlotEventsSection() {
  const {
    focused,
    target,
    selected,
    cues = [],
    shapes = [],
    slotEventBindings = [],
    onSetSlotEventBinding,
    onRemoveSlotEventBinding,
    onCreateSlotCueBinding,
  } = useCanvasInspectorContext();

  const bindings = useMemo(() => {
    if (!focused || selected.length !== 1 || target.type !== "slot") return [];
    return slotEventBindings
      .filter((candidate) => candidate.slotElementId === target.id)
      .slice()
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  }, [focused, selected.length, target, slotEventBindings]);

  // Relay targets are scoped to the focused Canvas's own Cues — the Scene an
  // outer Slot lives on, or the Block a nested one does — matching where a
  // relay is allowed to land.
  const owner: InteractionOwner | null = !focused
    ? null
    : focused.kind === "scene"
      ? { kind: "scene", sceneId: focused.artId }
      : { kind: "block", blockId: focused.artId };

  const cuesById = useMemo(() => new Map(cues.map((cue) => [cue.id, cue])), [cues]);
  const ownedCues = useMemo(
    () =>
      owner
        ? sortBy(
            cues.filter((cue) => ownerKey(cue.owner) === ownerKey(owner)),
            [(cue) => cue.name],
          )
        : [],
    [cues, owner],
  );

  if (bindings.length === 0) return null;

  return (
    <div className="col-span-full grid grid-cols-subgrid gap-x-2 gap-y-4">
      {bindings.map((binding) => (
        <SlotEventBindingRow
          key={binding.id}
          binding={binding}
          cuesById={cuesById}
          ownedCues={ownedCues}
          shapes={shapes}
          onSetSlotEventBinding={onSetSlotEventBinding}
          onRemoveSlotEventBinding={onRemoveSlotEventBinding}
          onCreateSlotCueBinding={onCreateSlotCueBinding}
        />
      ))}
    </div>
  );
}
