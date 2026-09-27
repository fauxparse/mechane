import type { Meta, StoryObj } from "@storybook/react-vite";

import { HoldingPage } from "./HoldingPage";

const meta: Meta<typeof HoldingPage> = {
  title: "site/HoldingPage",
  component: HoldingPage,
  parameters: { layout: "fullscreen" },
  args: {
    studio: {
      session: { kind: "signed-out" },
      signInUrl: "#sign-in",
      dashboardUrl: "#dashboard",
    },
    waitlist: { status: { kind: "idle" }, onJoin: () => {} },
  },
};

export default meta;
type Story = StoryObj<typeof HoldingPage>;

export const SignedOut: Story = {};

export const CheckingSession: Story = {
  args: {
    studio: { session: { kind: "checking" }, signInUrl: "#sign-in", dashboardUrl: "#dashboard" },
  },
};

export const SignedIn: Story = {
  args: {
    studio: {
      session: { kind: "signed-in", name: "Ada Lovelace" },
      signInUrl: "#sign-in",
      dashboardUrl: "#dashboard",
    },
  },
};

export const Joining: Story = {
  args: { waitlist: { status: { kind: "submitting" }, onJoin: () => {} } },
};

export const Joined: Story = {
  args: {
    waitlist: {
      status: { kind: "joined", name: "Ada Lovelace", email: "ada@example.com" },
      onJoin: () => {},
    },
  },
};

export const JoinFailed: Story = {
  args: {
    waitlist: {
      status: { kind: "failed", message: "Enter a valid email address." },
      onJoin: () => {},
    },
  },
};
