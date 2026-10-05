import { addCue, composite, findCanvasElement, setSlotEventBinding } from "@mechane/commands";
import type { ShowGraphCommand } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { generateId } from "@mechane/domain/id";
import type { Cue, InteractionOwner, SlotEventBinding } from "@mechane/domain/interactions";
import type { CanvasArtboardDocument } from "../../../api/canvas";
import { slotCueParameterMappings } from "../components/CanvasInspector/slot-event-options";

type SlotCueBindingOptions = {
  graph: ShowGraph;
  focused: CanvasArtboardDocument;
  sourceCueId: string;
  slotElementId: string;
  bindingId?: string;
  createNew?: boolean;
};

export function slotCueBindingCommand({
  graph,
  focused,
  sourceCueId,
  slotElementId,
  bindingId,
  createNew = false,
}: SlotCueBindingOptions): ShowGraphCommand {
  const source = graph.cues?.find((cue) => cue.id === sourceCueId);
  const slot = findCanvasElement(focused.canvas.root, slotElementId);
  if (
    !source ||
    source.owner.kind !== "block" ||
    slot?.type !== "slot" ||
    slot.blockId !== source.owner.blockId
  ) {
    throw new Error("The Slot does not expose that Block Cue.");
  }
  const owner: InteractionOwner =
    focused.kind === "scene"
      ? { kind: "scene", sceneId: focused.artId }
      : { kind: "block", blockId: focused.artId };
  const ownedCues = (graph.cues ?? []).filter((cue) =>
    owner.kind === "scene"
      ? cue.owner.kind === "scene" && cue.owner.sceneId === owner.sceneId
      : cue.owner.kind === "block" && cue.owner.blockId === owner.blockId,
  );
  const previous = bindingId
    ? graph.slotEventBindings?.find((binding) => binding.id === bindingId)
    : undefined;
  if (
    bindingId &&
    (!previous || previous.slotElementId !== slotElementId || previous.sourceCueId !== sourceCueId)
  ) {
    throw new Error("The Slot Cue binding no longer belongs to this event.");
  }
  const compatible = createNew
    ? undefined
    : ownedCues.find((cue) => slotCueParameterMappings(source, cue, graph.shapes ?? []) !== null);
  let name = source.name;
  for (let suffix = 2; ownedCues.some((cue) => cue.name === name); suffix += 1) {
    name = `${source.name} ${suffix}`;
  }
  const target: Cue = compatible ?? {
    id: generateId("cue"),
    name,
    owner,
    actionIds: [],
    parameters: (source.parameters ?? []).map((parameter) => ({
      ...parameter,
      id: generateId("variable"),
    })),
  };
  const parameterMappings = slotCueParameterMappings(source, target, graph.shapes ?? []);
  if (parameterMappings === null)
    throw new Error("The Cue cannot receive this Block event's parameters.");
  const binding: SlotEventBinding = {
    id: previous?.id ?? generateId("eventBinding"),
    slotElementId,
    sourceCueId,
    targetCueId: target.id,
    parameterMappings,
    position:
      previous?.position ??
      (graph.slotEventBindings ?? []).reduce(
        (highest, candidate) =>
          candidate.slotElementId === slotElementId
            ? Math.max(highest, candidate.position)
            : highest,
        -1,
      ) + 1,
  };
  return composite({
    label: "Connect Block Cue",
    commands: [...(compatible ? [] : [addCue(target)]), setSlotEventBinding(binding)],
  });
}
