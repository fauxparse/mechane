// The one place framing options are decided for the Show Editor.
//
// The editor paints edge to edge, underneath the Editor Chrome, but fitted
// content has to land in the Editable Area — the part of the screen the Chrome
// leaves visible. React Flow takes per-side padding, so the Editable Area's
// inset goes straight in as padding (docs/adr/0012).
//
// With no Chrome around the editor the inset is zero on every side and this
// reduces to the framing behaviour the editor had before the Editable Area
// existed.
import { SIDEBAR_TRANSITION_MS } from "@mechane/design-system";
import { useStore } from "@xyflow/react";
import type { FitViewOptions } from "@xyflow/react";
import { useEffect, useMemo, useRef } from "react";

import { useEditableArea } from "../../../components/EditorLayout";

/**
 * Breathing room around fitted content, as a fraction — React Flow's own
 * relative-padding scale, where 0.2 means "leave room for 20% more graph".
 */
const RELATIVE_PADDING = 0.2;

/**
 * Reproduces React Flow's conversion of a relative padding to pixels, so the
 * breathing room keeps the feel it had when `padding: 0.2` was passed directly.
 * Ours is measured against the Editable Area rather than the whole viewport,
 * because that is the space the content is actually being fitted into.
 */
function breathingRoom(extent: number): number {
  if (extent <= 0) return 0;
  return Math.floor((extent - extent / (1 + RELATIVE_PADDING)) * 0.5);
}

/**
 * Framing options for every fit in the Show Editor.
 *
 * `maxZoom: 1` because framing should never zoom past 1:1 — a two-node
 * selection filling the screen at 2× is disorienting rather than helpful. The
 * duration is the sidebars' so that a fit happening while a sidebar slides
 * reads as one motion rather than two.
 */
export function useFitViewOptions(): FitViewOptions {
  const inset = useEditableArea();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  return useMemo(() => {
    const editableWidth = Math.max(0, width - inset.left - inset.right);
    const editableHeight = Math.max(0, height - inset.top - inset.bottom);
    const roomX = breathingRoom(editableWidth);
    const roomY = breathingRoom(editableHeight);

    return {
      padding: {
        top: `${inset.top + roomY}px`,
        right: `${inset.right + roomX}px`,
        bottom: `${inset.bottom + roomY}px`,
        left: `${inset.left + roomX}px`,
      },
      maxZoom: 1,
      duration: SIDEBAR_TRANSITION_MS,
    } satisfies FitViewOptions;
  }, [height, inset.bottom, inset.left, inset.right, inset.top, width]);
}

/**
 * How long after mount a corrective initial frame may still fire. Long enough
 * for the Chrome to measure itself and for React Flow to measure nodes; short
 * enough that it cannot fight a director who has already started panning.
 */
const INITIAL_FRAME_GRACE_MS = 1000;

/**
 * Re-frames the graph once if the Editable Area only became known *after* React
 * Flow's declarative `fitView` had already run.
 *
 * The ordering is unavoidable: the Chrome cannot measure its header and cannot
 * know which sidebars exist until the editor inside it has rendered and declared
 * its panels, which is one or two commits after the editor first paints. Without
 * this, opening a Show would frame the graph against the bare viewport and leave
 * it sitting partly under the sidebars.
 *
 * Deliberately *not* a general re-fit-on-inset-change: collapsing a sidebar
 * later must leave the viewport alone (docs/adr/0012), so this is limited to one
 * correction inside a short window after mount.
 */
export function useInitialFrame(
  fitView: (options: FitViewOptions) => void,
  options: FitViewOptions,
): void {
  const inset = useEditableArea();
  const mountedAt = useRef<number | null>(null);
  const corrected = useRef(false);
  // Read through a ref so a new options object cannot re-trigger the effect.
  const latestOptions = useRef(options);
  latestOptions.current = options;

  const insetTotal = inset.top + inset.right + inset.bottom + inset.left;

  useEffect(() => {
    mountedAt.current ??= performance.now();
    if (corrected.current || insetTotal === 0) return;
    if (performance.now() - mountedAt.current > INITIAL_FRAME_GRACE_MS) return;
    corrected.current = true;
    fitView(latestOptions.current);
  }, [fitView, insetTotal]);
}
