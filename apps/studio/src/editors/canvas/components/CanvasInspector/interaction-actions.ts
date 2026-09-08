import {
  generateId,
  type Cue,
  type EventBinding,
  type EventKind,
  type InteractionOwner,
} from "@mechane/domain";

type AddInteractionOptions = {
  eventKind: EventKind;
  owner: InteractionOwner;
  canvasId: string;
  elementId: string;
  bindings: readonly EventBinding[];
  ownedCues: readonly Cue[];
  onCreateCue?: (owner: InteractionOwner) => string | undefined;
  onCreateEventBinding?: (binding: EventBinding) => void;
  onCapturingChange: (bindingId: string | null) => void;
};

export function addInteraction({
  eventKind,
  owner,
  canvasId,
  elementId,
  bindings,
  ownedCues,
  onCreateCue,
  onCreateEventBinding,
  onCapturingChange,
}: AddInteractionOptions) {
  const cueId = ownedCues[0]?.id ?? onCreateCue?.(owner);
  if (!cueId) return;
  const position =
    bindings.reduce((highest, binding) => Math.max(highest, binding.position), -1) + 1;
  const id = generateId("eventBinding");
  const base = { id, canvasId, elementId, cueId, position };
  if (eventKind === "keypress") {
    // Created before a key is captured: an unset key is valid and inert
    // (#517), so the row can exist while the author decides.
    onCreateEventBinding?.({ ...base, eventKind: "keypress", params: { key: null } });
    // The author just picked "Keypress"; the next thing they want is to
    // press a key.
    onCapturingChange(id);
    return;
  }
  onCreateEventBinding?.({ ...base, eventKind: "tap" });
  onCapturingChange(null);
}
