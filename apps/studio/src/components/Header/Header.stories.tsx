import type { Meta, StoryObj } from "@storybook/react-vite";

import { Header } from "./Header";
import { MOCK_HEADER } from "../EditorLayout/editor-layout-fixtures";

// The sidebar trigger only renders inside a SidebarProvider, so it is absent
// here by design — see EditorLayout.stories.tsx for the Header in its Chrome.
const meta: Meta<typeof Header> = {
  title: "studio/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
  args: MOCK_HEADER,
  decorators: [
    (Story) => (
      <div className="bg-background p-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};

export const CanvasEditorActive: Story = {
  args: { activeEditor: "canvas" },
};

export const RunActive: Story = {
  args: { runActive: true, publishState: "published" },
};

export const NothingToPublish: Story = {
  args: { publishState: "published" },
};

export const NeverPublished: Story = {
  args: { publishState: "empty" },
};

export const Publishing: Story = {
  args: { publishing: true },
};

export const RunPending: Story = {
  args: { runPending: true },
};

export const RenameError: Story = {
  args: { renameError: "A Show with that name already exists." },
};

/** No display name on the account, so the avatar falls back to the email. */
export const NoDisplayName: Story = {
  args: { user: { name: null, email: "director@example.com" } },
};
