import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";
import { Button } from "./button";

const meta: Meta<typeof AlertDialog> = {
  title: "design-system/AlertDialog",
  component: AlertDialog,
};

export default meta;
type Story = StoryObj<typeof AlertDialog>;

/**
 * The case this exists for: a delete whose blast radius is big enough to
 * interrupt for. Clicking the backdrop does nothing — the question has to be
 * answered.
 */
export const Default: Story = {
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete Flow</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete “Audience vote”?</AlertDialogTitle>
        <AlertDialogDescription>
          This deletes 1 flow, 3 scenes and 5 connections. You can undo it.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" />}>Delete</AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};
