import type { Meta, StoryObj } from "@storybook/react-vite";
import { PRIMITIVE_TYPES, type Type } from "@mechane/domain/shapes";

import { VariableTypeIcon } from "./variable-type-icon";

const SHAPE: Type = { kind: "shape", shapeId: "shape_person" };
const ELEMENT_TYPES: readonly Type[] = [...PRIMITIVE_TYPES, SHAPE];
const TYPES_BY_NAME: Record<string, Type> = Object.fromEntries(
  ELEMENT_TYPES.flatMap((type) => {
    const name = typeof type === "string" ? type : "shape";
    return [
      [name, type],
      [`array of ${name}`, { kind: "array", of: type }],
    ];
  }),
);

const meta = {
  title: "design-system/VariableTypeIcon",
  component: VariableTypeIcon,
  parameters: { layout: "centered" },
  args: { type: { kind: "array", of: "text" }, className: "size-6" },
  argTypes: {
    type: {
      control: "select",
      options: Object.keys(TYPES_BY_NAME),
      mapping: TYPES_BY_NAME,
    },
  },
} satisfies Meta<typeof VariableTypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Each element type beside its array. */
export const AllTypes: Story = {
  render: ({ className }) => (
    <div className="grid grid-cols-3 items-center gap-x-6 gap-y-3 text-sm">
      {ELEMENT_TYPES.map((type) => {
        const name = typeof type === "string" ? type : "shape";
        return (
          <div key={name} className="contents">
            <span className="text-muted-foreground">{name}</span>
            <VariableTypeIcon type={type} className={className} />
            <VariableTypeIcon type={{ kind: "array", of: type }} className={className} />
          </div>
        );
      })}
    </div>
  ),
};

/** Array icons inherit the surrounding colour, like the plain icons beside them. */
export const InheritsColour: Story = {
  render: ({ className }) => (
    <div className="flex items-center gap-3 text-destructive">
      <VariableTypeIcon type="number" className={className} />
      <VariableTypeIcon type={{ kind: "array", of: "number" }} className={className} />
    </div>
  ),
};
