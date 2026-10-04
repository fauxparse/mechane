// The Player/session slice: the public Device snapshot a Player reads by
// pairing bearer credential (./context.ts's `requirePlayerPairingCode`), and
// the Player Event submission path. Authorization is the credential itself —
// invalid credentials read as "no session", and an event the Show can't
// process comes back as one of the PlayerEventResult outcomes rather than
// an error, so a Player can tell a transport failure from a semantic one.
import { GraphQLError } from "graphql";

import { readPlayerRealtimeGrant, readPlayerRunState, readPlayerSession } from "../player";
import {
  dispatchPlayerEvent,
  PlayerEventInputError,
  type PlayerEventInput,
} from "../db/player-events";
import { RunConfigurationError } from "../db/run-errors";
import { serializeCanvas } from "./canvas";
import type { GraphQLContext, Resolvers } from "./context";
import { requirePlayerPairingCode } from "./context";
import { serializeBlock, serializeGraphNode, serializeShowGraph } from "./show-graph";

export const typeDefs = /* GraphQL */ `
  type PlayerDevice {
    name: String!
    perConnection: Boolean!
  }
  "A short-lived grant to subscribe to one realtime channel."
  type RealtimeGrant {
    channel: String!
    grant: String!
    expiresAt: String!
  }

  input BlockInstancePathInput {
    slotElementId: ID!
    index: Int!
  }
  input PlayerEventInput {
    eventId: ID!
    publishedGraphVersion: Int!
    sceneId: ID!
    elementId: ID!
    eventKind: String!
    slotInstancePath: [BlockInstancePathInput!]
    "Per-kind payload as observed; a keypress carries { key }."
    params: JSON
    "Per-connection evidence: one entry per Show Action, keyed by Action id, holding the Instance values and Cue Parameters as they stood when that Action ran."
    evidence: JSON
  }
  type PlayerEventApplied {
    eventId: ID!
    resultingSceneId: ID!
    changed: Boolean!
    "The Show's state sequence once this Event committed; a snapshot at or past it holds the Event's effect."
    stateSequence: Int!
  }
  type PlayerEventDuplicate {
    eventId: ID!
    outcome: String!
    changed: Boolean!
    resultingSceneId: ID
    reason: String
    "The original result's state sequence; null unless it was applied or accepted."
    stateSequence: Int
  }
  type PlayerEventIgnored {
    eventId: ID!
    reason: String!
  }
  type PlayerEventFailed {
    eventId: ID!
    actionId: ID!
    reason: String!
  }
  type PlayerEventAccepted {
    eventId: ID!
    "The Show's state sequence once this Event committed; a snapshot at or past it holds the Event's effect."
    stateSequence: Int!
  }
  type PlayerEventRejected {
    eventId: ID!
    reason: String!
  }
  union PlayerEventResult =
    | PlayerEventApplied
    | PlayerEventDuplicate
    | PlayerEventIgnored
    | PlayerEventFailed
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
    transformers: [TransformerNode!]!
  }
  type PlayerSession {
    device: PlayerDevice!
    realtime: RealtimeGrant!
    """
    Opaque. Changes whenever anything in this session other than the Run's
    values changes, so a Player can tell whether \`playerRunState\` is enough.
    """
    sessionKey: String!
    run: Run
    graph: ShowGraph!
    flow: PlayerFlowBundle
    scene: SceneNode
    canvas: Canvas
    blocks: [Block!]!
    imageAssets: [ImageAsset!]!
  }

  "The part of a Player session that changes when Show state does."
  type PlayerRunState {
    "Equal to the session's \`sessionKey\` while the rest of the session still holds."
    sessionKey: String!
    stateSequence: Int!
    sourceValues: JSON!
    structuredValues: JSON!
  }

  type Query {
    """
    A public Device snapshot resolved by the pairing bearer credential.
    Invalid credentials return null. \`connecting\` marks the read a Player
    makes as it connects, as opposed to a refresh; a Device connecting to a
    Show with no Run asks the Show's Studio windows to start it.
    """
    playerSession(connecting: Boolean): PlayerSession
    """
    The Run values for the Device the pairing bearer credential names, read
    without the rest of its session. Null when the credential is invalid or
    no Run is active; a Player reads its whole session to find out which.
    """
    playerRunState: PlayerRunState
    """
    A fresh realtime grant for the Device the pairing bearer credential
    names, without the rest of its session. Null when the credential is invalid.
    """
    playerRealtimeGrant: RealtimeGrant
  }

  type Mutation {
    submitPlayerEvent(input: PlayerEventInput!): PlayerEventResult!
  }
`;

export const resolvers: Resolvers = {
  PlayerEventResult: {
    __resolveType: (result: { kind: string }) => {
      switch (result.kind) {
        case "applied":
          return "PlayerEventApplied";
        case "duplicate":
          return "PlayerEventDuplicate";
        case "ignored":
          return "PlayerEventIgnored";
        case "failed":
          return "PlayerEventFailed";
        case "accepted":
          return "PlayerEventAccepted";
        case "rejected":
          return "PlayerEventRejected";
        default:
          return null;
      }
    },
  },
  Query: {
    playerSession: async (_parent, { connecting }: { connecting?: boolean | null }, context) => {
      if (!context.playerPairingCode) return null;
      const session = await readPlayerSession(context.playerPairingCode, {
        connecting: connecting ?? false,
      });
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
              transformers: session.flow.transformers.map((node) =>
                serializeGraphNode(node, session.graph),
              ),
            }
          : null,
        graph: serializeShowGraph(session.graph),
        canvas: session.canvas ? serializeCanvas(session.canvas) : null,
        blocks: session.blocks.map(serializeBlock),
      };
    },
    playerRunState: async (_parent, _args, context) =>
      context.playerPairingCode ? readPlayerRunState(context.playerPairingCode) : null,
    playerRealtimeGrant: async (_parent, _args, context) =>
      context.playerPairingCode ? readPlayerRealtimeGrant(context.playerPairingCode) : null,
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
        if (error instanceof RunConfigurationError) {
          throw new GraphQLError("Unable to process the Player Event.", {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }
        throw error;
      }
    },
  },
};
