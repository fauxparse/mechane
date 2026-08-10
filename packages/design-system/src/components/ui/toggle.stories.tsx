import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bold, Bookmark, Italic, Underline } from "lucide-react";

import { Toggle } from "./toggle";

const meta: Meta<typeof Toggle> = {
  title: "design-system/Toggle",
  component: Toggle,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Toggle>;

export const Default: Story = {
  render: () => (
    <Toggle aria-label="Toggle bookmark">
      <Bookmark />
      Bookmark
    </Toggle>
  ),
};

export const Outline: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle variant="outline" aria-label="Toggle italic">
        <Italic />
        Italic
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle bold">
        <Bold />
        Bold
      </Toggle>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle variant="outline" size="sm" aria-label="Toggle small">
        Small
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle default">
        Default
      </Toggle>
      <Toggle variant="outline" size="lg" aria-label="Toggle large">
        Large
      </Toggle>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Toggle aria-label="Toggle disabled" disabled>
        Disabled
      </Toggle>
      <Toggle variant="outline" aria-label="Toggle disabled outline" disabled>
        Disabled
      </Toggle>
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Toggle bold">
        <Bold />
      </Toggle>
      <Toggle aria-label="Toggle italic">
        <Italic />
      </Toggle>
      <Toggle aria-label="Toggle underline">
        <Underline />
      </Toggle>
    </div>
  ),
};
