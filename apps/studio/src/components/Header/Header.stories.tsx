import type { Meta, StoryObj } from "@storybook/react-vite";

import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "studio/Header",
  component: Header,
  parameters: { layout: "fullscreen" },
  args: {
    title: "My show",
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};
