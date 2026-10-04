// Deterministic stories for the Source-value clipboard controls
// (#896–#900). Every story drives the real editor-level provider with a
// static in-memory client and bridge: no network, no live Run, no clipboard
// access. The scenarios cover a scalar Default, a structured Default with
// nested Field selection, a Show-level Current read, a Flow-local Shared
// Instance target (explicit selection, never an inferred first Instance), a
// read failure surfaced as a diagnostic, and a pinned unknown outcome that
// blocks dependent edits until its exact result is checked.
import { Section, Sidebar, SidebarContent, SidebarProvider } from "@mechane/design-system";
import type { ShowGraph, SourceNode } from "@mechane/domain/graph";
import type { Shape } from "@mechane/domain/shapes";
import type { Meta, StoryObj } from "@storybook/react-vite";

import type {
  PreparedSourceValue,
  SourceValueContext,
  SourceValueRead,
  ValueOperationOutcome,
} from "../../../../api/value-transfer";
import type { SourceValueEditing } from "../../commands/use-graph-editing";
import { SourceValueClipboard } from "./SourceValueClipboard";
import {
  SourceValueClipboardProvider,
  type ValueTransferBridge,
  type ValueTransferClient,
} from "./value-transfer-context";
import type { ValueTarget } from "@mechane/domain/value-transfer";

const profileShape: Shape = {
  id: "shape-profile",
  name: "Profile",
  fields: [
    { id: "headline", name: "Headline", type: "text", required: true, defaultValue: "Welcome" },
    { id: "score", name: "Score", type: "number", required: true, defaultValue: 7 },
    { id: "active", name: "Active", type: "boolean", required: true, defaultValue: true },
  ],
};

const scalarSource: SourceNode = {
  id: "source-headline",
  kind: "source",
  name: "Headline",
  position: { x: 0, y: 0 },
  parentId: null,
  type: "text",
};

const structuredSource: SourceNode = {
  id: "source-profile",
  kind: "source",
  name: "Profile",
  position: { x: 0, y: 0 },
  parentId: null,
  type: { kind: "shape", shapeId: profileShape.id },
};

const flowSource: SourceNode = {
  id: "source-ballot",
  kind: "source",
  name: "Ballot",
  position: { x: 0, y: 0 },
  parentId: "flow-ballot",
  type: { kind: "shape", shapeId: profileShape.id },
};

const graph = { shapes: [profileShape], nodes: [], edges: [] } as unknown as ShowGraph;
const editing = { graph } as unknown as SourceValueEditing;

const bridge: ValueTransferBridge = {
  persistDraft: () => Promise.resolve(4),
  acceptDefault: () => {},
  setBlocked: () => {},
};

const SHOW_ID = "show-voting";

/** One static client; every method resolves from fixed data, never a fetch. */
function makeClient(overrides: Partial<ValueTransferClient> = {}): ValueTransferClient {
  const context: SourceValueContext = {
    showId: SHOW_ID,
    showName: "Audience Voting",
    activeRun: { runId: "run-live-42", publishedVersion: 7 },
    instances: [],
  };
  const read: SourceValueRead = {
    target: {
      kind: "default",
      showId: SHOW_ID,
      sourceId: scalarSource.id,
      fieldPath: [],
      draftVersion: 4,
    },
    plainText: '"Doors open at 7"',
    typedText: '{"version":1,"kind":"scalar","type":"text","value":"Doors open at 7"}',
    copyOnly: false,
    scopeLabel: "Show-level Current value",
    sourceLabel: "Headline",
  };
  const prepared: PreparedSourceValue = {
    operationId: "op-1",
    target: read.target,
    oldValue: "Welcome",
    replacementValue: "Doors open at 7",
    representation: "typed",
    showName: "Audience Voting",
    sourceLabel: "Headline",
    scopeLabel: "Show-level Current value",
    aliasEffects: "No shared references.",
    copyOnly: false,
  };
  const pending: ValueOperationOutcome = { kind: "pending" };
  return {
    context: () => Promise.resolve(context),
    read: () => Promise.resolve(read),
    prepare: () => Promise.resolve(prepared),
    commit: () => Promise.resolve(pending),
    lookup: () => Promise.resolve(pending),
    ...overrides,
  };
}

