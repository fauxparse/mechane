import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "design-system/Button",
  component: Button,
  args: {
    children: "Button",
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Outline: Story = {
  args: { variant: "outline" },
};

export const Secondary: Story = {
  args: { variant: "secondary" },
};

export const Ghost: Story = {
  args: { variant: "ghost" },
};

export const Destructive: Story = {
  args: { variant: "destructive" },
};

export const Link: Story = {
  args: { variant: "link" },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button variant="default">Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};
