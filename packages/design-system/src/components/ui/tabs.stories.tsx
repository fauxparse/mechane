import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppWindow, Code2, Settings2 } from "@mechane/design-system";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta: Meta<typeof Tabs> = {
  title: "design-system/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-full max-w-xl">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>A quick view of this Show.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Four Scenes and two Devices are ready for review.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="activity" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">The last edit was made a few minutes ago.</p>
      </TabsContent>
      <TabsContent value="settings" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Configure this Show's runtime settings.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: () => (
    <Tabs defaultValue="preview" className="w-full max-w-xl">
      <TabsList variant="line">
        <TabsTrigger value="preview">
          <AppWindow />
          Preview
        </TabsTrigger>
        <TabsTrigger value="code">
          <Code2 />
          Code
        </TabsTrigger>
      </TabsList>
      <TabsContent value="preview" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Preview the current Canvas output.</p>
      </TabsContent>
      <TabsContent value="code" className="rounded-lg border p-4">
        <p className="font-mono text-sm text-muted-foreground">show.render()</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Vertical: Story = {
  render: () => (
    <Tabs
      defaultValue="account"
      orientation="vertical"
      className="w-full max-w-xl rounded-lg border p-3"
    >
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>
      <TabsContent value="account" className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Manage your profile and workspace details.</p>
      </TabsContent>
      <TabsContent value="notifications" className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Choose which events should notify you.</p>
      </TabsContent>
      <TabsContent value="security" className="rounded-md border p-4">
        <p className="text-sm text-muted-foreground">Review sign-in and session settings.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="canvas" className="w-full max-w-xl">
      <TabsList>
        <TabsTrigger value="canvas">
          <AppWindow />
          Canvas
        </TabsTrigger>
        <TabsTrigger value="source" disabled>
          <Code2 />
          Source
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Settings2 />
          Settings
        </TabsTrigger>
      </TabsList>
      <TabsContent value="canvas" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">The Canvas tab is active.</p>
      </TabsContent>
      <TabsContent value="source" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Source is unavailable for this Show.</p>
      </TabsContent>
      <TabsContent value="settings" className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Settings remain available.</p>
      </TabsContent>
    </Tabs>
  ),
};
