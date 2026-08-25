import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";

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

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <div className="flex w-80 flex-col gap-1">
        <Label htmlFor="inspector-input">Inspector label</Label>
        <Input id="inspector-input" placeholder="Inspector field" />
      </div>
    </InspectorProvider>
  ),
};
