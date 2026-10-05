import { composite, setCue, setEventBinding, setSlotEventBinding } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { generateId } from "@mechane/domain/id";
import type { SlotInputSource } from "@mechane/domain/canvas";
import type {
  Cue,
  CueParameter,
  EventBinding,
  SlotEventBinding,
} from "@mechane/domain/interactions";
import type { Type } from "@mechane/domain/shapes";

export interface CueValueSource {
  name: string;
  type: Type;
  source: SlotInputSource;
}

export function passCueValueCommand(
  graph: ShowGraph,
  bindingId: string,
  value: CueValueSource,
  parameterId?: string,
) {
  const binding = graph.eventBindings?.find((candidate) => candidate.id === bindingId);
  const cue = graph.cues?.find((candidate) => candidate.id === binding?.cueId);
  if (!binding || !cue) throw new Error("The interaction no longer exists.");
  const existing = cue.parameters?.find((parameter) =>
    parameterId
      ? parameter.id === parameterId
      : parameter.name === value.name &&
        JSON.stringify(parameter.type) === JSON.stringify(value.type),
  );
  const parameter: CueParameter = existing ?? {
    id: generateId("variable"),
    name: value.name,
    type: value.type,
    position: Math.max(-1, ...(cue.parameters ?? []).map((parameter) => parameter.position)) + 1,
  };
  if (existing && JSON.stringify(existing.type) !== JSON.stringify(value.type))
    throw new Error("The value Type does not match the Cue parameter.");
  const cues = new Map<string, Cue>();
  const slots = new Map<string, SlotEventBinding>();
  const events = new Map<string, EventBinding>();
  if (!existing) cues.set(cue.id, { ...cue, parameters: [...(cue.parameters ?? []), parameter] });
  for (const current of graph.eventBindings ?? []) {
    if (current.cueId !== cue.id || (existing && current.id !== bindingId)) continue;
    events.set(current.id, {
      ...current,
      parameterMappings: [
        ...(current.parameterMappings ?? []).filter(
          (mapping) => mapping.parameterId !== parameter.id,
        ),
        { parameterId: parameter.id, source: value.source },
      ],
    });
  }
  const queue = [{ cue, parameter }];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const hop = queue[index];
    if (!hop || visited.has(hop.cue.id)) continue;
    visited.add(hop.cue.id);
    for (const original of graph.slotEventBindings ?? []) {
      if (original.sourceCueId !== hop.cue.id) continue;
      const relay = slots.get(original.id) ?? original;
      if (relay.parameterMappings.some((mapping) => mapping.sourceParameterId === hop.parameter.id))
        continue;
      const target =
        cues.get(relay.targetCueId) ??
        graph.cues?.find((candidate) => candidate.id === relay.targetCueId);
      if (!target) throw new Error("The receiving Cue no longer exists.");
      let targetParameter = target.parameters?.find(
        (candidate) =>
          candidate.name === hop.parameter.name &&
          JSON.stringify(candidate.type) === JSON.stringify(hop.parameter.type),
      );
      if (!targetParameter) {
        let name = hop.parameter.name;
        for (
          let suffix = 2;
          target.parameters?.some((candidate) => candidate.name === name);
          suffix++
        )
          name = `${hop.parameter.name} ${suffix}`;
        targetParameter = {
          ...hop.parameter,
          id: generateId("variable"),
          name,
          position:
            Math.max(-1, ...(target.parameters ?? []).map((candidate) => candidate.position)) + 1,
        };
        const next = { ...target, parameters: [...(target.parameters ?? []), targetParameter] };
        cues.set(next.id, next);
        const addedParameter = targetParameter;
        // Every inbound binding must map every parameter before the batch is persisted.
        for (const inbound of graph.slotEventBindings ?? []) {
          if (inbound.targetCueId !== next.id || inbound.id === relay.id) continue;
          const sourceCue =
            cues.get(inbound.sourceCueId) ??
            graph.cues?.find((candidate) => candidate.id === inbound.sourceCueId);
          const sourceParameter = sourceCue?.parameters?.find(
            (candidate) =>
              candidate.name === addedParameter.name &&
              JSON.stringify(candidate.type) === JSON.stringify(addedParameter.type),
          );
          if (!sourceParameter)
            throw new Error(
              `Another event handling ${next.name} cannot supply ${targetParameter.name}. Choose a separate receiving Cue first.`,
            );
          const previous = slots.get(inbound.id) ?? inbound;
          slots.set(inbound.id, {
            ...previous,
            parameterMappings: [
              ...previous.parameterMappings,
              { sourceParameterId: sourceParameter.id, targetParameterId: targetParameter.id },
            ],
          });
        }
        for (const inbound of graph.eventBindings ?? []) {
          if (inbound.cueId !== next.id) continue;
          const previous = events.get(inbound.id) ?? inbound;
          events.set(inbound.id, {
            ...previous,
            parameterMappings: [
              ...(previous.parameterMappings ?? []),
              { parameterId: targetParameter.id, source: { kind: "unset" } },
            ],
          });
        }
      }
      slots.set(relay.id, {
        ...relay,
        parameterMappings: [
          ...relay.parameterMappings,
          { sourceParameterId: hop.parameter.id, targetParameterId: targetParameter.id },
        ],
      });
      queue.push({ cue: cues.get(target.id) ?? target, parameter: targetParameter });
    }
  }
  return composite({
    label: "Pass interaction value",
    commands: [
      ...Array.from(cues.values(), (cue) => setCue(cue)),
      ...Array.from(events.values(), (binding) => setEventBinding(binding)),
      ...Array.from(slots.values(), (binding) => setSlotEventBinding(binding)),
    ],
  });
}
