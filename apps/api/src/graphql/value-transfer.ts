// The Source value clipboard slice (#897–#900): context, coherent reads, and
// the prepare/commit/lookup operation protocol, all owner-authorized through
// the Show ownership every other Show-scoped slice uses.
//
// This layer stays a thin adapter: it decodes the two JSON boundaries
// strictly (the pinned target and the received handoff), authenticates, and
// calls the db module. Domain refusals arrive as ValueTransferError and leave
// as GraphQL errors carrying the diagnostic, so a client can render the
// category, reason and next action instead of a string.
import { ValueTransferError } from "@mechane/domain/value-transfer";
import { GraphQLError } from "graphql";

import {
  commitSourceValue,
  decodeValueHandoffInput,
  decodeValueTargetInput,
  lookupSourceValue,
  prepareSourceValue,
  readSourceValue,
  readSourceValueContext,
} from "../db/value-transfer";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow } from "./show";

function mapValueTransfer(error: unknown): unknown {
  if (error instanceof ValueTransferError) {
    return new GraphQLError(error.message, {
      extensions: { code: "VALUE_TRANSFER_REJECTED", diagnostic: error.diagnostic },
    });
  }
  return error;
}

export const typeDefs = /* GraphQL */ `
  type Query {
    """
    The explicit selection facts for one Source: the Show's name, the exact
    active Run and its published version, and the configured Shared Device
    Instances that already hold state for the Source's Flow. No connection is
    required or consulted, and nothing is initialized.
    """
    sourceValueContext(showId: ID!, sourceId: ID!): JSON!
    """
    One coherent, owner-authorized read of the selected Default or Current
    value: the version-1 typed envelope, its plain expansion, both copy texts,
    and whether the Source is copy-only because it is fed by incoming wiring.
    """
    sourceValueRead(target: JSON!): JSON!
    """
    The authoritative outcome of one value operation: \`pending\` (including
    when nothing definitive is observable), \`committed\` with its receipt, or
    \`rejected\` with its diagnostic.
    """
    sourceValueOutcome(showId: ID!, operationId: ID!): JSON!
  }

  type Mutation {
    """
    Pins one explicit destination to one received handoff and stores the
    binding as a durable operation. Returns the operation id with the old and
    replacement values, labels and alias effects for confirmation. Mutates
    nothing.
    """
    prepareSourceValue(target: JSON!, handoff: JSON!): JSON!
    """
    Applies exactly the prepared operation the server-issued id binds, and
    returns its outcome. A repeated identity returns the stored outcome
    without reapplying; it never accepts an alternative request or target.
    """
    commitSourceValue(operationId: ID!): JSON!
  }
`;

export const resolvers: Resolvers = {
  Query: {
    sourceValueContext: async (
      _parent,
      { showId, sourceId }: { showId: string; sourceId: string },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      return readSourceValueContext(userId, showId, sourceId);
    },
    sourceValueRead: async (_parent, { target }: { target: unknown }, context) => {
      const userId = requireUserId(context);
      try {
        return await readSourceValue(userId, decodeValueTargetInput(target));
      } catch (error) {
        throw mapValueTransfer(error);
      }
    },
    sourceValueOutcome: async (
      _parent,
      { showId, operationId }: { showId: string; operationId: string },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      try {
        return await lookupSourceValue(userId, showId, operationId);
      } catch (error) {
        throw mapValueTransfer(error);
      }
    },
  },
  Mutation: {
    prepareSourceValue: async (
      _parent,
      { target, handoff }: { target: unknown; handoff: unknown },
      context,
    ) => {
      const userId = requireUserId(context);
      try {
        return await prepareSourceValue(
          userId,
          decodeValueTargetInput(target),
          decodeValueHandoffInput(handoff),
        );
      } catch (error) {
        throw mapValueTransfer(error);
      }
    },
    commitSourceValue: async (_parent, { operationId }: { operationId: string }, context) => {
      const userId = requireUserId(context);
      try {
        return await commitSourceValue(userId, operationId);
      } catch (error) {
        throw mapValueTransfer(error);
      }
    },
  },
};
