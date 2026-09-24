// The one place a GraphQL Show graph read becomes a domain `ShowGraph`
// (#742, ADR-0020) — the Show graph counterpart to ./canvas.ts's
// `decodeCanvasDocument` (#436, ADR-0014).
//
// Studio and the Player had each grown a full reconstruction of the same wire
// vocabulary: eight matching converters apiece, one over typed gql.tada
// results and one over `unknown`. Two adapters made the seam real; two
// implementations made it wrong. They disagreed about Shape Field ordering,
// about whether an Action discriminates on `__typename` or its wire `kind`,
// about how a Transformer's subtype is identified, and about how absence is
// spelled — and each disagreement was invisible from either side alone.
//
// Selection is shared for the intersection, not for everything. Both hosts
// spread `ShowGraphFields`; the Show Editor additionally spreads
// `ShowGraphEditorFields` for the three things only an editor can consume —
// persisted UI metadata, a Flow's authored size, and an edge's dragged route.
// Those are conditional on the caller's selection and absent means absent.
// One fat fragment would have been a simpler input type, at the cost of
// shipping editor payload to every audience phone in the venue, which
// ADR-0001 makes a real cost rather than a theoretical one.
//
// Everything else is shared, including two things that used to look
// editor-only and were not:
//
//   - A Transformer's `ports` and `transform`. The domain requires
//     `TransformerNode.transform`, so a Player graph without it was a cast
//     that lied, and `prepareCanvasPresentation` reads `node.transform.kind`
//     across every graph node when no shuffle seeds are supplied.
//   - A Scene Variable's `defaultValue`. It is the authored literal an
//     unwired Variable falls back to, and `prepareCanvasPresentation` reads
//     it for exactly that — so the Player rendered nothing where Studio's
//     preview rendered the default.
//
// A malformed document throws. An unknown kind means the client is older
// than the server, which is a version problem rather than a data problem, and
// decoding around it produces a Show quietly missing wiring nobody asked to
// lose. ADR-0016 owns where that failure goes: a Run Error, recorded by the
// host that caught it.
//
// What stays out is the reading itself. This decoder owns whether a document
// can be reconstructed at all — unknown kinds, duplicate identity, references
// that resolve to nothing. Whether the result is a *legal* Show graph — Type
// compatibility, Wiring Conversion validity, Block Reference Graph
// acyclicity — stays in @mechane/domain, where the Shapes and Types those
// rules need are already resolved.
import type {
  Action,
  Block,
  BlockState,
  BlockVariable,
  Cue,
  CueParameter,
  EdgeLayout,
  EditorMetadata,
  EventBinding,
  FlowSize,
  GraphEdge,
  GraphNode,
  Shape,
  ShapeField,
  ShowGraph,
  SlotEventBinding,
  SourceFieldDefault,
  TransformerInputPort,
  TransformerTransform,
  Type,
  UpdateOperation,
} from "@mechane/domain";
import {
  PRIMITIVE_TYPES,
  decodeEventBinding,
  InvalidInteractionError,
  isFlowColor,
  isWiringConversion,
} from "@mechane/domain";
import { CanvasElementFields, decodeCanvasDocument } from "./canvas";
import { graphql } from "./graphql";
import { isRecord } from "./type-guards";

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Every Show graph field both hosts read, in one fragment.
 *
 * Spread this wherever a Show graph is read. A field added here reaches
 * Studio and the Player at once, which is the point: the divergences this
 * replaced were all fields one host selected and the other did not.
 */
