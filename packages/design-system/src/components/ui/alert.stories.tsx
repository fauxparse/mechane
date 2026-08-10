import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "./button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert";

const meta: Meta<typeof Alert> = {
  title: "design-system/Alert",
  component: Alert,
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>
        The show has unpublished changes that the player will not see yet.
      </AlertDescription>
    </Alert>
  ),
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Cue failed to fire</AlertTitle>
      <AlertDescription>
        The lighting device did not acknowledge cue 12. Check the connection and try again.
      </AlertDescription>
    </Alert>
  ),
};

export const WithIcon: Story = {
  render: (args) => (
    <Alert {...args}>
      <InfoIcon />
      <AlertTitle>Rehearsal mode</AlertTitle>
      <AlertDescription>Cues will run locally and audience devices stay idle.</AlertDescription>
    </Alert>
  ),
};

export const TitleOnly: Story = {
  render: (args) => (
    <Alert {...args}>
      <CircleAlertIcon />
      <AlertTitle>Saved as a draft</AlertTitle>
    </Alert>
  ),
};

export const WithAction: Story = {
  args: { variant: "destructive" },
  render: (args) => (
    <Alert {...args}>
      <TriangleAlertIcon />
      <AlertTitle>Connection lost</AlertTitle>
      <AlertDescription>Reconnect to keep sending cues to the audience.</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline">
          Retry
        </Button>
      </AlertAction>
    </Alert>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <Alert>
        <InfoIcon />
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>An informational message.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Destructive</AlertTitle>
        <AlertDescription>Something needs attention.</AlertDescription>
      </Alert>
    </div>
  ),
};
