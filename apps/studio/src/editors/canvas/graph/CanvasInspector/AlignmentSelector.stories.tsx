import { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { AlignmentSelector } from "./AlignmentSelector";
import { useArgs } from "storybook/preview-api";

const meta: Meta<typeof AlignmentSelector> = {
  title: "studio/CanvasInspector/AlignmentSelector",
  component: AlignmentSelector,
  args: {
    alignPrimary: "start",
    alignCounter: "start",
    direction: "horizontal",
    auto: false,
  },
  argTypes: {
    direction: {
      control: "radio",
      options: ["horizontal", "vertical"],
    },
    alignPrimary: {
      control: "radio",
      options: ["start", "center", "end"],
    },
    alignCounter: {
      control: "radio",
      options: ["start", "center", "end"],
    },
    auto: {
      control: "boolean",
    },
  },
};

export default meta;
type Story = StoryObj<typeof AlignmentSelector>;

export const Default: Story = {
  render: () => {
    const [args, updateArgs] =
      useArgs<Omit<ComponentProps<typeof AlignmentSelector>, "onChange">>();

    return <AlignmentSelector {...args} onChange={updateArgs} />;
  },
};
