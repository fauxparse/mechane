import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "design-system/Input",
  component: Input,
  args: {
    placeholder: "Type something…",
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "Hamlet" },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Can't touch this" },
};

export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "" },
};
