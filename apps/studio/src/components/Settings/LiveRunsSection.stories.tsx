import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { LiveRunsSection } from "./LiveRunsSection";

const meta: Meta<typeof LiveRunsSection> = {
  title: "studio/Components/Settings/LiveRunsSection",
  component: LiveRunsSection,
  args: { askToEndRunOnClose: true, onAskToEndRunOnCloseChange: () => {} },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LiveRunsSection>;

/** The default: closing the last window on a live Show asks first. */
export const Asking: Story = {};

export const NotAsking: Story = {
  args: { askToEndRunOnClose: false },
};

/** Toggles locally, standing in for the settings route's mutation. */
export const Interactive: Story = {
  render: function Render(args) {
    const [ask, setAsk] = useState(args.askToEndRunOnClose);
    return (
      <LiveRunsSection {...args} askToEndRunOnClose={ask} onAskToEndRunOnCloseChange={setAsk} />
    );
  },
};
