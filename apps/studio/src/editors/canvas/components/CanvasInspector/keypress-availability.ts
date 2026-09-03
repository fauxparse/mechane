import type { InteractionOwner } from "@mechane/domain";

/**
 * Why a Keypress can't be added to the current selection, or null when it can.
 *
 * Canvas-level scope is a root-Element binding, so a Keypress anywhere else is
 * inert — it would never fire. The domain can't reject it (`ShowGraph` carries
 * no Canvas data, so it cannot tell a root from any other Element), which
 * makes the Add-interaction menu the only place an author finds out. Disabled
 * with the reason rather than hidden, because "keypress lives on the Scene
 * background" is otherwise undiscoverable.
 */
export function keypressUnavailableReason(
  ownerKind: InteractionOwner["kind"],
  isCanvasRoot: boolean,
): string | null {
  if (ownerKind === "block") return "Only Scenes can listen for keypresses";
  if (!isCanvasRoot) return "Select the Scene background to add a Keypress";
  return null;
}
