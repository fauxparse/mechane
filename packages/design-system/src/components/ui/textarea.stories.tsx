import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./textarea";

const meta: Meta<typeof Textarea> = {
  title: "design-system/Textarea",
  component: Textarea,
  parameters: { layout: "padded" },
  args: { placeholder: "Write something…" },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "A Show with Scenes, Devices, and Flows." },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "This cannot be edited." },
};
