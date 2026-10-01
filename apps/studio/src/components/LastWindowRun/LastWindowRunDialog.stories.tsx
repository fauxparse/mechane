import type { Meta, StoryObj } from "@storybook/react-vite";

import { LastWindowRunDialog } from "./LastWindowRunDialog";

const meta: Meta<typeof LastWindowRunDialog> = {
  title: "studio/Components/LastWindowRun/LastWindowRunDialog",
  component: LastWindowRunDialog,
  args: {
    showName: "The Knife",
    open: true,
    onEndRun: () => {},
    onKeepRunning: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof LastWindowRunDialog>;

export const Open: Story = {};