export const ShowGraphFields = graphql(
  `
    fragment ShowGraphFields on ShowGraph @_unmask {
      showId
      state
      updatedAt
      version
      sourceFieldDefaults {
        nodeId
        fieldPath
        value
      }
      blocks {
        id
        name
        stateSelectorVariableId
        canvas {
          id
          kind
          elements {
            ...CanvasElementFields
          }
        }
        variables {
          id
          name
          required
          defaultValue
          type {
            kind
            shapeId
            of {
              kind
              shapeId
            }
          }
        }
        states {
          id
          name
          isDefault
          overrides {
            elementId
            property
            value
          }
        }
      }
      nodes {
        __typename
        id
        name
        parentId
        color
        position {
          x
          y
        }
        ... on SceneNode {
          variables {
            id
            name
            rank
            defaultValue
            type {
              kind
              shapeId
              of {
                kind
                shapeId
              }
            }
            suggestedDimensions {
              width
              height
            }
          }
        }
        ... on FlowNode {
          defaultSceneId
        }
        ... on SourceNode {
          sourceType: type {
            kind
            shapeId
            of {
              kind
              shapeId
            }
          }
        }
        ... on TransformerNode {
          transformerType: type {
            kind
            shapeId
            of {
              kind
              shapeId
            }
          }
          ports {
            id
            name
            rank
          }
          transform {
            __typename
            kind
            ... on CalculateTransform {
              calculateFormula: formula
              outputType {
                kind
                shapeId
                of {
                  kind
                  shapeId
                }
              }
            }
            ... on FilterTransform {
              filterFormula: formula
            }
          }
        }
        ... on DeviceNode {
          perConnection
          pairingCode
        }
      }
      edges {
        __typename
        id
        sourceId
        targetId
        sourcePath
        targetPath
        ... on WiringEdge {
          fieldMapping
          conversion
          targetVariableId
        }
        ... on NavigateEdge {
          cueId
          actionId
        }
        ... on UpdateEdge {
          cueId
          actionId
        }
      }
      cues {
        id
        name
        ownerKind
        sceneId
        blockId
        actionIds
        parameters {
          id
          name
          type
          position
        }
      }
      actions {
        __typename
        id
        cueId
        kind
        targetSceneId
        targetSourceId
        params
      }
      eventBindings {
        id
        canvasId
        elementId
        eventKind
        params
        cueId
        position
        parameterMappings
      }
      slotEventBindings {
        id
        slotElementId
        sourceCueId
        targetCueId
        position
        parameterMappings
      }
      shapes {
        id
        name
        fields {
          id
          name
          position
          required
          type {
            kind
            shapeId
            of {
              kind
              shapeId
            }
          }
          default {
            __typename
            ... on TextValue {
              textValue: value
            }
            ... on NumberValue {
              numberValue: value
            }
            ... on BooleanValue {
              booleanValue: value
            }
            ... on ImageValue {
              assetId
              url
              width
              height
              alt
              mimeType
              blurHash
            }
            ... on ColorValue {
              colorValue: value
            }
            ... on DateValue {
              dateValue: value
            }
            ... on DateTimeValue {
              datetimeValue: value
            }
            ... on ObjectValue {
              objectValue: value
            }
            ... on ArrayValue {
              arrayValue: value
            }
          }
        }
      }
    }
  `,
  [CanvasElementFields],
);

/**
 * The Show graph fields only the Show Editor can consume: persisted UI
 * state, a Flow's authored size, and where an author dragged an edge's or an
 * Action's route.
 *
 * Deliberately *not* a fragment. gql.tada types two selections of the same
 * field as an intersection of arrays, so a second fragment on `ShowGraph`
 * makes the result type unassignable; the Show Editor's document selects
 * these inline instead. This list is the contract the decoder honours: a
 * Player result legitimately carries none of them, so each is read as
 * absent rather than missing.
 */
export const SHOW_GRAPH_EDITOR_FIELDS = [
  "nodes.editorMetadata",
  "nodes.size",
  "edges.layout",
  "actions.layout",
] as const;

// ---------------------------------------------------------------------------
// Failure
// ---------------------------------------------------------------------------

/** Why a Show graph document was refused, as something a host can branch on. */
export type ShowGraphDocumentErrorCode =
  | "malformed-document"
  | "unknown-node-kind"
  | "unknown-edge-kind"
  | "unknown-transform-kind"
  | "unknown-action-kind"
  | "unknown-type"
  | "invalid-node-color"
  | "invalid-cue-owner"
  | "invalid-update-action"
  | "invalid-event-binding"
  | "duplicate-id"
  | "unresolved-reference";