function Wrapper({
  node,
  client,
  showId = SHOW_ID,
}: {
  node: SourceNode;
  client: ValueTransferClient;
  showId?: string | null;
}) {
  return (
    <SidebarProvider className="min-h-screen w-full bg-background">
      <div className="min-h-screen flex-1 bg-background" />
      <Sidebar collapsible="offcanvas" side="right" variant="floating" aria-label="Source values">
        <SidebarContent className="p-0">
          <SourceValueClipboardProvider showId={showId} bridge={bridge} client={client}>
            <Section label="Source values">
              <SourceValueClipboard node={node} editing={editing} />
            </Section>
          </SourceValueClipboardProvider>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

const meta = {
  title: "studio/Editors/Show/Graph/ValueTransfer/SourceValueClipboard",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Clicks the plane toggle so the Current controls appear deterministically. */
function selectCurrentPlane(canvasElement: HTMLElement) {
  const toggle = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === "Current",
  );
  toggle?.click();
}

/** A scalar Source: Default plane, whole-Source value region and Copy gestures. */
export const ScalarDefault: Story = {
  render: () => <Wrapper node={scalarSource} client={makeClient()} />,
};

/** A structured Source: the nested-Field selector lists Shape Fields, never array interiors. */
export const StructuredDefault: Story = {
  render: () => <Wrapper node={structuredSource} client={makeClient()} />,
};

/** A Show-level Current read: the read-only live summary, no Default fallback. */
export const CurrentShow: Story = {
  render: () => <Wrapper node={scalarSource} client={makeClient()} />,
  play: async ({ canvasElement }) => {
    selectCurrentPlane(canvasElement);
  },
};

/** A Flow-local Source: Current needs an explicit Shared Instance; none is inferred. */
export const SharedInstance: Story = {
  render: () => (
    <Wrapper
      node={flowSource}
      client={makeClient({
        context: () =>
          Promise.resolve({
            showId: SHOW_ID,
            showName: "Audience Voting",
            activeRun: { runId: "run-live-42", publishedVersion: 7 },
            instances: [
              {
                deviceId: "device-foyer",
                deviceName: "Foyer screen",
                flowId: "flow-ballot",
                instanceId: "run-live-42:device-foyer",
              },
              {
                deviceId: "device-stage",
                deviceName: "Stage display",
                flowId: "flow-ballot",
                instanceId: "run-live-42:device-stage",
              },
            ],
          }),
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    selectCurrentPlane(canvasElement);
  },
};

/** A failed read becomes an actionable diagnostic, never silent absence. */
export const CopyError: Story = {
  render: () => (
    <Wrapper
      node={scalarSource}
      client={makeClient({
        read: () => Promise.reject(new Error("The value could not be evaluated for this Run.")),
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const copy = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Copy value",
    );
    copy?.click();
  },
};

const UNKNOWN_SHOW_ID = "show-unknown";
const unknownTarget: ValueTarget = {
  kind: "current-show",
  showId: UNKNOWN_SHOW_ID,
  sourceId: scalarSource.id,
  fieldPath: [],
  runId: "run-live-99",
  publishedVersion: 3,
};

/**
 * A submitted replacement whose outcome the transport never reported stays
 * pinned across a remount — dependent edits and authored history are blocked
 * until its exact result is checked. Seeded through the same session-storage
 * identity the provider restores from (never authority, only the identity).
 */
export const UnknownOutcome: Story = {
  render: () => {
    sessionStorage.setItem(
      `mechane.value-transfer.pending-operation:${UNKNOWN_SHOW_ID}`,
      JSON.stringify({
        showId: UNKNOWN_SHOW_ID,
        operationId: "op-unresolved-7",
        target: unknownTarget,
        selection: {
          showId: UNKNOWN_SHOW_ID,
          sourceId: scalarSource.id,
          plane: "current",
          scope: "show",
          fieldPath: [],
          instanceId: null,
          incomingWired: false,
        },
      }),
    );
    return <Wrapper node={scalarSource} client={makeClient()} showId={UNKNOWN_SHOW_ID} />;
  },
};
