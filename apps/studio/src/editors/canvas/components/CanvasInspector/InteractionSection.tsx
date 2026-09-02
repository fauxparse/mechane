import {
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
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
  const moveBinding = (bindingId: string, offset: -1 | 1) => {
    const index = bindings.findIndex((binding) => binding.id === bindingId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= bindings.length) return;
    const nextOrder = bindings.map((binding) => binding.id);
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex]!, nextOrder[index]!];
    onReorderEventBindings?.(nextOrder);
  };

  return (
    <Section label="Interactions">
      {bindings.map((binding, index) => (
        <div key={binding.id} className="col-span-full grid grid-cols-subgrid">
          <dl className="col-span-2 row-span-2 grid grid-cols-[auto_1fr] grid-rows-subgrid items-center gap-x-2 gap-y-1 *:[dt]:label *:[dt]:col-start-1 *:[dd]:col-start-2">
            <dt>On</dt>
            <dd className="flex items-center gap-2">
              <Select value={binding.eventKind}>
                <SelectTrigger aria-label="Interaction Event">
                  <SelectValue placeholder="Choose an event">
                    <div className="flex items-center gap-2">
                      <InteractionIcon kind={binding.eventKind} className="size-4" />
                      {INTERACTION_TITLES[binding.eventKind]}
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
            <dd>
              <Select
                value={binding.cueId}
                onValueChange={(value) => {
                  if (value) onSetEventBindingCue?.(binding.id, value);
                }}
              >
                <SelectTrigger aria-label="Interaction Cue">
                  <SelectValue placeholder="Choose a Cue" className="">
                    <div className="flex items-center gap-2">
                      <ZapIcon className="size-4" />
                      {cuesById.get(binding.cueId)?.name ?? "Unknown"}
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
          <div className="col-start-3 row-span-2 flex flex-col gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${INTERACTION_TITLES[binding.eventKind]} interaction earlier`}
              title="Move interaction earlier"
              disabled={index === 0}
              onClick={() => moveBinding(binding.id, -1)}
            >
              <ChevronUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Move ${INTERACTION_TITLES[binding.eventKind]} interaction later`}
              title="Move interaction later"
              disabled={index === bindings.length - 1}
              onClick={() => moveBinding(binding.id, 1)}
            >
              <ChevronDownIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Duplicate ${INTERACTION_TITLES[binding.eventKind]} interaction`}
              title="Duplicate interaction"
              onClick={() => duplicateBinding(binding)}
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
      ))}
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
