// GraphQL schema. `me` proves a signed-in user is resolvable in the
// resolver layer; the Show query/mutations (issue #3) are the first real
// owned-resource vertical slice, using `requireUserId` (./context.ts) and
// `assertOwnedBy`/`assertValidShowName` (@mechane/domain) the same way
// every later owned resource (Scene, Device, ...) should.
import type {
  CanvasWorkspaceEdit,
  FlatCanvasEdit,
  FlatGraphEdit,
  GraphEdit,
} from "@mechane/commands";
import {
  CanvasEditCodecError,
  CanvasEditError,
  decodeCanvasWorkspaceEdit,
  isCanvasWorkspaceEditType,
} from "@mechane/commands";
import type { GraphState } from "@mechane/domain";
import {
  assertOwnedBy,
  assertValidGraphState,
  assertValidImageName,
  assertValidShowName,
  assertValidThemeMode,
  assertValidThemePalette,
  DEFAULT_IMAGE_UPLOAD_POLICY,
  defaultThemeSettings,
  InvalidGraphStateError,
  InvalidImageNameError,
  InvalidInteractionError,
  InvalidShowNameError,
  InvalidThemeModeError,
  InvalidThemePaletteError,
  isId,
} from "@mechane/domain";
import { and, eq } from "drizzle-orm";
import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import { createSchema } from "graphql-yoga";

import { randomUUID } from "node:crypto";
import { readCanvasWorkspace } from "../db/canvas";
import { db } from "../db/client";
import { withUniqueId } from "../db/ids";
import { readPlayerSession } from "../player";
import { commitBlob, imageDeliveryUrl, listImageAssets, toImageAsset } from "../db/images";
import {
  dispatchPlayerEvent,
  PlayerDispatchConfigurationError,
  PlayerEventInputError,
  type PlayerEventInput,
} from "../db/player-events";
import { endRun, readActiveRun, startRun } from "../db/runs";
import { blobUploadSessions, imageAssets, shows, userSettings } from "../db/schema";
import {
  applyShowEdits as applyShowEditsToDb,
  GraphVersionConflictError,
  publishShowGraph,
  readShowGraph,
} from "../db/show-graph";
import { ImageProcessingError, processImage } from "../images";
import { blobStore } from "../storage/blob-store";
import { resolveCanvasElementType, serializeArtboard, serializeCanvas } from "./canvas";
import type { GraphQLContext } from "./context";
import { requirePlayerPairingCode, requireUserId } from "./context";
import {
  parseGraphEdit,
  resolveGraphEdgeType,
  resolveGraphNodeType,
  serializeBlock,
  serializeShowGraph,
} from "./show-graph";

function serializeRun(run: Awaited<ReturnType<typeof startRun>>) {
  return {
    id: run.id,
    showId: run.showId,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    sourceValues: run.sourceValues,
  };
}

// graphql-yoga masks any thrown error that isn't a GraphQLError as a generic
// "Unexpected error" (sound default — it stops internal error messages
// leaking to clients). @mechane/domain's validation errors are plain
// Errors so they stay usable outside a GraphQL context, so translate them
// here into a GraphQLError the client can actually read.
function toShapeValue(value: unknown, type: unknown): unknown {
  if (typeof type === "string") return { kind: type, value };
  if (type && typeof type === "object" && "kind" in type) {
    if (type.kind === "array") return { kind: "array", value };
    if (type.kind === "shape") return { kind: "object", value };
  }
  return null;
}

