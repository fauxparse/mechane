import type { Meta, StoryObj } from "@storybook/react-vite";

import { ShowEditorChrome } from "./ShowEditorChrome";

const meta: Meta<typeof ShowEditorChrome> = {
  title: "app-studio/ShowEditorChrome",
  component: ShowEditorChrome,
  args: {
    name: "The Tempest",
    publishState: "unpublished-changes",
    onBack: () => {},
    onRename: () => {},
    onDelete: () => {},
    onPublish: () => {},
  },
  // The chrome is positioned absolutely over the editor, so it needs a
  // relatively positioned stand-in for one to float over.
  render: (args) => (
    <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted/40">
      <ShowEditorChrome {...args} />
    </div>
  ),
};

export default meta;
type Story = StoryObj<typeof ShowEditorChrome>;

export const UnpublishedChanges: Story = {};

export const Published: Story = {
  args: { publishState: "published" },
};

export const EmptyShow: Story = {
  args: { publishState: "empty" },
};

export const Publishing: Story = {
  args: { publishing: true },
};

export const LongName: Story = {
  args: { name: "A Midsummer Night's Dream, Abridged and Interactive" },
};

export const RenameError: Story = {
  args: { renameError: "A Show needs a name." },
};
