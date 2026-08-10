// The Editable Area: the region of the screen the Editor Chrome leaves visible.
//
// Both editors paint edge to edge, flowing underneath the floating sidebars and
// the toolbar, but every zoom-to-fit frames its target *here* so fitted content
// lands where it can be worked on. See docs/adr/0012.
//
// The context and its hook live in this module rather than beside the provider
// component, so an editor consuming the inset does not import a component file
// and cost itself Fast Refresh.
import { createContext, useContext } from "react";

/** Distance in px from each edge of the viewport to the Editable Area. */
export interface EditableAreaInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSET: EditableAreaInset = { top: 0, right: 0, bottom: 0, left: 0 };

export const EditableAreaContext = createContext<EditableAreaInset>(NO_INSET);

/**
 * The inset an editor should keep clear when framing content.
 *
 * Defaults to zero on every side, so an editor rendered with no layout around
 * it — in Storybook, or in isolation — frames the whole viewport and behaves
 * exactly as it did before the Editable Area existed.
 */
export function useEditableArea(): EditableAreaInset {
  return useContext(EditableAreaContext);
}
