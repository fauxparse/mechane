import type { Meta, StoryObj } from "@storybook/react-vite";

import { Logo } from "./Logo";

const meta: Meta<typeof Logo> = {
  title: "studio/Logo",
  component: Logo,
  args: {
    className: "size-20",
  },
};

export default meta;
type Story = StoryObj<typeof Logo>;

export const Default: Story = {};
