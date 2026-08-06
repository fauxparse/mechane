import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Dialog> = {
  title: "design-system/Dialog",
  component: Dialog,
};

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogTitle>Rename Show</DialogTitle>
        <DialogDescription>This is what appears in the Shows list.</DialogDescription>
        <div className="flex flex-col gap-2">
          <Label htmlFor="show-name">Name</Label>
          <Input id="show-name" defaultValue="The Tempest" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

/** Dismissable by clicking the backdrop or pressing Escape — unlike AlertDialog. */
export const TextOnly: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>What is a Flow?</DialogTrigger>
      <DialogContent>
        <DialogTitle>Flows</DialogTitle>
        <DialogDescription>
          A Flow is a named group of Scenes that behaves as a state machine, always with one active
          Scene.
        </DialogDescription>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Got it</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
