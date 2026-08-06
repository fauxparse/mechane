import { Button } from "@presence/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef } from "react";

import { ShowGraphEditor } from "./ShowGraphEditor";
import type { ShowGraphEditorHandle } from "./ShowGraphEditor";
import { SAMPLE_GRAPH, VOTE_FLOW_NODE_IDS } from "./sample-graph";

const meta: Meta<typeof ShowGraphEditor> = {
  title: "app-studio/ShowGraphEditor",
  component: ShowGraphEditor,
  parameters: { layout: "fullscreen" },
  args: { graph: SAMPLE_GRAPH },
  // React Flow measures its container, so it needs one with a real height.
  render: (args) => (
    <div className="h-[36rem] w-full">
      <ShowGraphEditor {...args} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof ShowGraphEditor>;

/**
 * The camera, end to end: drag to pan, scroll or the Controls to zoom, arrow
 * keys to pan (click the background first so no node holds focus), `+`/`-`
 * to zoom, and click anywhere in the minimap to jump.
 */
export const Default: Story = {};

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
 * palette. Select some nodes (Shift+drag box-selects) and press the button.
 */
export const FramingNodes: Story = {
  render: () => <FramingDemo />,
};

function FramingDemo() {
  const editor = useRef<ShowGraphEditorHandle>(null);
  return (
    <div className="flex h-[36rem] w-full flex-col gap-2 p-2">
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
