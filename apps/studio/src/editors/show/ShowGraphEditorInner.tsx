// The Show editor's graph surface: the camera (issue #40, spec'd by #21) plus
// the interaction slice (issue #42, spec'd by #27, #35, #36, #37).
//
// Camera decisions worth not re-litigating (#21):
//
//   - `minZoom: 0.1` is widened from React Flow's 0.5 floor, so a director can
//     pull back far enough to see a whole Show at once.
//   - `<Controls/>` and `<MiniMap/>` are React Flow's own, restyled — they ship
//     hardcoded white chrome and are unreadable on a dark background, so
//     ./show-graph-editor.css is load-bearing, not polish.
//   - Wheel scrolls, Cmd/Ctrl+wheel zooms, click-drag box-selects, and
//     Space+drag pans: the Figma-compatible pointer model (#57).
//
// Editing decisions (#42):
//
//   - **Every mutation is a Command** (#41), which is what makes Cmd+Z work and
//     what carries edits to the server (ADR-0005 — one path, undo included).
//     The graph drawn here is the command stack's state, not the query result.
//   - **React Flow's own deletion is off** (`deleteKeyCode={null}`). Backspace
//     has to go through a Command so a cascading delete is one undo entry, and
//     a non-empty Flow gets its confirmation first (#27, #28, #36).
//   - **`selectionMode: Full`** (#36): these nodes are large — a Flow can be
//     ~560px across — so under React Flow's `Partial` default a drag clipping
//     one corner would select a whole Flow and its contents.
//   - **Everything else about selection is React Flow's** (#36): Shift+drag
//     box-select, Cmd/Ctrl+click to toggle, Tab/Enter/arrows for keyboard
//     a11y, kept on wholesale rather than reimplemented.
//   - **A drag's valid targets are the domain's answer** (`connectionTargets`),
//     computed once at drag start; the affordance itself is #35's dashed
//     outline plus dimming, painted by the graph node adapters.
import { cn } from "@mechane/design-system";
import type { Connection } from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import "./graph/show-graph-editor.css";

import { NodeInteractionProvider } from "./graph/node-interaction";
import { useShowGraphEditorController } from "./commands/use-show-graph-editor-controller";
import { ShowGraphContextMenu } from "./ShowGraphContextMenu";
import { ShowGraphEditorOverlays } from "./ShowGraphEditorOverlays";
import type { ShowGraphEditorProps } from "./ShowGraphEditor";

export function ShowGraphEditorInner(props: ShowGraphEditorProps) {
  const {
    editing,
    interaction,
    menuPosition,
    selectedNodes,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    selectedNodeIds,
    selectedEdgeIds,
    beginDrag,
    dragTo,
    endDrag,
    create,
    requestDelete,
    fitView,
    fitViewOptions,
    screenToFlowPosition,
    onConnect,
    isValidConnection,
    jumpToMinimapPoint,
    paletteCommands,
    paletteOpen,
    setPaletteOpen,
    pendingDelete,
    setPendingDelete,
    message,
    confirmDelete,
  } = useShowGraphEditorController(props);
  const { initialViewport, onViewportChange, className } = props;

  return (
    <NodeInteractionProvider value={interaction}>
      <div
        className={cn("mechane-show-graph relative h-full w-full bg-background", className)}
        data-flow-theme="neutral"
      >
        <ShowGraphContextMenu
          menuPosition={menuPosition}
          selectedNodes={selectedNodes}
          screenToFlowPosition={screenToFlowPosition}
          create={create}
          fitView={fitView}
          fitViewOptions={fitViewOptions}
          initialViewport={initialViewport}
          onViewportChange={onViewportChange}
          selectedNodeIds={selectedNodeIds}
          selectedEdgeIds={selectedEdgeIds}
          requestDelete={requestDelete}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          beginDrag={beginDrag}
          dragTo={dragTo}
          endDrag={endDrag}
          editing={editing}
          onConnect={onConnect}
          isValidConnection={(connection) => isValidConnection(connection as Connection)}
          jumpToMinimapPoint={jumpToMinimapPoint}
        />

        <ShowGraphEditorOverlays
          selectedNodes={selectedNodes}
          editing={editing}
          message={message}
          paletteOpen={paletteOpen}
          setPaletteOpen={setPaletteOpen}
          paletteCommands={paletteCommands}
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          confirmDelete={confirmDelete}
        />
      </div>
    </NodeInteractionProvider>
  );
}