function validShowName(name: string): string {
  try {
    return assertValidShowName(name);
  } catch (error) {
    if (error instanceof InvalidShowNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

function validImageName(name: string): string {
  try {
    return assertValidImageName(name);
  } catch (error) {
    if (error instanceof InvalidImageNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

// Mirrors `validShowName` above: @mechane/domain's validators are plain
// Errors so they stay usable outside a GraphQL context, so translate them
// into a GraphQLError the client can read rather than the generic
// "Unexpected error" graphql-yoga masks non-GraphQLErrors as.
function validThemeMode(value: string): string {
  try {
    return assertValidThemeMode(value);
  } catch (error) {
    if (error instanceof InvalidThemeModeError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

function validThemePalette(value: string): string {
  try {
    return assertValidThemePalette(value);
  } catch (error) {
    if (error instanceof InvalidThemePaletteError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

// Same translation again, for the two Show-graph domain errors (#38).
function validGraphState(value: string): GraphState {
  try {
    return assertValidGraphState(value);
  } catch (error) {
    if (error instanceof InvalidGraphStateError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

function imageUploadError(error: unknown): never {
  if (error instanceof ImageProcessingError) {
    throw new GraphQLError(error.message, { extensions: { code: error.code } });
  }
  throw error;
}

function imageUploadSession(session: typeof blobUploadSessions.$inferSelect) {
  return {
    id: session.id,
    expiresAt: session.expiresAt.toISOString(),
    constraints: DEFAULT_IMAGE_UPLOAD_POLICY,
    plan: {
      method: "PUT",
      url: `/api/uploads/${encodeURIComponent(session.id)}`,
      requiredHeaders: {
        "content-type": session.declaredMimeType,
        "content-length": String(session.byteLength),
      },
    },
  };
}

async function findOwnShowOrThrow(id: string, userId: string) {
  // A malformed id can't match any row, so don't ask the database — but
  // report it the same way a missing row is reported, since telling the
  // client "that's not even a valid Show id" is information about the id
  // format they don't need from a mutation.
  if (!isId("show", id)) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
  const [show] = await db.select().from(shows).where(eq(shows.id, id));
  if (!show) {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
  // assertOwnedBy throws NotOwnerError, which reads as "not found" to the
  // caller rather than confirming a Show with this id exists for someone
  // else — a user must not be able to see or mutate another user's Shows.
  try {
    return assertOwnedBy(show, userId);
  } catch {
    throw new GraphQLError("Show not found.", { extensions: { code: "NOT_FOUND" } });
  }
}

export const schema = createSchema<GraphQLContext>({
  typeDefs: /* GraphQL */ `
    type User {
      id: ID!
      name: String!
      email: String!
      emailVerified: Boolean!
    }

    type Show {
      id: ID!
      name: String!
      createdAt: String!
      updatedAt: String!
    }

    type Run {
      id: ID!
      showId: ID!
      status: String!
      startedAt: String!
      endedAt: String
      sourceValues: JSON!
    }
    type PlayerDevice {
      name: String!
      perConnection: Boolean!
    }
    type PlayerRealtime {
      channel: String!
      grant: String!
      expiresAt: String!
    }

    input PlayerEventInput {
      eventId: ID!
      publishedGraphVersion: Int!
      sceneId: ID!
      elementId: ID!
      eventKind: String!
      "Per-kind payload as observed; a keypress carries { key }."
      params: JSON
    }
    type PlayerEventApplied {
      eventId: ID!
      resultingSceneId: ID!
    }
    type PlayerEventDuplicate {
      eventId: ID!
      outcome: String!
      resultingSceneId: ID
      reason: String
    }
    type PlayerEventIgnored {
      eventId: ID!
      reason: String!
    }
    type PlayerEventAccepted {
      eventId: ID!
    }
    type PlayerEventRejected {
      eventId: ID!
      reason: String!
    }
    union PlayerEventResult =
      | PlayerEventApplied
      | PlayerEventDuplicate
      | PlayerEventIgnored
      | PlayerEventAccepted
      | PlayerEventRejected

    type PlayerFlowScene {
      scene: SceneNode!
      canvas: Canvas!
    }
    type PlayerFlowBundle {
      flowId: ID!
      defaultSceneId: ID
      scenes: [PlayerFlowScene!]!
    }
    type PlayerSession {
      device: PlayerDevice!
      realtime: PlayerRealtime!
      run: Run
      graph: ShowGraph!
      flow: PlayerFlowBundle
      scene: SceneNode
      canvas: Canvas
      blocks: [Block!]!
      imageAssets: [ImageAsset!]!
    }
    "The signed-in user's design-system preference (PRD.md §7)."
    type UserSettings {
      "Display mode: light or dark."
      themeMode: String!
      "Which built-in theme is active."
      themePalette: String!
    }

    "Free-form canvas coordinates for a graph node (issue #25 — no auto-layout)."
    type Position {
      x: Float!
      y: Float!
    }

    "A named port on a Scene. A wiring edge targets one of these, not the Scene as a whole."
    type SceneVariable {
      id: ID!
      name: String!
      rank: String
      type: Type
      defaultValue: JSON
      suggestedDimensions: SuggestedImageDimensions
    }

    type SuggestedImageDimensions {
      width: Int!
      height: Int!
    }

    scalar JSON

    "A recursive Type descriptor: primitive, array, or a named Shape reference."
    type Type {
      kind: String!
      of: Type
      shapeId: ID
    }

    input TypeInput {
      kind: String!
      of: TypeInput
      shapeId: ID
    }

    type TextValue {
      value: String!
    }
    type NumberValue {
      value: Float!
    }
    type BooleanValue {
      value: Boolean!
    }
    type ImageValue {
      assetId: ID!
      url: String!
      width: Int!
      height: Int!
      alt: String!
      mimeType: String!
      blurHash: String
    }
    type ColorValue {
      value: String!
    }
    type DateValue {
      value: String!
    }
    type DateTimeValue {
      value: String!
    }
    type ObjectValue {
      value: JSON!
    }
    type ArrayValue {
      value: JSON!
    }
    union ShapeValue =
      | TextValue
      | NumberValue
      | BooleanValue
      | ImageValue
      | ColorValue
      | DateValue
      | DateTimeValue
      | ObjectValue
      | ArrayValue

    input ImageValueInput {
      assetId: ID!
    }

    input ShapeValueInput @oneOf {
      text: String
      number: Float
      boolean: Boolean
      image: ImageValueInput
      color: String
      date: String
      datetime: String
      array: JSON
    }

    type ShapeField {
      id: ID!
      name: String!
      type: Type!
      position: Int!
      required: Boolean!
      default: ShapeValue
    }

    input ShapeFieldInput {
      id: ID!
      name: String!
      type: TypeInput!
      position: Int!
      required: Boolean!
      defaultValue: JSON
    }

    type Shape {
      id: ID!
      name: String!
      fields: [ShapeField!]!
    }
    type BlockVariable {
      id: ID!
      name: String!
      type: Type!
      required: Boolean!
      defaultValue: JSON
    }

    type BlockStateOverride {
      elementId: ID!
      property: String!
      value: JSON
    }

    type BlockState {
      id: ID!
      name: String!
      isDefault: Boolean!
      overrides: [BlockStateOverride!]!
    }

    type Block {
      id: ID!
      name: String!
      canvas: Canvas!
      variables: [BlockVariable!]!
      states: [BlockState!]!
      stateSelectorVariableId: ID
    }

    input ShapeInput {
      id: ID!
      name: String!
      fields: [ShapeFieldInput!]!
    }

    type SourceFieldDefault {
      nodeId: ID!
      fieldPath: [ID!]!
      value: JSON
    }

    """
    The fields shared by every node on the Show graph. Kind-specific data is
    exposed by the concrete node types below; clients use __typename rather
    than a nullable field bag and a string discriminator.
    """
    interface GraphNode {
      id: ID!
      name: String!
      "The Flow containing this node, or null if it's Show-level."
      parentId: ID
      position: Position!
      "The node editor colorway; absent values are neutral or inherit their Flow."
      color: String
    }

    type SceneNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      color: String
      "The Variables wiring edges can target."
      variables: [SceneVariable!]!
    }

    type FlowNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      color: String
      position: Position!
      "The Flow's design-time entry Scene, if one is set."
      defaultSceneId: ID
    }

    type SourceNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      color: String
      type: Type!
      "Sparse default overrides for Source fields, keyed by stable field ids."
      fieldDefaults: [SourceFieldDefault!]!
    }

    type TransformerNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      color: String
      type: Type
    }

    type DeviceNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      color: String
      "Whether each connection is its own logical instance."
      perConnection: Boolean!
      "The server-minted pairing code, absent before the first save."
      pairingCode: String
    }

    """
    The fields shared by every edge on the Show graph. Edge-specific data is
    exposed by the concrete edge types below; clients use __typename rather
    than a nullable field bag and a string discriminator.
    """
    interface GraphEdge {
      id: ID!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]!
      targetPath: [String!]!
      "Where the author has dragged this edge's runs, keyed by route shape (#475)."
      layout: JSON
    }

    type WiringEdge implements GraphEdge {
      id: ID!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]!
      targetPath: [String!]!
      "Where the author has dragged this edge's runs, keyed by route shape (#475)."
      layout: JSON
      "Resolved stable field-id mapping."
      fieldMapping: JSON
      "The Scene Variable this edge feeds — the head of targetPath."
      targetVariableId: ID
    }

    type NavigateEdge implements GraphEdge {
      id: ID!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]!
      targetPath: [String!]!
      "Where the author has dragged this edge's runs, keyed by route shape (#475)."
      layout: JSON
      "The Cue/Action pairing this transition represents."
      cueId: ID
      actionId: ID
    }

    type DeviceEdge implements GraphEdge {
      id: ID!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]!
      targetPath: [String!]!
      "Where the author has dragged this edge's runs, keyed by route shape (#475)."
      layout: JSON
    }

    type EventBinding {
      id: ID!
      canvasId: ID!
      elementId: ID!
      eventKind: String!
      "Per-kind payload. Null for kinds that take no parameters."
      params: JSON
      cueId: ID!
      position: Int!
    }
    type Cue {
      id: ID!
      name: String!
      ownerKind: String!
      sceneId: ID
      blockId: ID
      actionIds: [ID!]!
    }
    type Action {
      id: ID!
      cueId: ID!
      kind: String!
      targetSceneId: ID!
    }

    type PublishLoss {
      sourceId: ID!
      fieldId: ID!
      fieldName: String!
      path: [String!]!
      reason: String!
    }
    "A Show's graph in one state. Draft and published are independently readable (ADR-0002)."
    type ShowGraph {
      showId: ID!
      "Either draft or published."
      state: String!
      nodes: [GraphNode!]!
      edges: [GraphEdge!]!
      shapes: [Shape!]!
      blocks: [Block!]!
      cues: [Cue!]!
      actions: [Action!]!
      eventBindings: [EventBinding!]!
      "Sparse graph-owned Source values, keyed by Source node and field path."
      sourceFieldDefaults: [SourceFieldDefault!]!
      updatedAt: String!
      """
      How many times this graph has been written. An edit batch names the
      version it was composed against, and is refused if that isn't the
      version stored — see \`applyShowEdits\`.
      """
      version: Int!
      "Fields that lost data while this graph was published."
      losses: [PublishLoss!]!
    }
    """
    A persisted Scene or Block Canvas (ADR-0014).

    Elements arrive flat, each naming its parent and its rank, because a
    Canvas hierarchy has no authored depth limit and a recursive selection
    always has one. Clients rebuild the tree; \`@mechane/graphql-schema\`'s
    \`decodeCanvasDocument\` is the one decoder that does it. Element stays an
    interface so clients can select the primitive-specific content without a
    nullable field bag.
    """
    type Canvas {
      id: ID!
      kind: String!
      "Exactly one Element has no parent, and it is the root Frame."
      elements: [Element!]!
    }

    """
    One Canvas as it is placed on the Canvas Editor's plane.

    Framing, not content: an Artboard has a place and a size, while the Canvas
    it presents has an Element tree (CONTEXT.md). Owner identity lives here for
    the same reason — the Canvas editor works on a Canvas without knowing
    whether a Scene or a Block owns it.
    """
    type Artboard {
      canvas: Canvas!
      ownerId: ID!
      ownerName: String!
      position: Position!
    }

    interface Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
    }

    type RectElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      cornerRadius: JSON
    }

    type EllipseElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
    }

    type TextElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      content: JSON
      color: JSON
      fontFamily: JSON
      fontSize: JSON
      fontWeight: JSON
      fontStyle: JSON
      textDecoration: JSON
      lineHeight: JSON
      letterSpacing: JSON
      textAlign: JSON
      textVerticalAlign: JSON
      textOverflow: String
      padding: JSON
    }

    type ImageElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      image: JSON
      alt: JSON
      objectFit: JSON
      objectPosition: JSON
      cornerRadius: JSON
    }

    type FrameElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      cornerRadius: JSON
      layoutMode: String
      direction: String
      gap: JSON
      padding: JSON
      alignPrimary: String
      alignCounter: String
      clip: Boolean
    }

    type SlotElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      opacity: JSON
      blendMode: String
      fill: JSON
      stroke: JSON
      anchor: JSON
      alignSelf: String
      layoutMode: String
      direction: String
      gap: JSON
      padding: JSON
      alignPrimary: String
      alignCounter: String
      clip: Boolean
      blockId: ID!
      assignments: JSON
      expansion: JSON
    }

    input PositionInput {
      x: Float!
      y: Float!
    }

    input SuggestedImageDimensionsInput {
      width: Int!
      height: Int!
    }
    input SceneVariableInput {
      id: ID!
      name: String!
      rank: String
      type: TypeInput
      defaultValue: JSON
      suggestedDimensions: SuggestedImageDimensionsInput
    }

    input GraphNodeInput {
      id: ID!
      kind: String!
      name: String!
      parentId: ID
      defaultSceneId: ID
      color: String
      type: TypeInput
      position: PositionInput!
      variables: [SceneVariableInput!]
      """
      Device nodes only: whether each connection is its own instance.
      Defaults to false for a new Device. There is no pairingCode input:
      codes are minted server-side.
      """
      perConnection: Boolean
    }
    input GraphEdgeInput {
      id: ID!
      kind: String!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]
      targetPath: [String!]
      fieldMapping: JSON
      "Where the author has dragged this edge's runs, keyed by route shape (#475)."
      layout: JSON
      cueId: ID
      actionId: ID
    }
    input CueInput {
      id: ID!
      name: String!
      ownerKind: String!
      sceneId: ID
      blockId: ID
      actionIds: [ID!]!
    }
    input ActionInput {
      id: ID!
      cueId: ID!
      kind: String!
      targetSceneId: ID
    }
    input EventBindingInput {
      id: ID!
      canvasId: ID!
      elementId: ID!
      eventKind: String!
      params: JSON
      cueId: ID!
      position: Int!
    }

    type GraphEdit {
      type: String!
      nodeId: ID
      node: GraphNode
      edgeId: ID
      edge: GraphEdge
      position: Position
      parentId: ID
      "The Shape target for shape commands."
      shapeId: ID
      shape: Shape
      "The Shape Field target for shape commands."
      fieldId: ID
      field: ShapeField
      fieldType: Type
      defaultValue: JSON
      required: Boolean
      "The Show node editor colorway for graph.setNodeColor."
      color: String
      "The Source node Type, for graph.setSourceType."
      sourceType: Type
      "The graph-owned Source field path for graph.setSourceFieldDefault."
      fieldPath: [ID!]
      "The wiring edge's stable source-field to target-field mapping."
      fieldMapping: JSON
      "The edge layout, for graph.setEdgeLayout; null clears it."
      layout: JSON
      "The graph-owned Source field value; null clears the override."
      value: JSON
      "The Block target for Block lifecycle and variable commands."
      block: Block
      blockId: ID
      blockVariables: JSON
      "Interaction command payloads."
      cue: Cue
      action: Action
      binding: EventBinding
      "Event Binding key payloads: graph.setEventBindingKey."
      key: String
      cueId: ID
      actionId: ID
      bindingId: ID
      bindingIds: [ID!]
      actionIds: [ID!]
      targetSceneId: ID
      "Devices only: the code the server minted for a Device this batch created (#45)."
      pairingCode: String
      "Devices only: whether each connection is its own instance, for graph.setDevicePerConnection."
      perConnection: Boolean
    }
    """
    One serialisable Show edit. \`type\` selects a graph or Canvas command;
    Canvas commands additionally name the Canvas they target.
    """
    input ShowEditInput {
      type: String!
      canvasId: ID
      nodeId: ID
      node: GraphNodeInput
      edgeId: ID
      edge: GraphEdgeInput
      color: String
      "Block lifecycle and variable payloads are validated by the domain boundary."
      block: JSON
      blockId: ID
      blockVariables: JSON
      position: PositionInput
      parentId: ID
      name: String
      flowId: ID
      sceneId: ID
      variableId: ID
      variableIds: [ID!]
      variable: SceneVariableInput
      "Shape command target and materialised payloads."
      shapeId: ID
      shape: ShapeInput
      fieldId: ID
      field: ShapeFieldInput
      fieldType: TypeInput
      defaultValue: JSON
      required: Boolean
      "The Variable's Type, for graph.setSceneVariableType. Null clears it."
      shapes: [ShapeInput!]
      "The Variable's Type, for graph.setSceneVariableType. Null clears it."
      variableType: TypeInput
      "The Source node Type, for graph.setSourceType."
      sourceType: TypeInput
      "The Source field path, for graph.setSourceFieldDefault."
      fieldPath: [ID!]
      "The wiring edge's stable source-field to target-field mapping."
      fieldMapping: JSON
      "The edge layout, for graph.setEdgeLayout; null clears it."
      layout: JSON
      "The interaction payloads selected by type."
      cue: CueInput
      action: ActionInput
      binding: EventBindingInput
      "Event Binding key payloads: graph.setEventBindingKey."
      key: String
      cueId: ID
      actionId: ID
      bindingId: ID
      bindingIds: [ID!]
      actionIds: [ID!]
      targetSceneId: ID
      elementId: ID
      rank: String
      element: JSON
      properties: JSON
      unsetProperties: [String!]
      "Devices only: whether each connection is its own instance, for graph.setDevicePerConnection."
      perConnection: Boolean
    }

    type AppliedShowEdits {
      showId: ID!
      state: String!
      updatedAt: String!
      version: Int!
      amendments: [GraphEdit!]!
    }

    type ImageUploadConstraints {
      maxSourceBytes: Int!
      maxPixels: Int!
      maxAxis: Int!
      maxNormalizedBytes: Int!
      sessionTtlMs: Int!
      candidateTtlMs: Int!
    }

    type ImageUploadPlan {
      method: String!
      url: String!
      requiredHeaders: JSON!
    }

    type ImageUploadSession {
      id: ID!
      expiresAt: String!
      constraints: ImageUploadConstraints!
      plan: ImageUploadPlan!
    }

    type ImageUploadCandidate {
      sessionId: ID!
      digest: String!
      byteLength: Int!
      mimeType: String!
    }

    type ImageAsset {
      id: ID!
      revision: String!
      url: String!
      width: Int!
      height: Int!
      mimeType: String!
      name: String!
      alt: String!
      blurHash: String
    }

    type Query {
      "The signed-in user, or null if the request has no valid session."
      me: User
      """
      A public Device snapshot resolved by the pairing bearer credential.
      Invalid credentials return null.
      """
      playerSession: PlayerSession
      "The signed-in user's own Shows, most recently updated first."
      shows: [Show!]!
      "A single Show owned by the signed-in user, or null if it doesn't exist or isn't theirs."
      show(id: ID!): Show
      "The signed-in user's theme settings, or PRD.md §7 defaults if they haven't set any yet."
      userSettings: UserSettings!
      "The active Run for a Show, or null when the Show is stopped."
      activeRun(showId: ID!): Run
      showGraph(showId: ID!, state: String): ShowGraph!
      showCanvases(showId: ID!, state: String): [Artboard!]!
      imageAssets(showId: ID!): [ImageAsset!]!
    }

    type Mutation {
      createShow(name: String!): Show!
      renameShow(id: ID!, name: String!): Show!
      deleteShow(id: ID!): Boolean!
      updateUserSettings(themeMode: String, themePalette: String): UserSettings!
      applyShowEdits(showId: ID!, baseVersion: Int!, edits: [ShowEditInput!]!): AppliedShowEdits!
      publishShowGraph(showId: ID!): ShowGraph!
      endRun(showId: ID!): Run
      startRun(showId: ID!): Run!
      submitPlayerEvent(input: PlayerEventInput!): PlayerEventResult!
      beginImageUpload(showId: ID!, mimeType: String!, byteLength: Int!): ImageUploadSession!
      completeImageUpload(sessionId: ID!): ImageUploadCandidate!
      finalizeImageUpload(sessionId: ID!, name: String!): ImageAsset!
      renameImageAsset(showId: ID!, assetId: ID!, name: String!): ImageAsset!
      abortImageUpload(sessionId: ID!): Boolean!
      deleteImageAsset(showId: ID!, assetId: ID!): Boolean!
    }
  `,
  resolvers: {
    JSON: new GraphQLScalarType({
      name: "JSON",
      serialize: (value) => value,
      parseValue: (value) => value,
      parseLiteral: (node) => {
        if (node.kind === Kind.STRING) return node.value;
        if (node.kind === Kind.BOOLEAN) return node.value;
        if (node.kind === Kind.INT || node.kind === Kind.FLOAT) return Number(node.value);
        if (node.kind === Kind.NULL) return null;
        if (node.kind === Kind.LIST)
          return node.values.map((value) => (value.kind === Kind.STRING ? value.value : null));
        if (node.kind === Kind.OBJECT)
          return Object.fromEntries(node.fields.map((field) => [field.name.value, null]));
        return null;
      },
    }),
    GraphNode: {
      __resolveType: resolveGraphNodeType,
    },
    Element: {
      __resolveType: resolveCanvasElementType,
    },
    ImageValue: {
      assetId: (value: { value: { assetId: string } }) => value.value.assetId,
      url: async (value: { value: { assetId: string; revision: string } }) => {
        const asset = await db
          .select()
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
              eq(imageAssets.state, "active"),
            ),
          )
          .then(([row]) => row);
        if (!asset)
          throw new GraphQLError("Image asset not found.", { extensions: { code: "NOT_FOUND" } });
        return imageDeliveryUrl(asset.id, asset.revision);
      },
      width: async (value: { value: { assetId: string; revision: string } }) => {
        const [asset] = await db
          .select({ width: imageAssets.width })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
            ),
          );
        return asset?.width ?? 0;
      },
      height: async (value: { value: { assetId: string; revision: string } }) => {
        const [asset] = await db
          .select({ height: imageAssets.height })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
            ),
          );
        return asset?.height ?? 0;
      },
      alt: async (value: { value: { assetId: string; revision: string } }) => {
        const [asset] = await db
          .select({ alt: imageAssets.alt })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
            ),
          );
        return asset?.alt ?? "";
      },
      mimeType: async (value: { value: { assetId: string; revision: string } }) => {
        const [asset] = await db
          .select({ mimeType: imageAssets.mimeType })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
            ),
          );
        return asset?.mimeType ?? "application/octet-stream";
      },
      blurHash: async (value: { value: { assetId: string; revision: string } }) => {
        const [asset] = await db
          .select({ blurHash: imageAssets.blurHash })
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.id, value.value.assetId),
              eq(imageAssets.revision, value.value.revision),
            ),
          );
        return asset?.blurHash ?? null;
      },
    },
    GraphEdge: {
      __resolveType: resolveGraphEdgeType,
    },
    PlayerEventResult: {
      __resolveType: (result: { kind: string }) => {
        switch (result.kind) {
          case "applied":
            return "PlayerEventApplied";
          case "duplicate":
            return "PlayerEventDuplicate";
          case "ignored":
            return "PlayerEventIgnored";
          case "accepted":
            return "PlayerEventAccepted";
          case "rejected":
            return "PlayerEventRejected";
          default:
            return null;
        }
      },
    },
    Type: {
      kind: (type: string | { kind: "array" | "shape"; of?: unknown; shapeId?: string }) =>
        typeof type === "string" ? type : type.kind,
      of: (type: { kind: "array"; of: unknown }) => (type.kind === "array" ? type.of : null),
      shapeId: (type: { kind: "shape"; shapeId: string }) =>
        type.kind === "shape" ? type.shapeId : null,
    },
    ShapeValue: {
      __resolveType: (value: { kind: string }) =>
        `${value.kind[0]?.toUpperCase()}${value.kind.slice(1)}Value`,
    },
    ShapeField: {
      position: (field: { position?: number }) => field.position ?? 0,
      default: (field: { defaultValue?: unknown; type: unknown }) =>
        field.defaultValue === null || field.defaultValue === undefined
          ? null
          : toShapeValue(field.defaultValue, field.type),
    },
    Query: {
      me: (_parent, _args, context) => context.user,
      playerSession: async (_parent, _args, context) => {
        if (!context.playerPairingCode) return null;
        const session = await readPlayerSession(context.playerPairingCode);
        if (!session) return null;
        return {
          ...session,
          flow: session.flow
            ? {
                ...session.flow,
                scenes: session.flow.scenes.map(({ scene, canvas }) => ({
                  scene,
                  canvas: serializeCanvas(canvas),
                })),
              }
            : null,
          graph: serializeShowGraph(session.graph),
          canvas: session.canvas ? serializeCanvas(session.canvas) : null,
          blocks: session.blocks.map(serializeBlock),
        };
      },
      shows: async (_parent, _args, context) => {
        const userId = requireUserId(context);
        return db.select().from(shows).where(eq(shows.userId, userId)).orderBy(shows.updatedAt);
      },
      show: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        // Same reasoning as `findOwnShowOrThrow`: a malformed id is just a
        // miss, and this query already returns null for "not yours".
        if (!isId("show", id)) return null;
        const [show] = await db
          .select()
          .from(shows)
          .where(and(eq(shows.id, id), eq(shows.userId, userId)));
        return show ?? null;
      },
      activeRun: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const run = await readActiveRun(showId);
        return run ? serializeRun(run) : null;
      },
      userSettings: async (_parent, _args, context) => {
        const userId = requireUserId(context);
        const [settings] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId));
        if (!settings) {
          // No row yet — not an error, just "using PRD.md §7 defaults".
          // Deliberately not written here: a read shouldn't have a write
          // side effect, and updateUserSettings creates the row on first
          // actual change (see below).
          const defaults = defaultThemeSettings();
          return { themeMode: defaults.mode, themePalette: defaults.palette };
        }
        return settings;
      },
      showGraph: async (
        _parent,
        { showId, state }: { showId: string; state?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        // Ownership first: the graph is part of the Show, so it's readable
        // only to its owner.
        await findOwnShowOrThrow(showId, userId);
        const graphState = validGraphState(state ?? "draft");
        return serializeShowGraph(await readShowGraph(showId, graphState));
      },
      showCanvases: async (
        _parent,
        { showId, state }: { showId: string; state?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const workspace = await readCanvasWorkspace(showId, validGraphState(state ?? "draft"));
        return workspace.canvases.map(serializeArtboard);
      },
      imageAssets: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        return listImageAssets(showId);
      },
    },
    Mutation: {
      submitPlayerEvent: async (
        _parent: unknown,
        { input }: { input: PlayerEventInput },
        context: GraphQLContext,
      ) => {
        const pairingCode = requirePlayerPairingCode(context);
        try {
          const result = await dispatchPlayerEvent(pairingCode, input);
          if (!result) {
            throw new GraphQLError("Player is unavailable.", {
              extensions: { code: "UNAUTHENTICATED" },
            });
          }
          return result;
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          if (error instanceof PlayerEventInputError) {
            throw new GraphQLError(error.message, {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }
          if (error instanceof PlayerDispatchConfigurationError) {
            throw new GraphQLError("Unable to process the Player Event.", {
              extensions: { code: "INTERNAL_SERVER_ERROR" },
            });
          }
          throw error;
        }
      },
      applyShowEdits: async (
        _parent,
        { showId, baseVersion, edits }: { showId: string; baseVersion: number; edits: unknown[] },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const graphEdits: GraphEdit[] = [];
        const canvasEdits: CanvasWorkspaceEdit[] = [];
        try {
          for (const input of edits) {
            if (input === null || typeof input !== "object" || Array.isArray(input)) {
              throw new CanvasEditError("Show edit must be an object.");
            }
            const record = input as Record<string, unknown>;
            const type = record.type;
            if (typeof type !== "string") throw new CanvasEditError("Show edit type is required.");
            // Which vocabulary an edit belongs to is the codec's to say, not a
            // prefix test's: Canvas content and Artboard framing are separate
            // variants with separate prefixes (#436).
            if (isCanvasWorkspaceEditType(type)) {
              canvasEdits.push(decodeCanvasWorkspaceEdit(record as unknown as FlatCanvasEdit));
            } else {
              graphEdits.push(parseGraphEdit(record as unknown as FlatGraphEdit));
            }
          }
          const applied = await applyShowEditsToDb(showId, graphEdits, canvasEdits, baseVersion);
          await db.update(shows).set({ updatedAt: new Date() }).where(eq(shows.id, showId));
          return applied;
        } catch (error) {
          if (error instanceof GraphVersionConflictError) {
            throw new GraphQLError(error.message, { extensions: { code: "CONFLICT" } });
          }
          if (error instanceof InvalidInteractionError) {
            throw new GraphQLError(error.message, {
              extensions: { code: "BAD_USER_INPUT", reason: error.reason },
            });
          }
          if (error instanceof CanvasEditError || error instanceof CanvasEditCodecError) {
            throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
          }
          throw error;
        }
      },
      createShow: async (_parent, { name }: { name: string }, context) => {
        const userId = requireUserId(context);
        const validName = validShowName(name);
        // Ids are random, so the insert generates one per attempt and
        // retries if the primary key is already taken (../db/ids.ts).
        return withUniqueId("show", async (id) => {
          const [show] = await db.insert(shows).values({ id, name: validName, userId }).returning();
          return show;
        });
      },
      renameShow: async (_parent, { id, name }: { id: string; name: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        const validName = validShowName(name);
        const [updated] = await db
          .update(shows)
          .set({ name: validName, updatedAt: new Date() })
          .where(eq(shows.id, id))
          .returning();
        return updated;
      },
      deleteShow: async (_parent, { id }: { id: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(id, userId);
        await db.delete(shows).where(eq(shows.id, id));
        return true;
      },
      updateUserSettings: async (
        _parent,
        { themeMode, themePalette }: { themeMode?: string | null; themePalette?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        const defaults = defaultThemeSettings();
        const [existing] = await db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId));

        const nextThemeMode =
          themeMode != null ? validThemeMode(themeMode) : (existing?.themeMode ?? defaults.mode);
        const nextThemePalette =
          themePalette != null
            ? validThemePalette(themePalette)
            : (existing?.themePalette ?? defaults.palette);

        const [updated] = await db
          .insert(userSettings)
          .values({ userId, themeMode: nextThemeMode, themePalette: nextThemePalette })
          .onConflictDoUpdate({
            target: userSettings.userId,
            set: {
              themeMode: nextThemeMode,
              themePalette: nextThemePalette,
              updatedAt: new Date(),
            },
          })
          .returning();
        return updated;
      },
      startRun: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        return serializeRun(await startRun(showId));
      },
      endRun: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const run = await endRun(showId);
        return run ? serializeRun(run) : null;
      },
      publishShowGraph: async (_parent, { showId }: { showId: string }, context) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        return serializeShowGraph(await publishShowGraph(showId));
      },
      beginImageUpload: async (
        _parent,
        { showId, mimeType, byteLength }: { showId: string; mimeType: string; byteLength: number },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        if (!Number.isInteger(byteLength) || byteLength < 1) {
          throw new GraphQLError("byteLength must be a positive integer.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + DEFAULT_IMAGE_UPLOAD_POLICY.sessionTtlMs);
        const [session] = await db
          .insert(blobUploadSessions)
          .values({ id, userId, showId, expiresAt, declaredMimeType: mimeType, byteLength })
          .returning();
        if (!session) throw new GraphQLError("Upload session could not be created.");
        return imageUploadSession(session);
      },
      completeImageUpload: async (_parent, { sessionId }: { sessionId: string }, context) => {
        const userId = requireUserId(context);
        const [session] = await db
          .select()
          .from(blobUploadSessions)
          .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
        if (!session)
          throw new GraphQLError("Upload session not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        if (session.expiresAt <= new Date()) {
          throw new GraphQLError("Upload session expired.", {
            extensions: { code: "SESSION_EXPIRED" },
          });
        }
        try {
          const bytes = await blobStore.readUpload(sessionId);
          if (bytes.byteLength !== session.byteLength) {
            throw new ImageProcessingError(
              "INTEGRITY_MISMATCH",
              "Uploaded byte count does not match the declared length.",
            );
          }
          const processed = processImage(
            bytes,
            session.declaredMimeType ?? "application/octet-stream",
          );
          await db
            .update(blobUploadSessions)
            .set({ state: "candidate", candidateDigest: processed.digest })
            .where(eq(blobUploadSessions.id, sessionId));
          return {
            sessionId,
            digest: processed.digest,
            byteLength: processed.byteLength,
            mimeType: processed.mimeType,
          };
        } catch (error) {
          return imageUploadError(error);
        }
      },
      finalizeImageUpload: async (
        _parent,
        { sessionId, name }: { sessionId: string; name: string },
        context,
      ) => {
        const userId = requireUserId(context);
        const validName = validImageName(name);
        const [session] = await db
          .select()
          .from(blobUploadSessions)
          .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
        if (!session || !session.candidateDigest) {
          throw new GraphQLError("Upload candidate not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        try {
          const bytes = await blobStore.readUpload(sessionId);
          const processed = processImage(
            bytes,
            session.declaredMimeType ?? "application/octet-stream",
          );
          await commitBlob(processed);
          await blobStore.commitUpload(sessionId, processed);
          const [existing] = await db
            .select()
            .from(imageAssets)
            .where(
              and(
                eq(imageAssets.showId, session.showId),
                eq(imageAssets.blobDigest, session.candidateDigest),
              ),
            );
          if (existing) {
            await db
              .update(blobUploadSessions)
              .set({ state: "finalized" })
              .where(eq(blobUploadSessions.id, sessionId));
            return toImageAsset(existing);
          }
          const [asset] = await db
            .insert(imageAssets)
            .values({
              showId: session.showId,
              blobDigest: processed.digest,
              revision: processed.digest,
              width: processed.width,
              height: processed.height,
              mimeType: processed.mimeType,
              name: validName,
              alt: "",
              blurHash: processed.blurHash,
            })
            .returning();
          if (!asset) throw new GraphQLError("Image asset could not be created.");
          await db
            .update(blobUploadSessions)
            .set({ state: "finalized" })
            .where(eq(blobUploadSessions.id, sessionId));
          return toImageAsset(asset);
        } catch (error) {
          return imageUploadError(error);
        }
      },
      renameImageAsset: async (
        _parent,
        { showId, assetId, name }: { showId: string; assetId: string; name: string },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const [asset] = await db
          .update(imageAssets)
          .set({ name: validImageName(name), updatedAt: new Date() })
          .where(
            and(
              eq(imageAssets.showId, showId),
              eq(imageAssets.id, assetId),
              eq(imageAssets.state, "active"),
            ),
          )
          .returning();
        if (!asset) {
          throw new GraphQLError("Image asset not found.", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        return toImageAsset(asset);
      },
      abortImageUpload: async (_parent, { sessionId }: { sessionId: string }, context) => {
        const userId = requireUserId(context);
        await db
          .update(blobUploadSessions)
          .set({ state: "aborted" })
          .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
        await blobStore.deleteUpload(sessionId);
        return true;
      },
      deleteImageAsset: async (
        _parent,
        { showId, assetId }: { showId: string; assetId: string },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        await db
          .update(imageAssets)
          .set({ state: "deleted", deletedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(imageAssets.showId, showId), eq(imageAssets.id, assetId)));
        return true;
      },
    },
  },
});
