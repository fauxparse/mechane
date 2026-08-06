import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta: Meta<typeof Card> = {
  title: "design-system/Card",
  component: Card,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Hamlet</CardTitle>
        <CardDescription>Updated 2 days ago</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">A Show with 4 Scenes, 2 Devices, and 1 Flow.</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm">
          Open
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Hamlet</CardTitle>
        <CardDescription>Updated 2 days ago</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Delete
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-72">
      <CardHeader>
        <CardTitle>Compact</CardTitle>
        <CardDescription>Tighter padding via size=&quot;sm&quot;.</CardDescription>
      </CardHeader>
    </Card>
  ),
};
