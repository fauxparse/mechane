import type { Meta, StoryObj } from "@storybook/react-vite";

import { ShowNameForm } from "./ShowNameForm";

const meta: Meta<typeof ShowNameForm> = {
  title: "studio/ShowNameForm",
  component: ShowNameForm,
  args: {
    submitLabel: "Create Show",
    onSubmit: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ShowNameForm>;

export const Create: Story = {};

export const Rename: Story = {
  args: { initialName: "Hamlet", submitLabel: "Save" },
};

export const Pending: Story = {
  args: { initialName: "Hamlet", submitLabel: "Save", pending: true },
};

export const WithError: Story = {
  args: {
    initialName: "",
    submitLabel: "Create Show",
    error: "Invalid Show name: name must not be empty.",
  },
};
