import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { PublishingSection } from "./PublishingSection";

const meta: Meta<typeof PublishingSection> = {
  title: "studio/Components/ShowSettings/PublishingSection",
  component: PublishingSection,
  args: { autoPublish: true, onAutoPublishChange: () => {} },
  decorators: [
    (Story) => (
      <div className="max-w-3xl bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PublishingSection>;

/** The default for every Show: changes go out as they are saved. */
export const AutoPublish: Story = {};

/** Staged: changes wait in the draft for an explicit publish. */
export const Staged: Story = {
  args: { autoPublish: false },
};

export const Saving: Story = {
  args: { saving: true },
};

export const SaveFailed: Story = {
  args: { autoPublish: false, error: "Show not found." },
};

/** Toggles locally, standing in for the settings route's mutation. */
export const Interactive: Story = {
  render: function Render(args) {
    const [autoPublish, setAutoPublish] = useState(args.autoPublish);
    return (
      <PublishingSection {...args} autoPublish={autoPublish} onAutoPublishChange={setAutoPublish} />
    );
  },
};
