import { decodeGraphEdit } from "@mechane/commands";
// Source value transfer client (#896–#900): the five owner-authorized
// GraphQL operations behind Show-editor value Copy/Paste, over a raw fetch
// to the API endpoint rather than a `@mechane/graphql-schema` document.
//
// The operations return GraphQL `JSON!`, so this module owns the boundary
// decoding: nothing from the response is modelled until zod has parsed it,
// per the portable-transfer contracts (#877). GraphQL-level errors and
// transport failures are kept distinct from domain rejections — a domain
// rejection arrives as data (`{kind: "rejected", diagnostic}`), while a
// lost response on a submitted mutation is an *unknown outcome* the caller
// resolves by exact lookup, never by retrying (issues #897–#899).
import {
  canonicalValue,
  type ValueHandoff,
  type ValueTarget,
  type ValueTransferDiagnostic,
} from "@mechane/domain/value-transfer";
import { z } from "zod";

import { API_BASE_URL } from "./client";

const DiagnosticSchema = z.object({
  category: z.enum(["browser-failure", "rejected-input", "commit-rejected", "outcome-unknown"]),
  stage: z.string(),
  code: z.string(),
  message: z.string(),
  path: z.array(z.string()),
  nextAction: z.string(),
});

const TargetFields = {
  showId: z.string().min(1),
  sourceId: z.string().min(1),
  fieldPath: z.array(z.string().min(1)),
};
const DefaultTargetSchema = z.strictObject({
  ...TargetFields,
  kind: z.literal("default"),
  draftVersion: z.number().int().nonnegative(),
});
const RunTargetFields = {
  ...TargetFields,
  runId: z.string().min(1),
  publishedVersion: z.number().int().nonnegative(),
};
export const ValueTargetSchema = z.discriminatedUnion("kind", [
  DefaultTargetSchema,
  z.strictObject({ ...RunTargetFields, kind: z.literal("current-show") }),
  z.strictObject({
    ...RunTargetFields,
    kind: z.literal("current-instance"),
    deviceId: z.string().min(1),
    flowId: z.string().min(1),
  }),
]);

const ContextSchema = z.object({
  showId: z.string(),
  showName: z.string(),
  activeRun: z.object({ runId: z.string(), publishedVersion: z.number() }).nullable(),
  instances: z.array(
    z.object({
      deviceId: z.string(),
      deviceName: z.string(),
      flowId: z.string(),
      instanceId: z.string(),
    }),
  ),
});

const ReadSchema = z.object({
  target: ValueTargetSchema,
  plainText: z.string().nullable(),
  typedText: z.string().nullable(),
  /** Incoming-wired Sources copy their evaluated value but cannot be pasted into. */
  copyOnly: z.boolean(),
  scopeLabel: z.string(),
  sourceLabel: z.string(),
});

const PreparedSchema = z.object({
  operationId: z.string(),
  target: ValueTargetSchema,
  oldValue: z.unknown(),
  replacementValue: z.unknown(),
  representation: z.enum(["typed", "plain"]),
  showName: z.string(),
  sourceLabel: z.string(),
  scopeLabel: z.string(),
  aliasEffects: z.string(),
  copyOnly: z.literal(false),
});

const OutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pending") }),
  z.object({
    kind: z.literal("committed"),
    receipt: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("default"),
        target: DefaultTargetSchema,
        version: z.number(),
        updatedAt: z.string(),
        published: z.object({ version: z.number(), updatedAt: z.string() }).nullable(),
        /** The internal edit union; the editor bridge decodes it before applying. */
        edits: z.array(z.unknown()),
        amendments: z.array(z.unknown()),
      }),
      z.object({
        kind: z.literal("current"),
        target: ValueTargetSchema,
        stateSequence: z.number(),
      }),
    ]),
  }),
  z.object({ kind: z.literal("rejected"), diagnostic: DiagnosticSchema }),
]);

/** The Run/Instance facts a Current target is chosen from (#899, #900). */
export type SourceValueContext = z.infer<typeof ContextSchema>;

/** One coherent authorized read of an explicit target (#897–#900). */
export type SourceValueRead = z.infer<typeof ReadSchema>;

/** A server-persisted immutable preparation, bound to one explicit request. */
export type PreparedSourceValue = z.infer<typeof PreparedSchema>;

/** The authoritative result of one submitted operation, by exact identity. */
export type ValueOperationOutcome = z.infer<typeof OutcomeSchema>;

/** The authored-draft receipt of a committed Default replacement. */
export type DefaultValueReceipt = Extract<
  Extract<ValueOperationOutcome, { kind: "committed" }>["receipt"],
  { kind: "default" }
>;

/**
 * A request that never produced domain data: either the API answered with a
 * GraphQL error, or the response was lost. `lostResponse` marks the cases
 * where a submitted mutation may still have committed — the caller pins the
 * target and resolves by exact outcome lookup, never by resubmitting.
 */
export class ValueTransferRequestError extends Error {
  readonly lostResponse: boolean;
  readonly diagnostic: ValueTransferDiagnostic | null;

