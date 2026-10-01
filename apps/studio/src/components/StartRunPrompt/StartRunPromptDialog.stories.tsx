import type { Meta, StoryObj } from "@storybook/react-vite";

import { StartRunPromptDialog } from "./StartRunPromptDialog";

const meta: Meta<typeof StartRunPromptDialog> = {
  title: "studio/Components/StartRunPrompt/StartRunPromptDialog",
  component: StartRunPromptDialog,
  args: {
    showName: "The Knife",
    open: true,
    devices: [{ id: "device_foyer", name: "Foyer screen" }],
    onGoLive: () => {},
    onNotNow: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof StartRunPromptDialog>;

export const OneDevice: Story = {};

export const SeveralDevices: Story = {
  args: {
    devices: [
      { id: "device_foyer", name: "Foyer screen" },
      { id: "device_audience", name: "Audience phones" },
      { id: "device_projector", name: "Projector" },
    ],
  },
};

export const CannotGoLive: Story = {
  args: {
    goLiveDisabledReason: "Fix the invalid Shape before publishing.",
  },
};
