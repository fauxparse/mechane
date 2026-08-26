import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";
import { useState } from "react";
import { Switch } from "./switch";

const meta: Meta<typeof Switch> = {
  title: "design-system/Switch",
  component: Switch,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: { "aria-label": "Notifications" },
};

export const Checked: Story = {
  args: { "aria-label": "Notifications", defaultChecked: true },
};
export const Indeterminate: Story = {
  args: { "aria-label": "Indeterminate", indeterminate: true },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Switch size="sm" aria-label="Small switch" />
      <Switch aria-label="Default switch" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Switch aria-label="Disabled off switch" disabled />
      <Switch aria-label="Disabled on switch" defaultChecked disabled />
    </div>
  ),
};

export const SettingsList: Story = {
  render: () => (
    <div className="flex w-80 flex-col divide-y rounded-lg border">
      <SettingRow label="Email notifications" description="Receive updates by email" />
      <SettingRow
        label="Reduced motion"
        description="Minimize interface animations"
        defaultChecked
      />
      <SettingRow
        label="Offline mode"
        description="Use cached content when disconnected"
        disabled
      />
    </div>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center gap-3">
        <Switch aria-label="Controlled switch" checked={checked} onCheckedChange={setChecked} />
        <span className="text-sm text-muted-foreground">{checked ? "Enabled" : "Disabled"}</span>
      </div>
    );
  },
};

function SettingRow({
  label,
  description,
  defaultChecked,
  disabled = false,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      <Switch aria-label={label} defaultChecked={defaultChecked} disabled={disabled} />
    </label>
  );
}

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <div className="flex items-center gap-3">
        <Switch aria-label="Inspector off" />
        <Switch aria-label="Inspector on" defaultChecked />
      </div>
    </InspectorProvider>
  ),
};
