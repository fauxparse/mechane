import {
  Button,
  ChevronDownIcon,
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
    return eventBindings.filter(
      (candidate) => candidate.canvasId === focused.canvasId && candidate.elementId === target.id,
    );
  }, [eventBindings, focused, selected.length, target.id]);

  if (!focused || selected.length !== 1 || !owner) return null;
  const duplicateEventKind = EVENT_KINDS.find(
    (kind) => !bindings.some((binding) => binding.eventKind === kind),
  );

  const duplicateBinding = (binding: (typeof bindings)[number]) => {
    if (!duplicateEventKind) return;
    onCreateEventBinding?.({
      ...binding,
      id: generateId("eventBinding"),
      eventKind: duplicateEventKind,
    });
  };

  const { canvasId } = focused;

  const addInteraction = (eventKind: EventKind) => {
    const cue = ownedCues[0];
    if (!cue) {
      onCreateCue?.(owner);
      return;
    }
    if (bindings.some((binding) => binding.eventKind === eventKind)) return;
    onCreateEventBinding?.({
      id: generateId("eventBinding"),
      canvasId,
      elementId: target.id,
      eventKind,
      cueId: cue.id,
    });
  };

  return (
    <Section label="Interactions">
      {bindings.map((binding) => (
        <div
          key={binding.id}
          className="col-span-full grid grid-cols-subgrid *:[button]:col-start-3"
        >
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
          <Button
            className="-row-3"
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Duplicate ${INTERACTION_TITLES[binding.eventKind]} interaction`}
            title={
              duplicateEventKind ? "Duplicate interaction" : "No unused event kind is available"
            }
            disabled={!duplicateEventKind}
            onClick={() => duplicateBinding(binding)}
          >
            <CopyIcon />
          </Button>
          <Button
            className="-row-2"
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
                disabled={bindings.some((binding) => binding.eventKind === kind)}
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
