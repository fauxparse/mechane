import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { fn } from "storybook/test";

import { ForgotPasswordScreen, ResetPasswordScreen } from "./PasswordResetScreens";

const StoryContentContext = createContext<ReactNode>(null);

function StoryContent() {
  return useContext(StoryContentContext);
}

function createStoryRouter() {
  const rootRoute = createRootRoute({ component: Outlet });
  const rootPage = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: StoryContent,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "sign-in",
    component: StoryContent,
  });
  const forgotPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "forgot-password",
    component: StoryContent,
  });
  const resetPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "reset-password",
    component: StoryContent,
  });
  const routeTree = rootRoute.addChildren([
    rootPage,
    signInRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]);

  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

function StoryRouter({ children }: PropsWithChildren) {
  const router = useMemo(createStoryRouter, []);
  return (
    <StoryContentContext.Provider value={children}>
      <RouterProvider router={router} />
    </StoryContentContext.Provider>
  );
}

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
