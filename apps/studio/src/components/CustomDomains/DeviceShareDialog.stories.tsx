import type { Meta, StoryObj } from "@storybook/react-vite";

import { DEVICES, LIVE, UNVERIFIED } from "./custom-domain-fixtures";
import { DeviceShareDialog } from "./DeviceShareDialog";

const noop = async () => {};
const [audience] = DEVICES as [(typeof DEVICES)[number]];

const meta: Meta<typeof DeviceShareDialog> = {
  title: "studio/Components/CustomDomains/DeviceShareDialog",
  component: DeviceShareDialog,
  args: {
    open: true,
    onOpenChange: () => {},
    device: { ...audience, pairingCode: "4QKEW" },
    domains: [],
    playerOrigin: "https://show.mechane.live",
    settingsHref: "/shows/sknife01/settings",
    onManage: () => {},
    onAdd: noop,
    onBind: noop,
    onCheckNow: noop,
  },
};

export default meta;
type Story = StoryObj<typeof DeviceShareDialog>;

export const NoDomain: Story = {};

export const Unverified: Story = {
  args: { domains: [{ ...UNVERIFIED, binding: LIVE.binding }] },
};

export const Live: Story = {
  args: { domains: [LIVE] },
};