/**
 * A Show graph that cannot be reconstructed from what the wire carried.
 *
 * The code is the branchable fact and `subjectId` names the node, edge, Cue,
 * Action or binding at fault; the message is for a developer, not a reader.
 * A host words this for its own audience — ADR-0016's Run Error log for the
 * Player, an editor error for Studio.
 */
export class ShowGraphDocumentError extends Error {
  readonly code: ShowGraphDocumentErrorCode;
  readonly subjectId: string | null;

  constructor(code: ShowGraphDocumentErrorCode, message: string, subjectId: string | null = null) {
    super(message);
    this.name = "ShowGraphDocumentError";
    this.code = code;
    this.subjectId = subjectId;
  }
}

function fail(
  code: ShowGraphDocumentErrorCode,
  message: string,
  subjectId: string | null = null,
): never {
  throw new ShowGraphDocumentError(code, message, subjectId);
}

// ---------------------------------------------------------------------------
// Reading the wire
// ---------------------------------------------------------------------------

type Wire = Record<string, unknown>;

function wire(value: unknown, what: string, subjectId: string | null = null): Wire {
  if (!isRecord(value)) fail("malformed-document", `${what} is not an object.`, subjectId);
  return value;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, what: string, subjectId: string | null = null): string {
  if (typeof value !== "string") {
    fail("malformed-document", `${what} must be a string.`, subjectId);
  }
  return value;
}

function strings(value: unknown): string[] {
  return list(value).map(String);
}

/** An absent optional key and an explicit `null` are the same Typed Absence. */
function orNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

// ---------------------------------------------------------------------------
// Types and Shapes
// ---------------------------------------------------------------------------

function toType(value: unknown, subjectId: string | null): Type {
  const input = wire(value, "A Type", subjectId);
  if (input.kind === "array") {
    if (input.of === null || input.of === undefined) {
      fail("unknown-type", "Array Shape types must include an element type.", subjectId);
    }
    return { kind: "array", of: toType(input.of, subjectId) };
  }
  if (input.kind === "shape") {
    if (typeof input.shapeId !== "string" || input.shapeId.length === 0) {
      fail("unknown-type", "Shape references must include a Shape id.", subjectId);
    }
    return { kind: "shape", shapeId: input.shapeId };
  }
  const primitive = PRIMITIVE_TYPES.find((candidate) => candidate === input.kind);
  if (primitive) return primitive;
  return fail("unknown-type", `Unknown Type "${String(input.kind)}".`, subjectId);
}

/**
 * The authored Field default arrives as the `ShapeValue` union, so its value
 * sits under a per-kind alias beside `__typename`. An ImageValue is kept
 * whole: its identity is the asset, not a scalar.
 */
function toFieldDefault(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const input = wire(value, "A Shape Field default");
  if (input.__typename === "ImageValue") return input;
  return Object.entries(input).find(([key]) => key !== "__typename")?.[1] ?? null;
}

