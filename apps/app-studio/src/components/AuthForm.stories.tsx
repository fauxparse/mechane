import type { Meta, StoryObj } from "@storybook/react-vite";

import { AuthForm } from "./AuthForm";

const meta: Meta<typeof AuthForm> = {
  title: "app-studio/AuthForm",
  component: AuthForm,
  args: {
    mode: "sign-in",
    onSubmit: () => {},
    onToggleMode: () => {},
  },
  decorators: [(Story) => <div className="w-96">{<Story />}</div>],
};

export default meta;
type Story = StoryObj<typeof AuthForm>;

export const SignIn: Story = {};

export const SignUp: Story = {
  args: { mode: "sign-up" },
};

export const WithGoogle: Story = {
  args: { googleEnabled: true, onGoogleSignIn: () => {} },
};

export const Pending: Story = {
  args: { pending: true },
};

export const WithError: Story = {
  args: { error: "Invalid email or password." },
};

export const GooglePending: Story = {
  args: { googleEnabled: true, onGoogleSignIn: () => {}, googlePending: true },
};
