import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta: Meta<typeof Separator> = {
  title: "design-system/Separator",
  component: Separator,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
      <div className="flex items-center justify-between">
        <span>Scenes</span>
        <span className="text-muted-foreground">4</span>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <span>Devices</span>
        <span className="text-muted-foreground">2</span>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-3 text-sm">
      <span>Canvas</span>
      <Separator orientation="vertical" />
      <span className="text-muted-foreground">Draft</span>
      <Separator orientation="vertical" />
      <span className="text-muted-foreground">Updated just now</span>
    </div>
  ),
};

export const Custom: Story = {
  render: () => (
    <div className="flex w-full max-w-xl flex-col gap-4 text-sm">
      <span>Custom separator styling</span>
      <Separator className="bg-primary" />
      <span className="text-muted-foreground">The className prop can apply a semantic color.</span>
    </div>
  ),
};
