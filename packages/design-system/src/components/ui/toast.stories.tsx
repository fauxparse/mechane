import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "./button";
import { ToastProvider, ToastViewport, useToastManager } from "./toast";

const meta: Meta<typeof ToastProvider> = {
  title: "design-system/Toast",
  component: ToastProvider,
};

export default meta;
type Story = StoryObj<typeof ToastProvider>;

function ToastDemo({ type }: { type?: string }) {
  const toastManager = useToastManager();
  const [count, setCount] = useState(0);

  const createToast = () => {
    const nextCount = count + 1;
    setCount(nextCount);
    toastManager.add({
      title: type === "error" ? "Unable to save" : `Saved item ${nextCount}`,
      description:
        type === "error"
          ? "Check your connection and try again."
          : "Your changes were saved successfully.",
      type,
      actionProps: { children: "Undo", onClick: () => toastManager.close() },
    });
  };

  return (
    <>
      <Button onClick={createToast}>Show toast</Button>
      <ToastViewport />
    </>
  );
}

export const Default: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo />
    </ToastProvider>
  ),
};

export const Error: Story = {
  render: () => (
    <ToastProvider>
      <ToastDemo type="error" />
    </ToastProvider>
  ),
};

export const CustomContent: Story = {
  render: () => (
    <ToastProvider>
      <CustomToast />
    </ToastProvider>
  ),
};

function CustomToast() {
  const toastManager = useToastManager();

  return (
    <>
      <Button
        onClick={() =>
          toastManager.add({
            title: "New message",
            description: "A teammate sent you a message.",
          })
        }
      >
        Show message
      </Button>
      <ToastViewport />
    </>
  );
}
