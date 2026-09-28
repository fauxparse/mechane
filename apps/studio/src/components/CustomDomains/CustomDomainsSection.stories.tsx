import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  DEVICES,
  LIVE,
  QUEUED,
  REVOKED,
  SHOW_ID,
  UNBOUND,
  UNVERIFIED,
} from "./custom-domain-fixtures";
import { CustomDomainsSection } from "./CustomDomainsSection";

const noop = async () => {};

const meta: Meta<typeof CustomDomainsSection> = {
  title: "studio/Components/CustomDomains/CustomDomainsSection",
  component: CustomDomainsSection,
  args: {
    showId: SHOW_ID,
    domains: [LIVE, UNVERIFIED, UNBOUND],
    unbound: [UNBOUND],
    devices: DEVICES,
    actions: { add: noop, bind: noop, unbind: noop, remove: noop, checkNow: noop },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CustomDomainsSection>;

export const Default: Story = {};

export const Empty: Story = {
  args: { domains: [], unbound: [] },
};

export const QueuedAndRevoked: Story = {
  args: { domains: [QUEUED, REVOKED], unbound: [] },
};

export const CapReached: Story = {
  args: {
    domains: Array.from({ length: 10 }, (_, index) => ({
      ...UNBOUND,
      id: `munbnd${String(index).padStart(2, "0")}`,
      hostname: `show${index}.basement.co.nz`,
    })),
  },
};
