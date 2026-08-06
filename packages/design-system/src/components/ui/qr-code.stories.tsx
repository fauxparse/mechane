import type { Meta, StoryObj } from "@storybook/react-vite";

import { QrCode } from "./qr-code";

const meta: Meta<typeof QrCode> = {
  title: "design-system/QrCode",
  component: QrCode,
  args: {
    value: "482913",
  },
  decorators: [
    (Story) => (
      <div className="size-48">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof QrCode>;

/** A Device pairing code, which is all a QR carries in the show editor (#45). */
export const Default: Story = {};

/**
 * It inherits `currentColor`, so it themes like text rather than needing a
 * light background — which is what lets it sit inside the inspector.
 */
export const Tinted: Story = {
  decorators: [
    (Story) => (
      <div className="text-primary size-48">
        <Story />
      </div>
    ),
  ],
};

/**
 * Small enough to be worth checking: below about this size a QR stops
 * being scannable on a phone, whatever the renderer does.
 */
export const Small: Story = {
  decorators: [
    (Story) => (
      <div className="size-24">
        <Story />
      </div>
    ),
  ],
};

/**
 * Longer payloads make a denser code — the component doesn't care, but
 * the quiet zone and `crispEdges` matter more the denser it gets.
 */
export const LongerValue: Story = {
  args: { value: "https://mechane.show/join/482913" },
};
