import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "design-system/Collapsible",
  component: Collapsible,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

function Example({
  defaultOpen = false,
  disabled = false,
}: {
  defaultOpen?: boolean;
  disabled?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} disabled={disabled} className="w-80">
      <CollapsibleTrigger className="w-full justify-between border border-border bg-card px-3 py-2 hover:bg-muted">
        Show details
        <ChevronDownIcon className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-x border-b border-border bg-card p-3 text-muted-foreground">
        More information is available when the section is expanded.
      </CollapsibleContent>
    </Collapsible>
  );
}

export const Default: Story = {
  render: () => <Example />,
};

export const Open: Story = {
  render: () => <Example defaultOpen />,
};

export const Controlled: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <div className="flex flex-col items-center gap-3">
        <ExampleControlled open={open} onOpenChange={setOpen} />
        <span className="text-sm text-muted-foreground">{open ? "Open" : "Closed"}</span>
      </div>
    );
  },
};

function ExampleControlled({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="w-80">
      <CollapsibleTrigger className="w-full justify-between border border-border bg-card px-3 py-2 hover:bg-muted">
        Show details
        <ChevronDownIcon className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-x border-b border-border bg-card p-3 text-muted-foreground">
        This section is controlled by the story.
      </CollapsibleContent>
    </Collapsible>
  );
}

export const Disabled: Story = {
  render: () => <Example disabled />,
};
