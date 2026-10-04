import type { Meta, StoryObj } from "@storybook/react-vite";
import { generateId } from "@mechane/domain/id";
import type { PrimitiveType } from "@mechane/domain/shapes";
import {
  isArrayStructuredValueTemplate,
  type ArrayStructuredValueTemplate,
  type StructuredValueTemplate,
} from "@mechane/domain/structured-values";
import { useState } from "react";
import { userEvent } from "storybook/test";

import { PrimitiveArrayEditor } from "./PrimitiveArrayEditor";

function arrayValue(items: StructuredValueTemplate[]): ArrayStructuredValueTemplate {
  return { id: generateId("structuredValue"), kind: "array", items };
}

function PrimitiveArrayStory({
  itemType,
  items,
  readOnly = false,
}: {
  itemType: PrimitiveType;
  items: StructuredValueTemplate[];
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(() => arrayValue(items));
  return (
    <div className="mx-auto mt-12 flex h-[32rem] w-[42rem] flex-col rounded-lg border border-border bg-popover py-4">
      <PrimitiveArrayEditor
        itemType={itemType}
        value={value}
        path={[]}
        readOnly={readOnly}
        onChange={(next) => {
          if (isArrayStructuredValueTemplate(next)) setValue(next);
        }}
        onValidityChange={() => {}}
      />
      <output data-testid="items" className="sr-only">
        {JSON.stringify(value.items)}
      </output>
    </div>
  );
}

const meta = {
  title: "studio/Editors/Show/Graph/SourceValueDialog/PrimitiveArrayEditor",
  component: PrimitiveArrayStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PrimitiveArrayStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function renderedItems(canvasElement: HTMLElement): unknown {
  return JSON.parse(canvasElement.querySelector('[data-testid="items"]')?.textContent ?? "null");
}

export const TextItems: Story = {
  args: { itemType: "text", items: ["Red", "Green", "Blue"] },
  play: async ({ canvasElement }) => {
    if (canvasElement.querySelector('[role="tab"]')) {
      throw new Error("Primitive arrays must not offer a record view");
    }
    const inputs = canvasElement.querySelectorAll<HTMLInputElement>('[aria-label="Text value"]');
    if ([...inputs].map((input) => input.value).join() !== "Red,Green,Blue") {
      throw new Error("Each item should render as one editable table row");
    }

    const addButton = [...canvasElement.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Add item",
    );
    if (!addButton) throw new Error("Add item button is missing");
    addButton.click();
    await nextFrame();
    const items = renderedItems(canvasElement);
    if (JSON.stringify(items) !== JSON.stringify(["Red", "Green", "Blue", ""])) {
      throw new Error(`Adding an item did not append a default; received ${JSON.stringify(items)}`);
    }
  },
};

export const EnterInLastRow: Story = {
  args: { itemType: "text", items: ["Red", "Green", ""] },
  play: async ({ canvasElement }) => {
    const inputs = canvasElement.querySelectorAll<HTMLInputElement>('[aria-label="Text value"]');
    const lastInput = inputs[inputs.length - 1];
    if (!lastInput) throw new Error("Each item should render as one editable table row");
    // Enter commits the edit and adds a row in the same keystroke; the edit must survive both.
    await userEvent.click(lastInput);
    await userEvent.keyboard("Blue{Enter}");
    await nextFrame();
    const items = renderedItems(canvasElement);
    if (JSON.stringify(items) !== JSON.stringify(["Red", "Green", "Blue", ""])) {
      throw new Error(`Enter in the last row lost its edit; received ${JSON.stringify(items)}`);
    }
  },
};

export const NumberItems: Story = {
  args: { itemType: "number", items: [3, 1, 4, 1, 5] },
};

export const BooleanItems: Story = {
  args: { itemType: "boolean", items: [true, false, true] },
};

export const ReadOnly: Story = {
  args: { itemType: "text", items: ["Supplied", "By another node"], readOnly: true },
};

export const Empty: Story = {
  args: { itemType: "color", items: [] },
};
