import type { Shape } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TypeSelect } from "./type-select";

const meta = {
  title: "design-system/TypeSelect",
  component: TypeSelect,
  parameters: { layout: "centered" },
  args: {
    value: "text",
    onValueChange: () => undefined,
    "aria-label": "Field Type",
  },
} satisfies Meta<typeof TypeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const SHAPES: Shape[] = [
  { id: "attendee", name: "Attendee", fields: [] },
  { id: "vote", name: "Vote", fields: [] },
];

export const Default: Story = {};

export const Compact: Story = {
  args: {
    showLabel: false,
    triggerClassName: "border-0 bg-muted/50",
  },
};

export const WithShapes: Story = {
  args: {
    value: { kind: "shape", shapeId: "attendee" },
    shapes: SHAPES,
  },
};

export const DisabledOption: Story = {
  args: {
    shapes: SHAPES,
    optionDisabled: (option) =>
      typeof option.value === "object" &&
      option.value.kind === "shape" &&
      option.value.shapeId === "attendee",
  },
};

export const Invalid: Story = {
  args: {
    "aria-invalid": true,
    triggerClassName: "border-destructive ring-2 ring-destructive/20",
  },
};

export const Interactive: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <TypeSelect {...args} value={value} onValueChange={setValue} />;
  },
};
