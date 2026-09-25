import type { FormulaScope } from "@mechane/domain/formula";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";

import { FormulaFlyout } from "./formula-flyout";

const meta = {
  title: "design-system/FormulaFlyout",
  component: FormulaFlyout,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FormulaFlyout>;

export default meta;
type Story = StoryObj<typeof FormulaFlyout>;

const scope: FormulaScope = {
  ports: [{ name: "Candidates", type: "number", value: { kind: "number", value: 5 } }],
  shapes: {},
  expected: "number",
  diagnosticSubject: "Element Property",
};

export const Default: Story = {
  render: function Render() {
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState("Candidates * 10");

    return (
      <>
        <div
          ref={anchorRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            top: "50%",
            left: "calc(50% + 210px)",
            width: 1,
            height: 1,
          }}
        />
        <FormulaFlyout
          open
          anchor={anchorRef}
          label="Opacity"
          selectionCount={1}
          scope={scope}
          draft={draft}
          onDraftChange={setDraft}
          resultSuffix="%"
          canRemove={true}
          onApply={() => undefined}
          onCancel={() => undefined}
          onRemove={() => undefined}
          onReplaceAll={() => undefined}
        />
      </>
    );
  },
};