function toShape(value: unknown): Shape {
  const input = wire(value, "A Shape");
  const id = text(input.id, "A Shape id");
  // A Shape is an ordered list of Fields (CONTEXT.md), and that order is
  // user-visible as column order — so it comes from `position`, never from
  // whatever order the response happened to arrive in.
  const fields: ShapeField[] = list(input.fields)
    .map((field) => wire(field, "A Shape Field", id))
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((field) => ({
      id: text(field.id, "A Shape Field id", id),
      name: text(field.name, "A Shape Field name", id),
      type: toType(field.type, id),
      required: field.required === true,
      defaultValue: toFieldDefault(field.default),
    }));
  return { id, name: text(input.name, "A Shape name", id), fields };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function toBlock(value: unknown): Block {
  const input = wire(value, "A Block");
  const id = text(input.id, "A Block id");
  const canvasInput = wire(input.canvas, "A Block Canvas", id);
  const variables: BlockVariable[] = list(input.variables).map((entry) => {
    const variable = wire(entry, "A Block Variable", id);
    return {
      id: text(variable.id, "A Block Variable id", id),
      name: text(variable.name, "A Block Variable name", id),
      type: toType(variable.type, id),
      required: variable.required === true,
      defaultValue: variable.defaultValue ?? null,
    };
  });
  const states: BlockState[] = list(input.states).map((entry) => {
    const state = wire(entry, "A Block State", id);
    return {
      id: text(state.id, "A Block State id", id),
      name: text(state.name, "A Block State name", id),
      isDefault: state.isDefault === true,
      overrides: list(state.overrides).map((entry) => {
        const override = wire(entry, "A State Override", id);
        return {
          elementId: text(override.elementId, "A State Override Element id", id),
          property: text(override.property, "A State Override property", id),
          value: override.value,
        };
      }),
    };
  });
  return {
    id,
    name: text(input.name, "A Block name", id),
    canvas: { ...decodeCanvasDocument(canvasInput), id: text(canvasInput.id, "A Canvas id", id) },
    variables,
    states,
    stateSelectorVariableId:
      typeof input.stateSelectorVariableId === "string" ? input.stateSelectorVariableId : null,
  };
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * Derived from the domain's own node kinds so a new kind is one edit rather
 * than two that can disagree, and matching the naming ADR-0007 fixed.
 */
const NODE_KIND_BY_TYPENAME = {
  SceneNode: "scene",
  FlowNode: "flow",
  SourceNode: "source",
  TransformerNode: "transformer",
  DeviceNode: "device",
} as const satisfies Record<string, GraphNode["kind"]>;

function toTransform(value: unknown, subjectId: string): TransformerTransform {
  const transform = wire(value, "A Transformer transform", subjectId);
  switch (transform.__typename) {
    case "CalculateTransform":
      return {
        kind: "calculate",
        formula: orNull(transform.calculateFormula as string | null | undefined),
        outputType: transform.outputType ? toType(transform.outputType, subjectId) : null,
      };
    case "FilterTransform":
      return { kind: "filter", formula: orNull(transform.filterFormula as string | null) ?? "" };
    case "ShuffleTransform":
      return { kind: "shuffle" };
    default:
      // A subtype this build cannot describe used to become a Shuffle, which
      // invents a Transformer that does real work: ADR-0004 gives Shuffle a
      // seed from its runtime scope and a scope-owned order.
      return fail(
        "unknown-transform-kind",
        `Unknown Transformer transform "${String(transform.__typename)}".`,
        subjectId,
      );
  }
}

/**
 * One graph node, for a caller holding a node outside a graph document — the
 * Player's active Scene and its Flow bundle's Scenes and Transformers, which
 * arrive beside the graph rather than inside it (ADR-0018).
 */
export function decodeGraphNode(value: unknown): GraphNode {
  const input = wire(value, "A graph node");
  const id = text(input.id, "A graph node id");
  const typename = String(input.__typename);
  const kind = NODE_KIND_BY_TYPENAME[typename as keyof typeof NODE_KIND_BY_TYPENAME];
  if (!kind) {
    fail("unknown-node-kind", `Unknown Show graph node typename "${typename}".`, id);
  }
  if (
    input.color !== null &&
    input.color !== undefined &&
    !(typeof input.color === "string" && isFlowColor(input.color))
  ) {
    fail("invalid-node-color", `Unknown Show node color "${String(input.color)}".`, id);
  }
  const position = wire(input.position, "A graph node position", id);
  const base = {
    id,
    name: text(input.name, "A graph node name", id),
    parentId: orNull(input.parentId as string | null | undefined),
    position: { x: Number(position.x), y: Number(position.y) },
    ...(input.color ? { color: input.color as NonNullable<GraphNode["color"]> } : {}),
    // Editor-only, so absent on a Player result by selection rather than by
    // accident — see `ShowGraphEditorFields`.
    ...(input.editorMetadata ? { editorMetadata: input.editorMetadata as EditorMetadata } : {}),
  };
  switch (kind) {
    case "scene":
      return {
        ...base,
        kind: "scene",
        variables: list(input.variables).map((entry) => {
          const variable = wire(entry, "A Scene Variable", id);
          return {
            id: text(variable.id, "A Scene Variable id", id),
            name: text(variable.name, "A Scene Variable name", id),
            ...(variable.rank ? { rank: String(variable.rank) } : {}),
            type: variable.type ? toType(variable.type, id) : null,
            defaultValue: variable.defaultValue ?? null,
            ...(variable.suggestedDimensions
              ? {
                  suggestedDimensions: variable.suggestedDimensions as NonNullable<
                    Extract<
                      GraphNode,
                      { kind: "scene" }
                    >["variables"][number]["suggestedDimensions"]
                  >,
                }
              : {}),
          };
        }),
      };
    case "flow":
      // Flows and Devices are always Show-level peers (#23, #26), which the
      // domain types as `parentId: null` — asserted here rather than read, so
      // a wire graph that disagrees fails domain validation.
      return {
        ...base,
        kind: "flow",
        parentId: null,
        defaultSceneId: orNull(input.defaultSceneId as string | null | undefined),
        ...(input.size ? { size: input.size as FlowSize } : {}),
      };
    case "device":
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: input.perConnection === true,
        pairingCode: orNull(input.pairingCode as string | null | undefined),
      };
    case "source":
      return { ...base, kind: "source", type: toType(input.sourceType, id) };
    case "transformer": {
      const ports: TransformerInputPort[] = list(input.ports).map((entry) => {
        const port = wire(entry, "A Transformer port", id);
        return {
          id: text(port.id, "A Transformer port id", id),
          name: text(port.name, "A Transformer port name", id),
          ...(port.rank ? { rank: String(port.rank) } : {}),
        };
      });
      return { ...base, kind: "transformer", ports, transform: toTransform(input.transform, id) };
    }
  }
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

const EDGE_KIND_BY_TYPENAME = {
  WiringEdge: "wiring",
  NavigateEdge: "navigate",
  UpdateEdge: "update",
  DeviceEdge: "device",
} as const satisfies Record<string, GraphEdge["kind"]>;

function toEdge(value: unknown): GraphEdge {
  const input = wire(value, "A graph edge");
  const id = text(input.id, "A graph edge id");
  const typename = String(input.__typename);
  const kind = EDGE_KIND_BY_TYPENAME[typename as keyof typeof EDGE_KIND_BY_TYPENAME];
  if (!kind) {
    fail("unknown-edge-kind", `Unknown Show graph edge typename "${typename}".`, id);
  }
  const base = {
    id,
    sourceId: text(input.sourceId, "A graph edge sourceId", id),
    targetId: text(input.targetId, "A graph edge targetId", id),
    sourcePath: strings(input.sourcePath),
    targetPath: strings(input.targetPath),
    // Where the author dragged this edge's runs (#475) — on every edge kind,
    // not just wiring. Editor-only; see `ShowGraphEditorFields`.
    ...(input.layout ? { layout: input.layout as EdgeLayout } : {}),
  };
  switch (kind) {
    case "navigate":
      return {
        ...base,
        kind: "navigate",
        cueId: orNull(input.cueId as string | null | undefined),
        actionId: orNull(input.actionId as string | null | undefined),
      };
    case "update":
      return {
        ...base,
        kind: "update",
        cueId: orNull(input.cueId as string | null | undefined) ?? "",
        actionId: orNull(input.actionId as string | null | undefined) ?? "",
      };
    case "device":
      return { ...base, kind: "device" };
    case "wiring":
      return {
        ...base,
        kind: "wiring",
        ...(input.fieldMapping ? { fieldMapping: { ...(input.fieldMapping as Wire) } } : {}),
        ...(typeof input.targetVariableId === "string"
          ? { targetVariableId: input.targetVariableId }
          : {}),
        // A Conversion this build does not recognise is dropped, not carried:
        // the edge then reads as plainly mistyped rather than as doing
        // something this build cannot describe (#532).
        ...(typeof input.conversion === "string" && isWiringConversion(input.conversion)
          ? { conversion: input.conversion }
          : {}),
      } as GraphEdge;
  }
}

// ---------------------------------------------------------------------------
// Cues, Actions, bindings
// ---------------------------------------------------------------------------

function toCue(value: unknown): Cue {
  const input = wire(value, "A Cue");
  const id = text(input.id, "A Cue id");
  const parameters: CueParameter[] = list(input.parameters).map((entry) => {
    const parameter = wire(entry, "A Cue Parameter", id);
    return {
      id: text(parameter.id, "A Cue Parameter id", id),
      name: text(parameter.name, "A Cue Parameter name", id),
      type: parameter.type as Type,
      position: Number(parameter.position),
    };
  });
  const base = { id, name: text(input.name, "A Cue name", id), parameters };
  const actionIds = strings(input.actionIds);
  if (input.ownerKind === "scene" && typeof input.sceneId === "string") {
    return { ...base, owner: { kind: "scene", sceneId: input.sceneId }, actionIds };
  }
  if (input.ownerKind === "block" && typeof input.blockId === "string") {
    return { ...base, owner: { kind: "block", blockId: input.blockId }, actionIds };
  }
  // An unrecognised owner used to fall through to Block ownership, which
  // silently reparents an authored interaction.
  return fail("invalid-cue-owner", `Cue "${id}" has an invalid owner.`, id);
}

function toAction(value: unknown): Action {
  const input = wire(value, "An Action");
  const id = text(input.id, "An Action id");
  const base = {
    id,
    cueId: text(input.cueId, "An Action cueId", id),
    // Where the author dragged this Action's projected edge (#475, #597).
    // The edge does not outlive a write, so this is the durable half.
    ...(input.layout ? { layout: input.layout as EdgeLayout } : {}),
  };
  switch (input.__typename) {
    case "NavigateAction":
      return {
        ...base,
        kind: "navigate",
        targetSceneId: text(input.targetSceneId, "A Navigate Action targetSceneId", id),
      };
    case "UpdateAction": {
      const params = wire(input.params, "An Update Action's params", id);
      if (!Array.isArray(params.fieldPath) || !params.operation) {
        fail("invalid-update-action", `Action "${id}" has invalid Update params.`, id);
      }
      return {
        ...base,
        kind: "update",
        target: {
          sourceId: text(input.targetSourceId, "An Update Action targetSourceId", id),
          fieldPath: params.fieldPath.map(String),
        },
        operation: params.operation as UpdateOperation,
      };
    }
    default:
      return fail(
        "unknown-action-kind",
        `Unknown Action typename "${String(input.__typename)}".`,
        id,
      );
  }
}

function toEventBinding(value: unknown): EventBinding {
  const input = wire(value, "An Event Binding");
  try {
    return decodeEventBinding(input as Parameters<typeof decodeEventBinding>[0]);
  } catch (error) {
    if (error instanceof InvalidInteractionError) {
      return fail(
        "invalid-event-binding",
        `Event Binding "${String(input.id)}" is invalid: ${error.message}`,
        typeof input.id === "string" ? input.id : null,
      );
    }
    throw error;
  }
}

function toSlotEventBinding(value: unknown): SlotEventBinding {
  const input = wire(value, "A Slot Event Binding");
  const id = text(input.id, "A Slot Event Binding id");
  return {
    id,
    slotElementId: text(input.slotElementId, "A Slot Event Binding Slot Element id", id),
    sourceCueId: text(input.sourceCueId, "A Slot Event Binding source Cue id", id),
    targetCueId: text(input.targetCueId, "A Slot Event Binding target Cue id", id),
    position: Number(input.position),
    parameterMappings: list(input.parameterMappings).map((entry) => {
      const mapping = wire(entry, "A Cue Parameter mapping", id);
      return {
        sourceParameterId: text(mapping.sourceParameterId, "A source Cue Parameter id", id),
        targetParameterId: text(mapping.targetParameterId, "A target Cue Parameter id", id),
        ...(Array.isArray(mapping.sourceFieldPath)
          ? { sourceFieldPath: mapping.sourceFieldPath.map(String) }
          : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Structural integrity
// ---------------------------------------------------------------------------

function requireUnique(ids: readonly string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail("duplicate-id", `Two ${what} share the id "${id}".`, id);
    seen.add(id);
  }
}

/**
 * References that resolve to nothing, which is the failure a hand-written
 * mapper produces and the shape of the bug #347 found going the other way.
 *
 * Deliberately not domain validation: whether the graph is *legal* — Type
 * compatibility, Wiring Conversion validity, Block Reference Graph
 * acyclicity — belongs to @mechane/domain and would drift if restated here.
 */
function requireResolvableReferences(graph: ShowGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const actionIds = new Set((graph.actions ?? []).map((action) => action.id));
  const cueIds = new Set((graph.cues ?? []).map((cue) => cue.id));

  requireUnique(
    graph.nodes.map((node) => node.id),
    "graph nodes",
  );
  requireUnique(
    graph.edges.map((edge) => edge.id),
    "graph edges",
  );
  requireUnique([...actionIds], "Actions");
  requireUnique([...cueIds], "Cues");

  for (const node of graph.nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) {
      fail(
        "unresolved-reference",
        `Node "${node.id}" names a parent "${node.parentId}" that is not in the graph.`,
        node.id,
      );
    }
  }
  for (const edge of graph.edges) {
    for (const [end, id] of [
      ["source", edge.sourceId],
      ["target", edge.targetId],
    ] as const) {
      if (!nodeIds.has(id)) {
        fail(
          "unresolved-reference",
          `Edge "${edge.id}" names a ${end} "${id}" that is not in the graph.`,
          edge.id,
        );
      }
    }
  }
  for (const cue of graph.cues ?? []) {
    for (const actionId of cue.actionIds) {
      if (!actionIds.has(actionId)) {
        fail(
          "unresolved-reference",
          `Cue "${cue.id}" names an Action "${actionId}" that is not in the graph.`,
          cue.id,
        );
      }
    }
  }
  for (const binding of graph.slotEventBindings ?? []) {
    for (const [end, id] of [
      ["source", binding.sourceCueId],
      ["target", binding.targetCueId],
    ] as const) {
      if (!cueIds.has(id)) {
        fail(
          "unresolved-reference",
          `Slot Event Binding "${binding.id}" names a ${end} Cue "${id}" that is not in the graph.`,
          binding.id,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * One Show graph read: the graph, plus the facts about *this read*.
 *
 * `version` is deliberately beside the graph rather than inside it. ADR-0006
 * has Studio compose edits against a base version and the Player stamp one
 * onto every Event it submits, but two reads of an unchanged graph can carry
 * different versions — so it describes the read, not the Show.
 */
export interface ShowGraphDocument {
  readonly graph: ShowGraph;
  readonly showId: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly version: number;
}

/**
 * One Show graph document as the graph Studio edits and the Player runs.
 *
 * Throws {@link ShowGraphDocumentError} when the document cannot be
 * reconstructed. Whether there is a document at all is the host's call: a
 * query that has not resolved is a loading state, not a malformed read.
 */
export function decodeShowGraphDocument(document: unknown): ShowGraphDocument {
  const input = wire(document, "A Show graph document");
  const graph: ShowGraph = {
    shapes: list(input.shapes).map(toShape),
    sourceFieldDefaults: list(input.sourceFieldDefaults).map((entry): SourceFieldDefault => {
      const fieldDefault = wire(entry, "A Source Field default");
      return {
        nodeId: text(fieldDefault.nodeId, "A Source Field default nodeId"),
        fieldPath: strings(fieldDefault.fieldPath),
        value: fieldDefault.value,
      };
    }),
    blocks: list(input.blocks).map(toBlock),
    nodes: list(input.nodes).map(decodeGraphNode),
    cues: list(input.cues).map(toCue),
    actions: list(input.actions).map(toAction),
    eventBindings: list(input.eventBindings).map(toEventBinding),
    slotEventBindings: list(input.slotEventBindings).map(toSlotEventBinding),
    edges: list(input.edges).map(toEdge),
  };
  requireResolvableReferences(graph);
  return {
    graph,
    showId: text(input.showId, "A Show graph showId"),
    state: text(input.state, "A Show graph state"),
    updatedAt: text(input.updatedAt, "A Show graph updatedAt"),
    version: Number(input.version),
  };
}
