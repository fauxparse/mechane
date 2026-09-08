import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  InspectorProvider,
  Italic,
  Underline,
} from "@mechane/design-system";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta: Meta<typeof ToggleGroup> = {
  title: "design-system/ToggleGroup",
  component: ToggleGroup,
  parameters: { layout: "padded" },
  argTypes: {
    multiple: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof ToggleGroup>;

export const Default: Story = {
  args: { multiple: true },
  render: (args) => (
    <ToggleGroup {...args} defaultValue={["bold"]}>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Outline: Story = {
  args: { multiple: false },
  render: (args) => (
    <ToggleGroup {...args} defaultValue={["left"]}>
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Spacing: Story = {
  args: { multiple: false },
  render: (args) => (
    <ToggleGroup {...args} variant="outline" size="sm" spacing={2} defaultValue={["bold"]}>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Vertical: Story = {
  args: { multiple: true },
  render: (args) => (
    <ToggleGroup {...args} orientation="vertical" spacing={1} defaultValue={["bold", "italic"]}>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Disabled: Story = {
  args: { multiple: false },
  render: (args) => (
    <ToggleGroup {...args} disabled>
      <ToggleGroupItem value="bold" aria-label="Toggle bold">
        <Bold />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Toggle italic">
        <Italic />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Toggle underline">
        <Underline />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const InspectorVibe: Story = {
  args: { multiple: true },
  render: (args) => (
    <InspectorProvider>
      <ToggleGroup {...args} variant="outline" defaultValue={["left"]}>
        <ToggleGroupItem value="left" aria-label="Align left">
          <AlignLeft />
        </ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Align center">
          <AlignCenter />
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Align right">
          <AlignRight />
        </ToggleGroupItem>
      </ToggleGroup>
    </InspectorProvider>
  ),
};
