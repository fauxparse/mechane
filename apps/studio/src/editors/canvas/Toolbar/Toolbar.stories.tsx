import type { Meta, StoryObj } from "@storybook/react-vite";

import { Toolbar } from "./Toolbar";

const meta: Meta<typeof Toolbar> = {
  title: "studio/Toolbar",
  component: Toolbar,
  parameters: { layout: "fullscreen" },
  args: {},
  decorators: [
    (Story) => (
      <div className="w-screen h-screen p-6 flex flex-col justify-end items-center">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {};
