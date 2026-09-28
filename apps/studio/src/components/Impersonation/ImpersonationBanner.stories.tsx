import type { Meta, StoryObj } from "@storybook/react-vite";

import { ImpersonationBanner } from "./ImpersonationBanner";

const meta: Meta<typeof ImpersonationBanner> = {
  title: "studio/Components/Impersonation/ImpersonationBanner",
  component: ImpersonationBanner,
  parameters: { layout: "fullscreen" },
  args: {
    user: { name: "Lauren Ipsum", email: "test@example.com" },
    onStop: () => {},
    stopping: false,
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-sunken text-foreground">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ImpersonationBanner>;

export const Default: Story = {};

/** A user who never set a name is named by their email alone. */
export const Unnamed: Story = {
  args: { user: { name: "", email: "spam@example.com" } },
};

export const Stopping: Story = {
  args: { stopping: true },
};

export const StopFailed: Story = {
  args: { error: "Couldn't stop impersonating." },
};
