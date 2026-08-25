import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { EditableName } from "./editable-name";

const meta: Meta<typeof EditableName> = {
  title: "design-system/EditableName",
  component: EditableName,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof EditableName>;

export const Basic: Story = {
  render: () => {
    const [name, setName] = useState("Inspector review");
    return (
      <div className="w-64 rounded-md border border-border bg-background p-3">
        <EditableName value={name} onCommit={setName} />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => {
    const [name, setName] = useState("");
    return (
      <div className="w-64 rounded-md border border-border bg-background p-3">
        <EditableName value={name} placeholder="Untitled" onCommit={setName} />
      </div>
    );
  },
};
