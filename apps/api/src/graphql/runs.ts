// The Runs slice: a Show's run lifecycle (start, read, end) and its Run
// Error log — the operator-facing record of what in a live Show could not
// be executed. Ownership is Show-scoped (`findOwnShowOrThrow`, ./show.ts):
// a Run and its errors name a Show's Devices and Scenes, so only its owner
// may read or drive them. Players authenticate with a pairing code and
// never reach these fields.
import type { Run } from "@mechane/domain/runs";
import type { RunError } from "@mechane/domain/run-errors";
import {
  describeRunError,
  isRunErrorCategory,
  type RunErrorCategory,
} from "@mechane/domain/run-errors";
import { GraphQLError } from "graphql";

import { listRunErrors } from "../db/run-errors";
import { endRun, readActiveRun, startRun } from "../db/runs";
import { readShowGraph } from "../db/show-graph";
import { reshuffleTransformer } from "../db/transformer-seeds";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow } from "./show";

function serializeRun(run: Run) {
  return {
    id: run.id,
    showId: run.showId,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    endedAt: run.endedAt?.toISOString() ?? null,
    stateSequence: run.stateSequence,
    sourceValues: run.sourceValues,
    structuredValues: run.structuredValues,
  };
}

function serializeRunError(error: RunError) {
  return {
    id: error.id,
    runId: error.runId,
    category: error.category,
    // Rendered here rather than stored, so the log carries only the category
    // and the identifiers it names — see @mechane/domain's `run-errors`.
    message: describeRunError(error),
    occurredAt: error.occurredAt.toISOString(),
    deviceId: error.deviceId ?? null,
    sceneId: error.sceneId ?? null,
    elementId: error.elementId ?? null,
    cueId: error.cueId ?? null,
    actionId: error.actionId ?? null,
    eventId: error.eventId ?? null,
    transformerId: error.transformerId ?? null,
    publishedGraphVersion: error.publishedGraphVersion ?? null,
  };
}

function validRunErrorCategory(value: string): RunErrorCategory {
  if (!isRunErrorCategory(value)) {
    throw new GraphQLError(`Unknown Run error category: "${value}".`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return value;
}

export const typeDefs = /* GraphQL */ `
  type Run {
    id: ID!
    showId: ID!
    status: String!
    startedAt: String!
    endedAt: String
    stateSequence: Int!
    sourceValues: JSON!
    structuredValues: JSON!
  }

  """
  One configuration failure a live Show hit, recorded for its operator.

  A Run Error is not an Event ledger entry and not crash telemetry: it names
  something in this Show that cannot be executed, in terms the person running
  the show can act on. \`category\` is the stable discriminator to filter and
  group by; \`message\` is that category rendered for a human. Identifiers are
  present when the category names them, and nothing else is recorded, so the
  log carries no request payloads or credentials.
  """
  type RunError {
    id: ID!
    "The Run underway when this happened, or null if none was."
    runId: ID
    category: String!
    message: String!
    occurredAt: String!
    deviceId: ID
    sceneId: ID
    elementId: ID
    cueId: ID
    actionId: ID
    eventId: ID
    transformerId: ID
    publishedGraphVersion: Int
  }

  type Query {
    "The active Run for a Show, or null when the Show is stopped."
    activeRun(showId: ID!): Run
    """
    A Show's Run error log, newest first. Covers failures from every Run and
    from before any Run started; \`runId\` narrows it to one Run and \`category\`
    to one kind of failure.
    """
    runErrors(showId: ID!, runId: ID, category: String, limit: Int): [RunError!]!
  }

  type Mutation {
    endRun(showId: ID!): Run
    startRun(showId: ID!): Run!
    reshuffleTransformer(showId: ID!, transformerId: ID!, deviceId: ID): Boolean!
  }
`;

export const resolvers: Resolvers = {
  Query: {
    activeRun: async (_parent, { showId }: { showId: string }, context) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const run = await readActiveRun(showId);
      return run ? serializeRun(run) : null;
    },
    runErrors: async (
      _parent,
      {
        showId,
        runId,
        category,
        limit,
      }: {
        showId: string;
        runId?: string | null;
        category?: string | null;
        limit?: number | null;
      },
      context,
    ) => {
      const userId = requireUserId(context);
      // Ownership first, like every other Show-scoped read: the log names a
      // Show's Devices and Scenes, so only its owner may read it. Players
      // authenticate with a pairing code and never reach this query.
      await findOwnShowOrThrow(showId, userId);
      const errors = await listRunErrors(showId, {
        runId: runId ?? undefined,
        category:
          category === null || category === undefined ? undefined : validRunErrorCategory(category),
        limit: limit ?? undefined,
      });
      return errors.map(serializeRunError);
    },
  },
  Mutation: {
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
    reshuffleTransformer: async (
      _parent,
      {
        showId,
        transformerId,
        deviceId,
      }: { showId: string; transformerId: string; deviceId?: string | null },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const [run, graph] = await Promise.all([
        readActiveRun(showId),
        readShowGraph(showId, "published"),
      ]);
      if (!run) throw new Error("Start the Run before reshuffling.");
      const transformer = graph.nodes.find(
        (node) => node.kind === "transformer" && node.id === transformerId,
      );
      if (!transformer || transformer.kind !== "transformer") {
        throw new Error("That Transformer is not in the published Show.");
      }
      if (transformer.transform.kind !== "shuffle") {
        throw new Error("Only a Shuffle Transformer can be reshuffled.");
      }
      let seedDeviceId: string | undefined;
      if (transformer.parentId !== null) {
        if (!deviceId) throw new Error("A shared-instance Shuffle requires a Device.");
        const device = graph.nodes.find(
          (node) => node.kind === "device" && node.id === deviceId && !node.perConnection,
        );
        if (!device) throw new Error("That shared Device is not in the published Show.");
        seedDeviceId = deviceId;
      }
      await reshuffleTransformer(run.id, transformerId, seedDeviceId);
      return true;
    },
  },
};
