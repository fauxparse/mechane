// Deterministic stories for the live-write confirmation modal (#899/#900).
// The dialog is purely presentational: it renders the exact Show/Run/Source/
// Field/Instance/scope facts, the old and replacement values, the chosen
// representation and the alias effects from one already-prepared operation.
// No network and no provider: each story supplies a static PreparedWithTarget.
import type { Meta, StoryObj } from "@storybook/react-vite";

import { CurrentReplaceDialog } from "./CurrentReplaceDialog";
import type { PreparedWithTarget } from "./value-transfer-state";

const scalarShowScope: PreparedWithTarget = {
  target: {
    kind: "current-show",
    showId: "show-voting",
    sourceId: "source-headline",
    fieldPath: [],
    runId: "run-live-42",
    publishedVersion: 7,
  },
  operationId: "op-scalar-1",
  oldValue: "Welcome to the show",
  replacementValue: "Doors open at 7",
  representation: "typed",
  showName: "Audience Voting",
  sourceLabel: "Headline",
  scopeLabel: "Show-level Current value",
  aliasEffects: "No shared references: this scalar stands alone.",
};

const structuredInstanceScope: PreparedWithTarget = {
  target: {
    kind: "current-instance",
    showId: "show-voting",
    sourceId: "source-ballot",
    fieldPath: ["options"],
    runId: "run-live-42",
    publishedVersion: 7,
    deviceId: "device-foyer",
    flowId: "flow-ballot",
  },
  operationId: "op-structured-1",
  oldValue: [
    { label: "Red", votes: 12 },
    { label: "Blue", votes: 9 },
  ],
  replacementValue: [
    { label: "Amber", votes: 0 },
    { label: "Green", votes: 0 },
    { label: "Violet", votes: 0 },
  ],
  representation: "plain",
  showName: "Audience Voting",
  sourceLabel: "Ballot › Options",
  scopeLabel: "Shared Instance Current value (Flow-local)",
  aliasEffects:
    "Repeated records are expanded to fresh copies; no original or external value is aliased.",
};

const meta = {
  title: "studio/Editors/Show/Graph/ValueTransfer/CurrentReplaceDialog",
  component: CurrentReplaceDialog,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    submitting: false,
    returnFocus: () => false,
    onSubmit: () => {},
    onCancel: () => {},
  },
} satisfies Meta<typeof CurrentReplaceDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A scalar Show-level Current replacement, typed representation. */
export const ScalarShowScope: Story = {
  args: { prepared: scalarShowScope },
};

/** A structured Shared-Instance Current replacement, plain representation. */
export const StructuredSharedInstance: Story = {
  args: { prepared: structuredInstanceScope },
};

/** Mid-submission: both actions are disabled while the write is in flight. */
export const Submitting: Story = {
  args: { prepared: scalarShowScope, submitting: true },
};
