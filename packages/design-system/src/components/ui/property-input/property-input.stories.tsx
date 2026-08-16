import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import type { NumberValue, ShapeValue } from "@mechane/domain";
import { PaintBucketIcon, VariableIcon } from "@mechane/design-system";

import { PropertyInput, type PropertyInputValue, type VariableReference } from "./property-input";

const meta: Meta<typeof PropertyInput> = {
  title: "design-system/PropertyInput",
  component: PropertyInput,
  args: {
    icon: VariableIcon,
  },
};

export default meta;
type Story = StoryObj<typeof PropertyInput>;

const variables: VariableReference<ShapeValue>[] = [
  { id: "spacing-small", name: "Spacing / Small", current: { kind: "number", value: 8 } },
  { id: "spacing-large", name: "Spacing / Large", current: { kind: "number", value: 24 } },
  { id: "brand-color", name: "Color / Brand", current: { kind: "color", value: "#c94f9d" } },
];

const isNumberValue = (
  value: PropertyInputValue<ShapeValue> | null | undefined,
): value is NumberValue =>
  value !== null && value !== undefined && "kind" in value && value.kind === "number";

export const Default: Story = {};
export const InactiveValue: Story = {
  args: {
    type: "text",
    value: { kind: "text", value: "A long first line\nA second line" },
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <PropertyInput
          {...args}
          value={value}
          onChange={setValue}
          renderInactiveValue={(current) => {
            const text = current?.kind === "text" ? current.value : "";
            return (
              <span className="block truncate">
                {text
                  ? text.split(/\r?\n/).map((line, index) => (
                      <span key={index}>
                        {index > 0 && (
                          <span className="px-0.5 text-muted-foreground opacity-50">↵</span>
                        )}
                        {line}
                      </span>
                    ))
                  : "Empty text"}
              </span>
            );
          }}
        />
      </div>
    );
  },
};

export const Width: Story = {
  args: {
    dimension: "width",
    icon: "W",
  },
  render: (args) => {
    const [sizing, setSizing] = useState<"fixed" | "fill" | "hug">("fixed");
    const [constraints, setConstraints] = useState<Record<"min" | "max", boolean>>({
      min: false,
      max: false,
    });
    const [constraintValues, setConstraintValues] = useState({ min: 120, max: 640 });
    const [value, setValue] = useState(320);

    return (
      <div className="flex w-80 flex-col gap-1">
        <PropertyInput
          {...args}
          type="number"
          value={{ kind: "number", value }}
          sizing={sizing}
          onChange={(next) => {
            if (isNumberValue(next)) setValue(next.value);
          }}
          onSizingChange={setSizing}
          onConstraintAdd={(constraint) =>
            setConstraints((current) => ({ ...current, [constraint]: true }))
          }
        />
        {constraints.min && (
          <PropertyInput
            type="number"
            icon="↳"
            placeholder="Min width"
            value={{ kind: "number", value: constraintValues.min }}
            onChange={(next) => {
              if (isNumberValue(next)) {
                setConstraintValues((current) => ({ ...current, min: next.value }));
              }
            }}
          />
        )}
        {constraints.max && (
          <PropertyInput
            type="number"
            icon="↳"
            placeholder="Max width"
            value={{ kind: "number", value: constraintValues.max }}
            onChange={(next) => {
              if (isNumberValue(next)) {
                setConstraintValues((current) => ({ ...current, max: next.value }));
              }
            }}
          />
        )}
      </div>
    );
  },
};

export const Height: Story = {
  args: {
    dimension: "height",
    icon: "H",
  },
  render: (args) => {
    const [sizing, setSizing] = useState<"fixed" | "fill" | "hug">("fixed");
    const [value, setValue] = useState(240);

    return (
      <PropertyInput
        {...args}
        type="number"
        value={{ kind: "number", value }}
        sizing={sizing}
        onChange={(next) => {
          if (isNumberValue(next)) setValue(next.value);
        }}
        onSizingChange={setSizing}
      />
    );
  },
};

export const Percentage: Story = {
  args: {
    dimension: "width",
    unit: "%",
    type: "number",
    icon: "W",
    min: 0,
    max: 100,
    scrubScale: 3,
  },
  render: (args) => {
    const [value, setValue] = useState(65);
    return (
      <PropertyInput
        {...args}
        value={{ kind: "number", value }}
        onChange={(next) => {
          if (isNumberValue(next)) setValue(next.value);
        }}
      />
    );
  },
};

export const Linked: Story = {
  args: {
    type: "text",
    value: {
      id: "name",
      name: "Name",
      current: { kind: "text", value: "Lauren Ipsum" },
    },
    variables,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <PropertyInput {...args} value={value} onChange={setValue} />;
  },
};

export const Number: Story = {
  args: {
    type: "number",
    value: { kind: "number", value: 24 },
    icon: "↔",
    min: 0,
    max: 100,
    scrubScale: 4,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <PropertyInput {...args} value={value} onChange={setValue} />;
  },
};

export const Color: Story = {
  args: {
    type: "color",
    value: { kind: "color", value: "#c94f9d" },
    icon: PaintBucketIcon,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <PropertyInput {...args} value={value} onChange={setValue} />;
  },
};

export const WithVariables: Story = {
  args: {
    type: "number",
    value: {
      id: "spacing-large",
      name: "Spacing / Large",
      current: { kind: "number", value: 24 },
    },
    variables,
    min: 0,
    max: 100,
  },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <div className="w-80">
        <PropertyInput {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};
