import type { Meta, StoryObj } from "@storybook/react-vite";

import { EditorLayout, EditorPanel } from "./EditorLayout";
import { EditorSlot } from "./editor-slots";
import { useEditableArea } from "./editable-area";
import { MOCK_HEADER } from "./editor-layout-fixtures";

/**
 * A stand-in editor that draws what it is given: a full-bleed surface that runs
 * under the sidebars, with the Editable Area outlined on top of it. Collapse a
 * sidebar and the outline grows to match — that outline is the rectangle a
 * zoom-to-fit frames into.
 */
function EditableAreaProbe({ label }: { label: string }) {
  const inset = useEditableArea();
  return (
    <div className="relative size-full overflow-hidden bg-[repeating-linear-gradient(45deg,var(--color-muted)_0_10px,transparent_10px_20px)]">
      <div
        className="pointer-events-none absolute rounded-lg border-2 border-dashed border-primary/70 transition-all duration-200 ease-linear"
        style={{
          top: inset.top,
          right: inset.right,
          bottom: inset.bottom,
          left: inset.left,
        }}
      >
        <span className="absolute top-2 left-2 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          Editable Area — {label}
        </span>
        <span className="absolute right-2 bottom-2 rounded bg-card px-2 py-0.5 font-mono text-xs text-card-foreground shadow">
          inset {inset.top} / {inset.right} / {inset.bottom} / {inset.left}
        </span>
      </div>
    </div>
  );
}

function ToolbarStandIn() {
  return (
    <div className="pointer-events-auto rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm shadow-lg">
      Editor toolbar
    </div>
  );
}

const meta: Meta<typeof EditorLayout> = {
  title: "studio/EditorLayout",
  component: EditorLayout,
  parameters: { layout: "fullscreen" },
  args: { header: MOCK_HEADER },
};

export default meta;
type Story = StoryObj<typeof EditorLayout>;

/**
 * The Canvas editor's shape: both sidebars, a toolbar, and an editor painting
 * edge to edge underneath all of it.
 */
export const CanvasEditor: Story = {
  args: { header: { ...MOCK_HEADER, activeEditor: "canvas" } },
  render: (args) => (
    <EditorLayout {...args}>
      <EditableAreaProbe label="both sidebars" />
      <EditorSlot name="left">
        <EditorPanel title="Layers">
          <p className="p-3 text-sm text-muted-foreground">The layer tree goes here.</p>
        </EditorPanel>
      </EditorSlot>
      <EditorSlot name="right">
        <EditorPanel title="Properties">
          <p className="p-3 text-sm text-muted-foreground">Element properties go here.</p>
        </EditorPanel>
      </EditorSlot>
      <EditorSlot name="toolbar">
        <ToolbarStandIn />
      </EditorSlot>
    </EditorLayout>
  ),
};

/**
 * The Show editor's shape. It contributes no left panel, so there is no left
 * sidebar and nothing reserved for one on that side of the Editable Area.
 */
export const ShowEditor: Story = {
  render: (args) => (
    <EditorLayout {...args}>
      <EditableAreaProbe label="right sidebar only" />
      <EditorSlot name="right">
        <EditorPanel title="Properties">
          <p className="p-3 text-sm text-muted-foreground">Selected node properties go here.</p>
        </EditorPanel>
      </EditorSlot>
    </EditorLayout>
  ),
};

/**
 * Collapsed to start. The editor still paints the full viewport; the Editable
 * Area is simply almost all of it, so a fit now uses the whole screen.
 */
export const SidebarsCollapsed: Story = {
  args: { defaultSidebarsOpen: false, header: { ...MOCK_HEADER, activeEditor: "canvas" } },
  render: CanvasEditor.render,
};

/** A Run in progress: the Live indicator replaces "Go live". */
export const RunActive: Story = {
  args: { header: { ...MOCK_HEADER, runActive: true, publishState: "published" } },
  render: ShowEditor.render,
};

/** Nothing published yet, so the menu offers no changes to publish. */
export const NeverPublished: Story = {
  args: { header: { ...MOCK_HEADER, publishState: "empty" } },
  render: ShowEditor.render,
};

/** A rename the server rejected. */
export const RenameError: Story = {
  args: {
    header: { ...MOCK_HEADER, renameError: "A Show with that name already exists." },
  },
  render: ShowEditor.render,
};
