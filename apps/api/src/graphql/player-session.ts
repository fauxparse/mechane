// The Player/session slice: the public Device snapshot a Player reads by
// pairing bearer credential (./context.ts's `requirePlayerPairingCode`), and
// the Player Event submission path. Authorization is the credential itself —
// invalid credentials read as "no session", and an event the Show can't
// process comes back as one of the PlayerEventResult outcomes rather than
// an error, so a Player can tell a transport failure from a semantic one.
import { GraphQLError } from "graphql";

import { readPlayerSession } from "../player";
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
    type PlayerRealtime {
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
      "Resolved Instance values and Cue Parameters used by a per-connection Player."
      evidence: JSON
    }
    type PlayerEventApplied {
      eventId: ID!
      resultingSceneId: ID!
      changed: Boolean!
    }
    type PlayerEventDuplicate {
      eventId: ID!
      outcome: String!
      changed: Boolean!
      resultingSceneId: ID
      reason: String
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
      realtime: PlayerRealtime!
      run: Run
      graph: ShowGraph!
      flow: PlayerFlowBundle
      scene: SceneNode
      canvas: Canvas
      blocks: [Block!]!
      imageAssets: [ImageAsset!]!
    }

    type Query {
      """
      A public Device snapshot resolved by the pairing bearer credential.
      Invalid credentials return null.
      """
      playerSession: PlayerSession
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
