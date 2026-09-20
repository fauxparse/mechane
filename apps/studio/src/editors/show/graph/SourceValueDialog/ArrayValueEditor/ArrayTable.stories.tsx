import type { Meta, StoryObj } from "@storybook/react-vite";
import { generateId, type Shape } from "@mechane/domain";
import { useState } from "react";

import { ArrayTable } from "./ArrayTable";
import type { ShapeRecord } from "./types";

const fields: Shape["fields"] = [
  { id: "name", name: "Name", type: "text", required: true, defaultValue: "" },
  { id: "score", name: "Score", type: "number", required: true, defaultValue: 0 },
];

const initialRecord: ShapeRecord = {
  id: generateId("structuredValue"),
  kind: "shape",
  fields: { name: "Opening night", score: 7 },
};

const meta = {
  title: "studio/Editors/Show/Graph/SourceValueDialog/ArrayTable",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function NumericScrubbingStory() {
  const [record, setRecord] = useState(initialRecord);
  const [commitCount, setCommitCount] = useState(0);
  const [validityChangeCount, setValidityChangeCount] = useState(0);

  return (
    <div className="mx-auto mt-12 w-[42rem] rounded-lg border border-border bg-background py-4">
      <ArrayTable
        records={[record]}
        fields={fields}
        readOnly={false}
        path={[]}
        onReorder={() => {}}
        onRecordChange={(nextRecord) => {
          setCommitCount((count) => count + 1);
          setRecord(nextRecord);
        }}
        onValidityChange={() => setValidityChangeCount((count) => count + 1)}
        onOpenRecord={() => {}}
      />
      <output data-testid="scrub-commit-count" className="sr-only">
        {commitCount}
      </output>
      <output data-testid="validity-change-count" className="sr-only">
        {validityChangeCount}
      </output>
    </div>
  );
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const NumericScrubbing: Story = {
  render: NumericScrubbingStory,
  play: async ({ canvasElement }) => {
    const scoreInput = canvasElement.querySelector<HTMLInputElement>('[aria-label="Score value"]');
    const inputGroup = scoreInput?.closest('[data-slot="input-group"]');
    const scrubber = inputGroup?.querySelector<HTMLElement>(
      '[data-slot="input-group-addon"].cursor-ew-resize',
    );
    if (!scoreInput || !scrubber) throw new Error("Numeric scrub control is missing");

    let captured = false;
    scrubber.setPointerCapture = () => {
      captured = true;
    };
    scrubber.hasPointerCapture = () => captured;
    scrubber.releasePointerCapture = () => {
      captured = false;
    };

    const dispatchPointer = (type: string, clientX: number, buttons: number) =>
      scrubber.dispatchEvent(
        new PointerEvent(type, { bubbles: true, buttons, clientX, pointerId: 1 }),
      );

    dispatchPointer("pointerdown", 100, 1);
    dispatchPointer("pointermove", 100.2, 1);
    await nextFrame();
    const countAfterSubpixelMove = canvasElement.querySelector(
      '[data-testid="scrub-commit-count"]',
    )?.textContent;
    if (countAfterSubpixelMove !== "0") {
      throw new Error(
        `Scrubbing committed during a sub-pixel move; received ${countAfterSubpixelMove}`,
      );
    }

    dispatchPointer("pointermove", 120, 1);
    await nextFrame();
    const previewInput = canvasElement.querySelector<HTMLInputElement>(
      '[aria-label="Score value"]',
    );
    const countDuringScrub = canvasElement.querySelector(
      '[data-testid="scrub-commit-count"]',
    )?.textContent;
    if (previewInput?.value !== "17" || countDuringScrub !== "0") {
      throw new Error(
        `Scrub preview was not isolated from commits; value=${previewInput?.value}, commits=${countDuringScrub}`,
      );
    }

    dispatchPointer("pointerup", 120, 0);
    await nextFrame();

    const updatedInput = canvasElement.querySelector<HTMLInputElement>(
      '[aria-label="Score value"]',
    );
    const finalCommitCount = canvasElement.querySelector(
      '[data-testid="scrub-commit-count"]',
    )?.textContent;
    if (updatedInput?.value !== "17" || finalCommitCount !== "1") {
      throw new Error(
        `Numeric scrubbing did not commit once at gesture end; value=${updatedInput?.value}, commits=${finalCommitCount}`,
      );
    }
  },
};

export const ViewportExitEndsScrub: Story = {
  render: NumericScrubbingStory,
  play: async ({ canvasElement }) => {
    const scoreInput = canvasElement.querySelector<HTMLInputElement>('[aria-label="Score value"]');
    const scrubber = scoreInput
      ?.closest('[data-slot="input-group"]')
      ?.querySelector<HTMLElement>('[data-slot="input-group-addon"].cursor-ew-resize');
    if (!scoreInput || !scrubber) throw new Error("Numeric scrub control is missing");

    let captured = false;
    scrubber.setPointerCapture = () => {
      captured = true;
    };
    scrubber.hasPointerCapture = () => captured;
    scrubber.releasePointerCapture = () => {
      captured = false;
    };
    const dispatchPointer = (type: string, clientX: number, buttons: number) =>
      scrubber.dispatchEvent(
        new PointerEvent(type, { bubbles: true, buttons, clientX, pointerId: 1 }),
      );

    dispatchPointer("pointerdown", 100, 1);
    await nextFrame();
    dispatchPointer("pointermove", 120, 1);
    await nextFrame();

    const previewInput = canvasElement.querySelector<HTMLInputElement>(
      '[aria-label="Score value"]',
    );
    if (previewInput?.value !== "17") {
      throw new Error(`Scrub preview did not update before viewport exit: ${previewInput?.value}`);
    }

    dispatchPointer("pointerout", 120, 1);
    await nextFrame();

    const finalInput = canvasElement.querySelector<HTMLInputElement>('[aria-label="Score value"]');
    const finalCommitCount = canvasElement.querySelector(
      '[data-testid="scrub-commit-count"]',
    )?.textContent;
    if (finalInput?.value !== "17" || finalCommitCount !== "1") {
      throw new Error(
        `Leaving the viewport did not end the scrub; value=${finalInput?.value}, commits=${finalCommitCount}`,
      );
    }
  },
};

export const TypingInCell: Story = {
  render: NumericScrubbingStory,
  play: async ({ canvasElement }) => {
    const nameInput = canvasElement.querySelector<HTMLInputElement>('[aria-label="Name value"]');
    if (!nameInput) throw new Error("Text table input is missing");

    nameInput.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    valueSetter?.call(nameInput, "Edited opening night");
    nameInput.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "Edited opening night",
        inputType: "insertText",
      }),
    );
    await nextFrame();

    const draftInput = canvasElement.querySelector<HTMLInputElement>('[aria-label="Name value"]');
    const draftValidityChanges = canvasElement.querySelector(
      '[data-testid="validity-change-count"]',
    )?.textContent;
    if (draftInput?.value !== "Edited opening night" || draftValidityChanges !== "0") {
      throw new Error(
        `Typing caused a parent update; value=${draftInput?.value}, validityChanges=${draftValidityChanges}`,
      );
    }

    draftInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    await nextFrame();

    const committedInput = canvasElement.querySelector<HTMLInputElement>(
      '[aria-label="Name value"]',
    );
    const commitCount = canvasElement.querySelector(
      '[data-testid="scrub-commit-count"]',
    )?.textContent;
    if (committedInput?.value !== "Edited opening night" || commitCount !== "1") {
      throw new Error(
        `Typed value did not commit once; value=${committedInput?.value}, commits=${commitCount}`,
      );
    }
  },
};
