import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  Button,
  ChevronDownIcon,
  cn,
  CopyIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LucideIcon,
  PlusIcon,
  PointerIcon,
  Section,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Trash2Icon,
  ZapIcon,
} from "@mechane/design-system";
import {
  EVENT_KINDS,
  generateId,
  type Cue,
  type EventBinding,
  type EventKind,
  type InteractionOwner,
} from "@mechane/domain";

import { sortBy } from "es-toolkit";
import { useMemo } from "react";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";

function ownerKey(owner: InteractionOwner): string {
  return owner.kind === "scene" ? `scene:${owner.sceneId}` : `block:${owner.blockId}`;
}

const INTERACTION_ICONS: Record<EventKind, LucideIcon> = {
  tap: PointerIcon,
};

const INTERACTION_TITLES: Record<EventKind, string> = {
  tap: "Tap",
};

const INTERACTION_DESCRIPTIONS: Record<EventKind, string> = {
  tap: "User taps or clicks on this",
};

const InteractionIcon = ({ kind, className }: { kind: EventKind; className?: string }) => {
  const Icon = INTERACTION_ICONS[kind];
  return <Icon className={className} />;
};
const bindingSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
          preventActivation: (event, source) => {
            if (!(event.target instanceof Element)) return false;
            if (source.handle?.contains(event.target)) return false;
            return Boolean(event.target.closest("input, textarea, button, a"));
          },
        })
      : sensor,
  );

type InteractionBindingRowProps = {
  binding: EventBinding;
  index: number;
  cuesById: ReadonlyMap<string, Cue>;
  ownedCues: readonly Cue[];
  onSetEventBindingCue?: (bindingId: string, cueId: string) => void;
  onDuplicate(binding: EventBinding): void;
  onRemoveEventBinding?: (bindingId: string) => void;
};

