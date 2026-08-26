import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";
import { useState } from "react";
import { Slider } from "./slider";

const meta: Meta<typeof Slider.Root> = {
  title: "design-system/Slider",
  component: Slider.Root,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Slider.Root>;

export const MultipleThumbs: Story = {
  render: () => {
    const [values, setValues] = useState([10, 35, 70]);

    return (
      <Slider.Root
        value={values}
        min={0}
        max={100}
        step={1}
        onValueChange={(nextValues) => setValues(nextValues as number[])}
      >
        <Slider.Control className="py-3">
          <Slider.Track className="h-2 bg-muted">
            {values.map((value, index) => (
              <Slider.Thumb
                index={index}
                key={`value-${value}`}
                aria-label={`Value ${index + 1}`}
                className="size-4 border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.65)]"
              />
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    );
  },
};

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <Slider.Root defaultValue={[40]} min={0} max={100}>
        <Slider.Control className="py-3">
          <Slider.Track className="bg-muted">
            <Slider.Indicator />
            <Slider.Thumb index={0} aria-label="Inspector value" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </InspectorProvider>
  ),
};
