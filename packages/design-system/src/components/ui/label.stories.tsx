import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Label> = {
  title: "design-system/Label",
  component: Label,
  args: {
    children: "Show name",
  },
};

export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {};

export const WithInput: Story = {
  render: () => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="story-input">Show name</Label>
      <Input id="story-input" placeholder="Hamlet" />
    </div>
  ),
};