function InteractionBindingRow({
  binding,
  index,
  cuesById,
  ownedCues,
  onSetEventBindingCue,
  onDuplicate,
  onRemoveEventBinding,
}: InteractionBindingRowProps) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: binding.id,
    index,
    group: "event-bindings",
  });

  return (
    <div
      ref={ref}
      className={cn(
        "relative col-span-full grid grid-cols-subgrid grid-rows-[repeat(2,1.75rem)] gap-y-2 rounded-sm",
        isDragging ? "z-10 bg-background shadow-lg" : "",
        isDropTarget ? "ring-2 ring-primary" : "",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reorder ${INTERACTION_TITLES[binding.eventKind]} interaction`}
        aria-roledescription="sortable"
        className="absolute left-0 top-0 bottom-0 cursor-grab touch-none grippy w-2"
      />
      <dl className="col-span-2 row-span-2 pl-5 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-subgrid items-center gap-2 *:[dt]:label *:[dt]:col-start-1 *:[dd]:col-start-2">
        <dt>On</dt>
        <dd className="flex min-w-0 items-center gap-2">
          <Select value={binding.eventKind}>
            <SelectTrigger aria-label="Interaction Event" className="w-full min-w-0">
              <SelectValue placeholder="Choose an event" className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <InteractionIcon kind={binding.eventKind} className="size-4" />
                  <span className="truncate">{INTERACTION_TITLES[binding.eventKind]}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-(--anchor-width)">
              {EVENT_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  <InteractionIcon kind={kind} className="size-4" />
                  <span>{INTERACTION_TITLES[kind]}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </dd>
        <dt>Then</dt>
        <dd className="min-w-0">
          <Select
            value={binding.cueId}
            onValueChange={(value) => {
              if (value) onSetEventBindingCue?.(binding.id, value);
            }}
          >
            <SelectTrigger aria-label="Interaction Cue" className="w-full min-w-0">
              <SelectValue placeholder="Choose a Cue" className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <ZapIcon className="size-4 shrink-0" />
                  <span className="truncate">{cuesById.get(binding.cueId)?.name ?? "Unknown"}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ownedCues.map((cue) => (
                <SelectItem key={cue.id} value={cue.id}>
                  <ZapIcon className="size-4" />
                  {cue.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </dd>
      </dl>
      <div className="col-start-3 -row-start-3 row-span-2 grid grid-rows-subgrid grid-cols-subgrid [display:none]">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Duplicate ${INTERACTION_TITLES[binding.eventKind]} interaction`}
          title="Duplicate interaction"
          onClick={() => onDuplicate(binding)}
        >
          <CopyIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Delete ${INTERACTION_TITLES[binding.eventKind]} interaction`}
          title="Delete interaction"
          onClick={() => onRemoveEventBinding?.(binding.id)}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}

export function InteractionSection() {
  const {
    focused,
    target,
    selected,
    cues = [],
    eventBindings = [],
    onCreateCue,
    onSetEventBindingCue,
    onCreateEventBinding,
    onRemoveEventBinding,
    onReorderEventBindings,
  } = useCanvasInspectorContext();

  const owner = useMemo<InteractionOwner | null>(() => {
    if (!focused) return null;
    return focused.kind === "scene"
      ? { kind: "scene", sceneId: focused.artId }
      : { kind: "block", blockId: focused.artId };
  }, [focused]);

  const cuesById = useMemo(() => {
    if (!owner) return new Map<string, Cue>();
    return cues.reduce((acc, cue) => {
      if (ownerKey(cue.owner) === ownerKey(owner)) {
        acc.set(cue.id, cue);
      }
      return acc;
    }, new Map<string, Cue>());
  }, [cues, owner]);

  const ownedCues = useMemo(() => {
    return sortBy(Array.from(cuesById.values()), [(cue) => cue.name]);
  }, [cuesById]);

  const bindings = useMemo(() => {
    if (!focused || selected.length !== 1) return [];
    return eventBindings
      .filter(
        (candidate) => candidate.canvasId === focused.canvasId && candidate.elementId === target.id,
      )
      .slice()
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  }, [eventBindings, focused, selected.length, target.id]);

  if (!focused || selected.length !== 1 || !owner) return null;
  const duplicateBinding = (binding: (typeof bindings)[number]) => {
    const position =
      bindings.reduce((highest, candidate) => Math.max(highest, candidate.position), -1) + 1;
    onCreateEventBinding?.({
      ...binding,
      id: generateId("eventBinding"),
      position,
    });
  };

  const { canvasId } = focused;

  const addInteraction = (eventKind: EventKind) => {
    const cue = ownedCues[0];
    if (!cue) {
      onCreateCue?.(owner);
      return;
    }
    const position =
      bindings.reduce((highest, binding) => Math.max(highest, binding.position), -1) + 1;
    onCreateEventBinding?.({
      id: generateId("eventBinding"),
      canvasId,
      elementId: target.id,
      eventKind,
      cueId: cue.id,
      position,
    });
  };
  const finishDrag = (event: DragEndEvent) => {
    if (event.canceled) return;
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source || !target || !isSortable(source) || !isSortable(target)) return;
    if (typeof source.id !== "string" || typeof target.id !== "string") return;
    const bindingIds = bindings.map((binding) => binding.id);
    const sourceIndex = bindingIds.indexOf(source.id);
    if (
      sourceIndex < 0 ||
      bindingIds.indexOf(target.id) < 0 ||
      source.index < 0 ||
      source.index >= bindingIds.length ||
      sourceIndex === source.index
    ) {
      return;
    }
    const next = [...bindingIds];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    next.splice(source.index, 0, moved);
    onReorderEventBindings?.(next);
  };

  return (
    <Section label="Interactions">
      <DragDropProvider sensors={bindingSensors} onDragEnd={finishDrag}>
        <div className="grid grid-cols-subgrid gap-y-4 gap-x-2 col-span-full">
          {bindings.map((binding, index) => (
            <InteractionBindingRow
              key={binding.id}
              binding={binding}
              index={index}
              cuesById={cuesById}
              ownedCues={ownedCues}
              onSetEventBindingCue={onSetEventBindingCue}
              onDuplicate={duplicateBinding}
              onRemoveEventBinding={onRemoveEventBinding}
            />
          ))}
        </div>
      </DragDropProvider>
      <SectionRow>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="col-span-2">
                <div className="flex items-center justify-center gap-2 grow">
                  <PlusIcon />
                  Add interaction
                </div>
                <ChevronDownIcon />
              </Button>
            }
          ></DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--anchor-width)">
            {EVENT_KINDS.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onClick={() => addInteraction(kind)}
                className="grid grid-cols-[auto_1fr] items-center line-height-normal gap-x-2 gap-y-0"
              >
                <InteractionIcon kind={kind} className="row-span-2" />
                <span>{INTERACTION_TITLES[kind]}</span>
                <span className="text-xs text-muted-foreground">
                  {INTERACTION_DESCRIPTIONS[kind]}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SectionRow>
    </Section>
  );
}
