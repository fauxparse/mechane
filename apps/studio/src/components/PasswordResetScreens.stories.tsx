import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";

import { ForgotPasswordScreen, ResetPasswordScreen } from "./PasswordResetScreens";
import { StoryRouter } from "./StoryRouter";

function RequestResetFlow() {
  const [sent, setSent] = useState(false);
  return sent ? (
    <ForgotPasswordScreen state="sent" />
  ) : (
    <ForgotPasswordScreen
      state="form"
      pending={false}
      error={null}
      onSubmit={() => setSent(true)}
    />
  );
}

function CompleteResetFlow() {
  const [completed, setCompleted] = useState(false);
  return completed ? (
    <ResetPasswordScreen state="completed" />
  ) : (
    <ResetPasswordScreen
      state="form"
      pending={false}
      error={null}
      onSubmit={() => setCompleted(true)}
    />
  );
}

const meta = {
  title: "studio/Components/Auth/Password reset",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story: React.ComponentType) => (
      <StoryRouter>
        <Story />
      </StoryRouter>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RequestReset: Story = {
  render: () => <RequestResetFlow />,
};

export const RequestPending: Story = {
  render: () => <ForgotPasswordScreen state="form" pending error={null} onSubmit={fn()} />,
};

export const RequestFailed: Story = {
  render: () => (
    <ForgotPasswordScreen
      state="form"
      pending={false}
      error="We couldn't send the reset email. Try again."
      onSubmit={fn()}
    />
  ),
};

export const ResetPassword: Story = {
  render: () => <CompleteResetFlow />,
};

export const ResetPasswordFailed: Story = {
  render: () => (
    <ResetPasswordScreen
      state="form"
      pending={false}
      error="This reset link has expired. Request a new one."
      onSubmit={fn()}
    />
  ),
};

export const InvalidResetLink: Story = {
  render: () => <ResetPasswordScreen state="invalid" />,
};

export const PasswordUpdated: Story = {
  render: () => <ResetPasswordScreen state="completed" />,
};
