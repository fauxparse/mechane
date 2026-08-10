// GraphQL schema. `me` proves a signed-in user is resolvable in the
// resolver layer; the Show query/mutations (issue #3) are the first real
// owned-resource vertical slice, using `requireUserId` (./context.ts) and
// `assertOwnedBy`/`assertValidShowName` (@mechane/domain) the same way
// every later owned resource (Scene, Device, ...) should.
import { CanvasEditError } from "@mechane/commands";
import type { CanvasEdit, GraphEdit } from "@mechane/commands";
import {
  assertOwnedBy,
  assertValidGraphState,
  assertValidShowName,
  assertValidThemeMode,
  assertValidThemePalette,
  defaultThemeSettings,
  InvalidGraphStateError,
  InvalidShowNameError,
  isId,
  InvalidThemeModeError,
  InvalidThemePaletteError,
} from "@mechane/domain";
import type { GraphState } from "@mechane/domain";
import { and, eq } from "drizzle-orm";
import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import { createSchema } from "graphql-yoga";

import { db } from "../db/client";
import { readCanvas, readCanvasWorkspace } from "../db/canvas";
import { withUniqueId } from "../db/ids";
import { endRun, readActiveRun, startRun } from "../db/runs";
import { shows, userSettings } from "../db/schema";
import {
  applyShowEdits as applyShowEditsToDb,
  GraphVersionConflictError,
  publishShowGraph,
  readShowGraph,
} from "../db/show-graph";
import { requireUserId } from "./context";
import type { GraphQLContext } from "./context";
import {
  parseGraphEdit,
  resolveGraphEdgeType,
  resolveGraphNodeType,
  serializeShowGraph,
} from "./show-graph";
import { parseCanvasEdit, resolveCanvasElementType, serializeCanvas } from "./canvas";
import type { GraphEditInput } from "./show-graph";

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

    "The signed-in user's design-system preference (PRD.md §7)."
    type UserSettings {
      "Display mode: \\"light\\" or \\"dark\\"."
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
      type: Type
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
      value: String!
    }
    type ColourValue {
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
      | ColourValue
      | DateValue
      | DateTimeValue
      | ObjectValue
      | ArrayValue

    input ShapeValueInput @oneOf {
      text: String
      number: Float
      boolean: Boolean
      image: String
      colour: String
      date: String
      datetime: String
      object: JSON
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

    type Shape {
      id: ID!
      name: String!
      fields: [ShapeField!]!
    }

    type SourceFieldDefault {
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
    }

    type SceneNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      "The Variables wiring edges can target."
      variables: [SceneVariable!]!
    }

    type FlowNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      "The Flow's design-time entry Scene, if one is set."
      defaultSceneId: ID
    }

    type SourceNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      type: Type!
      "Sparse default overrides for Source fields, keyed by stable field ids."
      fieldDefaults: [SourceFieldDefault!]!
    }

    type TransformerNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
      type: Type
    }

    type DeviceNode implements GraphNode {
      id: ID!
      name: String!
      parentId: ID
      position: Position!
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
    }

    type WiringEdge implements GraphEdge {
      id: ID!
      sourceId: ID!
      targetId: ID!
      sourcePath: [String!]!
      targetPath: [String!]!
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
      "Either \\"draft\\" or \\"published\\"."
      state: String!
      nodes: [GraphNode!]!
      edges: [GraphEdge!]!
      shapes: [Shape!]!
      updatedAt: String!
      """
      How many times this graph has been written. An edit batch names the
      version it was composed against, and is refused if that isn't the
      version stored — see \`applyShowGraphEdits\`.
      """
      version: Int!
      "Fields that lost data while this graph was published."
      losses: [PublishLoss!]!
    }
    """
    A persisted Scene or Block Canvas. Element is an interface so clients can
    select the primitive-specific content without a nullable field bag.
    """
    type Canvas {
      id: ID!
      kind: String!
      position: Position!
      ownerId: ID!
      ownerName: String!
      root: Element!
    }

    interface Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      width: JSON
      height: JSON
      minWidth: JSON
      maxWidth: JSON
      minHeight: JSON
      maxHeight: JSON
      rotation: Int
      opacity: Float
      blendMode: String
      fill: JSON
      anchor: JSON
      children: [Element!]!
    }

    type RectElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      width: JSON
      height: JSON
      minWidth: JSON
      maxWidth: JSON
      minHeight: JSON
      maxHeight: JSON
      rotation: Int
      opacity: Float
      blendMode: String
      fill: JSON
      anchor: JSON
      children: [Element!]!
      cornerRadius: Float
    }

    type TextElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      width: JSON
      height: JSON
      minWidth: JSON
      maxWidth: JSON
      minHeight: JSON
      maxHeight: JSON
      rotation: Int
      opacity: Float
      blendMode: String
      fill: JSON
      anchor: JSON
      children: [Element!]!
      content: String
      text: String
      color: String
      fontFamily: String
      fontSize: Float
      fontWeight: String
      lineHeight: JSON
      letterSpacing: Float
      textAlign: String
    }

    type ImageElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      width: JSON
      height: JSON
      minWidth: JSON
      maxWidth: JSON
      minHeight: JSON
      maxHeight: JSON
      rotation: Int
      opacity: Float
      blendMode: String
      fill: JSON
      anchor: JSON
      children: [Element!]!
      src: String
      image: String
      source: String
      alt: String
      objectFit: String
    }

    type FrameElement implements Element {
      id: ID!
      name: String
      parentId: ID
      rank: String!
      hidden: Boolean!
      layout: JSON
      sizing: JSON
      width: JSON
      height: JSON
      minWidth: JSON
      maxWidth: JSON
      minHeight: JSON
      maxHeight: JSON
      rotation: Int
      opacity: Float
      blendMode: String
      fill: JSON
      anchor: JSON
      children: [Element!]!
      layoutMode: String
      mode: String
      autoLayout: Boolean
      direction: String
      gap: Float
      padding: JSON
      alignPrimary: String
      alignCounter: String
      primaryAlign: String
      counterAlign: String
      clip: Boolean
    }

    input PositionInput {
      x: Float!
      y: Float!
    }

    input SceneVariableInput {
      id: ID!
      name: String!
      type: TypeInput
    }

    input GraphNodeInput {
      id: ID!
      kind: String!
      name: String!
      parentId: ID
      defaultSceneId: ID
      type: TypeInput
      position: PositionInput!
      variables: [SceneVariableInput!]
      """
      Device nodes only: whether each connection is its own instance.
      Defaults to false, and is only read when the Device is new — it is
      fixed at creation, so a later change is ignored rather than obeyed.
      There is no pairingCode input: codes are minted server-side.
      """
      perConnection: Boolean
    }

    input GraphEdgeInput {
      id: ID!
      kind: String!
      sourceId: ID!
      targetId: ID!
      "Defaults to the empty path (the whole value)."
      sourcePath: [String!]
      "Wiring edges must give at least the Scene Variable's id. Defaults to empty."
      targetPath: [String!]
      fieldMapping: JSON
      cueId: ID
      actionId: ID
    }

    """
    One edit on its way out (issue #111): the same shape as
    \`GraphEditInput\`, plus \`pairingCode\`, which only ever travels in this
    direction. What the server tells a client about a change it didn't make
    is the same vocabulary a realtime channel will use for a change someone
    else made (ADR-0003).
    """
    type GraphEdit {
      type: String!
      nodeId: ID
      node: GraphNode
      edgeId: ID
      edge: GraphEdge
      position: Position
      parentId: ID
      name: String
      flowId: ID
      sceneId: ID
      variableId: ID
      variable: SceneVariable
      "Devices only: the code the server minted for a Device this batch created (#45)."
      pairingCode: String
    }

    """
    One edit to a Show's graph (issue #103) — the unit the editor produces
    and the server applies, in place of a whole-graph replacement.

    \`type\` is the command that made it: "graph.addNode", "graph.removeNode",
    "graph.moveNode", "graph.renameNode", "graph.reparentNode",
    "graph.addEdge", "graph.removeEdge", "graph.setFlowDefaultScene",
    "graph.addSceneVariable", "graph.renameSceneVariable", or
    "graph.removeSceneVariable".

    Every other field is optional because GraphQL has no input unions:
    \`type\` decides which of them are read, and an edit missing one its type
    needs is rejected. Undoing an edit is an ordinary edit here, not a
    direction of travel the server knows about (ADR-0005).
    """
    input GraphEditInput {
      type: String!
      "The node an edit acts on: remove, move, rename, reparent."
      nodeId: ID
      "The whole node, for graph.addNode — including a restored one."
      node: GraphNodeInput
      edgeId: ID
      edge: GraphEdgeInput
      "Where a moved or reparented node lands. Flow-local coordinates when it has a parent."
      position: PositionInput
      "The Flow a node is being placed in, or null for Show level."
      parentId: ID
      "The new name, for a rename."
      name: String
      flowId: ID
      "The Flow's entry Scene, or the Scene owning a Variable. Null clears a Flow's default."
      sceneId: ID
      variableId: ID
      variable: SceneVariableInput
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
      position: PositionInput
      parentId: ID
      name: String
      flowId: ID
      sceneId: ID
      variableId: ID
      variable: SceneVariableInput
      elementId: ID
      rank: String
      element: JSON
      properties: JSON
      unsetProperties: [String!]
    }

    type AppliedShowEdits {
      showId: ID!
      state: String!
      updatedAt: String!
      version: Int!
      canvas: Canvas
      amendments: [GraphEdit!]!
    }

    type Query {
      "The signed-in user, or null if the request has no valid session."
      me: User
      "The signed-in user's own Shows, most recently updated first."
      shows: [Show!]!
      "A single Show owned by the signed-in user, or null if it doesn't exist or isn't theirs."
      show(id: ID!): Show
      "The signed-in user's theme settings, or PRD.md §7 defaults if they haven't set any yet."
      userSettings: UserSettings!
      "The active Run for a Show, or null when the Show is stopped."
      activeRun(showId: ID!): Run
      """
      A Show's graph in the given state (default "draft"). A Show that has
      never been edited or published reads as an empty graph — a Show with
      no Flows at all is valid (issue #25).
      """
      showGraph(showId: ID!, state: String): ShowGraph!
      "All persisted Scene and Block Canvases in one Show workspace."
      showCanvases(showId: ID!, state: String): [Canvas!]!
      "The Canvas owned by a Scene node, or null before it is created."
      sceneCanvas(showId: ID!, sceneNodeId: ID!, state: String): Canvas
      "The Canvas owned by a Block definition, or null before it is created."
      blockCanvas(showId: ID!, blockId: ID!, state: String): Canvas
    }

    type Mutation {
      "Creates a new Show owned by the signed-in user."
      createShow(name: String!): Show!
      "Renames a Show owned by the signed-in user."
      renameShow(id: ID!, name: String!): Show!
      "Deletes a Show owned by the signed-in user. Returns true on success."
      deleteShow(id: ID!): Boolean!
      "Updates the signed-in user's theme settings. Omitted fields are left unchanged."
      updateUserSettings(themeMode: String, themePalette: String): UserSettings!
      "Applies graph and Canvas edits against one shared draft Show version."
      applyShowEdits(showId: ID!, baseVersion: Int!, edits: [ShowEditInput!]!): AppliedShowEdits!
      "Publishes a Show's draft graph, making it the published graph immediately (ADR-0002)."
      publishShowGraph(showId: ID!): ShowGraph!
      "Ends the active Run, if one exists."
      endRun(showId: ID!): Run
      "Ends the previous Run and starts a new one with reset Source values."
      startRun(showId: ID!): Run!
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
    GraphEdge: {
      __resolveType: resolveGraphEdgeType,
    },
    Type: {
      kind: (type: string | { kind: "array"; of: unknown } | { kind: "shape"; shapeId: string }) =>
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
        return (await readCanvasWorkspace(showId, validGraphState(state ?? "draft"))).canvases;
      },
      sceneCanvas: async (
        _parent,
        {
          showId,
          sceneNodeId,
          state,
        }: { showId: string; sceneNodeId: string; state?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const graphState = validGraphState(state ?? "draft");
        const canvas = await readCanvas(showId, graphState, { sceneNodeId });
        return canvas ? serializeCanvas(canvas) : null;
      },
      blockCanvas: async (
        _parent,
        { showId, blockId, state }: { showId: string; blockId: string; state?: string | null },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const graphState = validGraphState(state ?? "draft");
        const canvas = await readCanvas(showId, graphState, { blockId });
        return canvas ? serializeCanvas(canvas) : null;
      },
    },
    Mutation: {
      applyShowEdits: async (
        _parent,
        { showId, baseVersion, edits }: { showId: string; baseVersion: number; edits: unknown[] },
        context,
      ) => {
        const userId = requireUserId(context);
        await findOwnShowOrThrow(showId, userId);
        const graphEdits: GraphEdit[] = [];
        const canvasEdits: CanvasEdit[] = [];
        let canvasId: string | undefined;
        try {
          for (const input of edits) {
            if (input === null || typeof input !== "object" || Array.isArray(input)) {
              throw new CanvasEditError("Show edit must be an object.");
            }
            const record = input as Record<string, unknown>;
            const type = record.type;
            if (typeof type !== "string") throw new CanvasEditError("Show edit type is required.");
            if (type.startsWith("canvas.")) {
              const target = record.canvasId;
              if (typeof target !== "string" || target.length === 0) {
                throw new CanvasEditError("Canvas edits require canvasId.");
              }
              if (canvasId && canvasId !== target) {
                throw new CanvasEditError("One Show edit batch may target only one Canvas.");
              }
              canvasId = target;
              canvasEdits.push(parseCanvasEdit(record));
            } else {
              graphEdits.push(parseGraphEdit(record as unknown as GraphEditInput));
            }
          }
          const applied = await applyShowEditsToDb(
            showId,
            graphEdits,
            canvasEdits,
            canvasId,
            baseVersion,
          );
          await db.update(shows).set({ updatedAt: new Date() }).where(eq(shows.id, showId));
          return applied;
        } catch (error) {
          if (error instanceof GraphVersionConflictError) {
            throw new GraphQLError(error.message, { extensions: { code: "CONFLICT" } });
          }
          if (error instanceof CanvasEditError) {
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
    },
  },
});
