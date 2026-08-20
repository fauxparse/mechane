import { Button } from "@mechane/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComponentProps, useRef } from "react";

import { ShowGraphEditor } from "./ShowGraphEditor";
import type { ShowGraphEditorHandle } from "./ShowGraphEditor";
import { SAMPLE_GRAPH, VOTE_FLOW_NODE_IDS } from "./data/sample-graph";

const meta: Meta<typeof ShowGraphEditor> = {
  title: "studio/ShowGraphEditor",
  component: ShowGraphEditor,
  parameters: { layout: "fullscreen" },
  args: { graph: SAMPLE_GRAPH },
  // React Flow measures its container, so it needs one with a real height.
  render: (args: ComponentProps<typeof ShowGraphEditor>) => (
    <div className="h-144 w-full">
      <ShowGraphEditor {...args} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof ShowGraphEditor>;

/**
 * The camera, end to end: wheel to scroll, Cmd/Ctrl+wheel to zoom,
 * click-drag to rubber-band select, Space+drag to pan, arrow keys to pan
 * (click the background first so no node holds focus), `+`/`-` to zoom, and
 * click anywhere in the minimap to jump.
 */
export const Default: Story = {};

const COLORFUL_GRAPH = {
  ...SAMPLE_GRAPH,
  nodes: SAMPLE_GRAPH.nodes.map((node, index) =>
    node.__typename === "FlowNode"
      ? { ...node, color: (["red", "aqua", "purple"] as const)[index % 3] }
      : node,
  ),
};

/** Each Flow can carry its own subtle colorway (#316). */
export const FlowColors: Story = {
  args: { graph: COLORFUL_GRAPH },
};

/**
 * Creating nodes (#42, #27). Two paths, both here:
 *
 *   - **Right-click** empty canvas → Create → a kind. The node lands exactly
 *     where you clicked; right-clicking *inside* a Flow's boundary creates it
 *     in that Flow, because containment is placement (#29).
 *   - **⌘K** → "Create Scene". Verb-first labels mean typing "cre" surfaces
 *     every creation command at once (#37), and the node lands beside the
 *     selection or in the middle of the view.
 *
 * Flows and Devices are always Show-level peers (#23, #26), so they ignore the
 * Flow you right-clicked inside.
 */
export const CreatingNodes: Story = {};

/**
 * Connecting (#42, #27, #35). Drag from a node's right-hand handle: valid
 * targets take a dashed outline and everything else dims to 25%, which answers
 * "why can't I drop here" by showing where you can — without painting the
 * canvas red (#35 rejected that: a cycle rule can invalidate most of a graph at
 * once, and accusing it during a routine action is hostile).
 *
 * Worth trying, because each is a rule rather than an accident:
 *
 *   - A Source's drag offers **Variable rows**, not Scene bodies — wiring lands
 *     on a Variable (#20). A Scene with no Variables offers nothing; add one in
 *     the inspector.
 *   - A Scene's drag offers other Scenes **in the same Flow** for Navigate
 *     edges, while dropping a Scene into or out of a Flow changes membership.
 *   - A Flow's drag offers only Devices.
 *   - Refused drops say why, at the foot of the canvas.
 */
export const ConnectingEdges: Story = {};

/**
 * Deleting (#42, #27, #36). Select something and press Backspace or Delete.
 *
 * Most deletions just happen — undo is the safety net. The exception is a
 * **non-empty Flow**, which confirms first and names the whole blast radius;
 * a bulk delete containing several asks once, not once per Flow (#36).
 *
 * However wide the cascade, it's **one** undo entry: one ⌘Z brings back every
 * Scene, every Variable, and every edge, at their original positions (#28).
 */
export const DeletingWithCascade: Story = {};

/**
 * The inspector (#42, #27, #36). Select a node: its name is editable here as
 * well as inline (double-click a node, or F2). A Scene's **Variables** are
 * editable here too, because they're the Scene's own ports (#20) — and a Scene
 * with none has nothing for a wiring edge to land on, so this is where a new
 * Scene becomes wirable.
 *
 * Select several and the panel shows a count and a type breakdown, with no
 * editing (#36): multi-edit semantics for Transformer expressions were never
 * scoped, and confirming what you're about to delete is a better use of the
 * surface than an empty form.
 */
export const Inspector: Story = {};

/**
 * Undo/redo (#41). Drag a node — however far, through however many frames —
 * and press Cmd+Z (Ctrl+Z on Windows): the node returns to where the drag
 * started, in **one** press, because a whole gesture is one undo entry (#28).
 * Shift+Cmd+Z puts it back.
 *
 * Two things worth trying, because both are decisions rather than accidents:
 *
 *   - Drag a top-level Scene into a Flow, or a Flow-local Scene out of one;
 *     membership changes are part of the same undo entry.
 *   - Box-select several nodes (click-drag) and drag them together — that's
 *     still one entry, not one per node.
 *   - Click a node and release without moving it. Nothing lands on the stack,
 *     so the next Cmd+Z reaches the edit before it.
 *
 * Nothing is saved: persistence arrives with the CRUD slice (#42), which
 * attaches to the command stack's `dispatch` seam.
 */
export const UndoRedo: Story = {};

/** A Show nobody has drawn on yet — valid and unremarkable (#25). */
export const EmptyShow: Story = {
  args: { graph: { nodes: [], edges: [] } },
};

/** While the graph is still in flight. The camera is live regardless. */
export const Loading: Story = {
  args: { graph: null },
};

/**
 * Zoom-to-selection and zoom-to-set, driven through the imperative handle —
 * which is how they'll be driven by the shortcut map (#37) and the command
 * palette. Select some nodes (click-drag box-selects) and press the button.
 */
export const FramingNodes: Story = {
  render: () => <FramingDemo />,
};

function FramingDemo() {
  const editor = useRef<ShowGraphEditorHandle>(null);
  return (
    <div className="flex h-144 w-full flex-col gap-2 p-2">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => editor.current?.fitToNodes(VOTE_FLOW_NODE_IDS)}>
          Frame the vote Flow
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!editor.current?.zoomToSelection()) editor.current?.fitToGraph();
          }}
        >
          Zoom to selection
        </Button>
        <Button size="sm" variant="ghost" onClick={() => editor.current?.fitToGraph()}>
          Fit whole Show
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <ShowGraphEditor ref={editor} graph={SAMPLE_GRAPH} />
      </div>
    </div>
  );
}
