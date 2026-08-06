// Minimal fetch-based GraphQL client. `graphqlRequest` is generic over
// gql.tada's `TadaDocumentNode` (issue #15) rather than a raw string, so
// callers get `TResult`/`TVariables` inferred straight from the typed
// document they pass in — no more separately-specified, hand-kept-in-sync
// generics. The transport itself is unchanged: still a plain
// `fetch`/`credentials: "include"` POST, still throwing `GraphQLRequestError`
// on a GraphQL-level error and a plain `Error` on a transport-level failure.
import { print } from "graphql";
import type { TadaDocumentNode } from "gql.tada";

export interface GraphQLResponseError {
  message: string;
  extensions?: { code?: string };
}

export class GraphQLRequestError extends Error {
  readonly errors: GraphQLResponseError[];
  readonly code: string | undefined;

  constructor(errors: GraphQLResponseError[]) {
    super(errors[0]?.message ?? "GraphQL request failed.");
    this.name = "GraphQLRequestError";
    this.errors = errors;
    this.code = errors[0]?.extensions?.code;
  }
}

/**
 * Sends a GraphQL request to `endpoint`, including credentials so the
 * Better Auth session cookie travels with it. Throws `GraphQLRequestError`
 * on a GraphQL-level error and a plain `Error` on a transport-level failure
 * (non-2xx, network error).
 *
 * Overloaded (rather than one signature with an optional `variables?:
 * TVariables` param) so a document that declares variables makes the third
 * argument compulsory and type-checked, while a document with none can be
 * called as `graphqlRequest(endpoint, document)` — a single optional-param
 * signature can't express that distinction, since `TVariables` can't be
 * inferred until the second argument is checked, and by then the
 * optionality of the third parameter has already been fixed. Mirrors the
 * pattern graphql-request/urql use for the same reason.
 */
export async function graphqlRequest<TResult>(
  endpoint: string,
  document: TadaDocumentNode<TResult, Record<string, never>>,
): Promise<TResult>;
export async function graphqlRequest<TResult, TVariables extends Record<string, unknown>>(
  endpoint: string,
  document: TadaDocumentNode<TResult, TVariables>,
  variables: TVariables,
): Promise<TResult>;
export async function graphqlRequest<TResult, TVariables extends Record<string, unknown>>(
  endpoint: string,
  document: TadaDocumentNode<TResult, TVariables>,
  variables?: TVariables,
): Promise<TResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: print(document), variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as { data?: TResult; errors?: GraphQLResponseError[] };
  if (body.errors && body.errors.length > 0) {
    throw new GraphQLRequestError(body.errors);
  }
  if (body.data === undefined) {
    throw new Error("GraphQL response had no data.");
  }
  return body.data;
}