  constructor(
    message: string,
    lostResponse: boolean,
    diagnostic: ValueTransferDiagnostic | null = null,
  ) {
    super(message);
    this.name = "ValueTransferRequestError";
    this.lostResponse = lostResponse;
    this.diagnostic = diagnostic;
  }
}

const ResponseSchema = z.object({
  data: z.object({ result: z.unknown() }).nullish(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ diagnostic: DiagnosticSchema.optional() }).optional(),
      }),
    )
    .optional(),
});

async function valueTransferRequest<T>(
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/graphql`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch (reason: unknown) {
    throw new ValueTransferRequestError(
      reason instanceof Error ? reason.message : "Value transfer request failed.",
      false,
    );
  }
  if (!response.ok) {
    throw new ValueTransferRequestError(
      `Value transfer request failed with status ${response.status}.`,
      false,
    );
  }
  const body = ResponseSchema.parse(await response.json());
  if (body.errors && body.errors.length > 0) {
    throw new ValueTransferRequestError(
      body.errors[0]?.message ?? "Value transfer request failed.",
      false,
      body.errors[0]?.extensions?.diagnostic ?? null,
    );
  }
  const result = body.data?.result;
  if (result === undefined) {
    throw new ValueTransferRequestError("Value transfer response had no result.", false);
  }
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    throw new ValueTransferRequestError(
      "Value transfer response did not match the accepted contract.",
      false,
    );
  }
  return parsed.data;
}

const CONTEXT_QUERY = /* GraphQL */ `
  query SourceValueContext($showId: ID!, $sourceId: ID!) {
    result: sourceValueContext(showId: $showId, sourceId: $sourceId)
  }
`;

const READ_QUERY = /* GraphQL */ `
  query SourceValueRead($target: JSON!) {
    result: sourceValueRead(target: $target)
  }
`;

const PREPARE_MUTATION = /* GraphQL */ `
  mutation PrepareSourceValue($target: JSON!, $handoff: JSON!) {
    result: prepareSourceValue(target: $target, handoff: $handoff)
  }
`;

const COMMIT_MUTATION = /* GraphQL */ `
  mutation CommitSourceValue($operationId: ID!) {
    result: commitSourceValue(operationId: $operationId)
  }
`;

const OUTCOME_QUERY = /* GraphQL */ `
  query SourceValueOutcome($showId: ID!, $operationId: ID!) {
    result: sourceValueOutcome(showId: $showId, operationId: $operationId)
  }
`;

/**
 * Reads the Run/Shared-Instance facts an explicit Current target needs.
 * Never connects to a browser; only configured Shared eligible state.
 */
export function fetchSourceValueContext(showId: string, sourceId: string) {
  return valueTransferRequest(CONTEXT_QUERY, { showId, sourceId }, ContextSchema);
}

/** One coherent read of an explicit Default or Current target. */
export function readSourceValue(target: ValueTarget) {
  return valueTransferRequest(READ_QUERY, { target }, ReadSchema);
}

/**
 * Binds one explicit replacement request server-side. A lost response is not
 * a rejection — but nothing has been submitted either, so the caller may
 * prepare again from a fresh explicit gesture.
 */
export function prepareSourceValue(target: ValueTarget, handoff: ValueHandoff) {
  return valueTransferRequest(
    PREPARE_MUTATION,
    { target, handoff: [...handoff] },
    PreparedSchema,
  ).then((prepared) => {
    if (canonicalValue(prepared.target) !== canonicalValue(target))
      throw new ValueTransferRequestError(
        "The preparation did not match the captured target.",
        false,
      );
    return prepared;
  });
}

/**
 * Commits by operation identity only. A GraphQL error or lost response here
 * may have committed: the caller pins the target and resolves by exact
 * lookup, so this call flags every failure as possibly-submitted.
 */
export async function commitSourceValue(operationId: string): Promise<ValueOperationOutcome> {
  return flagLostResponse(valueTransferRequest(COMMIT_MUTATION, { operationId }, OutcomeSchema));
}

/** The exact-result lookup for a submitted operation; never reapplies. */
export async function lookupSourceValueOutcome(
  showId: string,
  operationId: string,
): Promise<ValueOperationOutcome> {
  return flagLostResponse(
    valueTransferRequest(OUTCOME_QUERY, { showId, operationId }, OutcomeSchema),
  );
}

async function flagLostResponse(
  outcome: Promise<ValueOperationOutcome>,
): Promise<ValueOperationOutcome> {
  try {
    return await outcome;
  } catch (reason) {
    const message =
      reason instanceof ValueTransferRequestError
        ? reason.message
        : "The submitted value operation's result could not be read.";
    throw new ValueTransferRequestError(message, true);
  }
}

const ReceiptEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("graph.replaceSourceDefaults"), value: z.unknown() }),
  z.object({
    type: z.literal("graph.setDevicePairingCode"),
    nodeId: z.string(),
    pairingCode: z.string().nullable(),
  }),
]);

export function committedDefaultEdits(receipt: DefaultValueReceipt) {
  return {
    edits: receipt.edits.map((edit) => decodeGraphEdit(ReceiptEditSchema.parse(edit))),
    amendments: receipt.amendments.map((edit) => decodeGraphEdit(ReceiptEditSchema.parse(edit))),
  };
}
