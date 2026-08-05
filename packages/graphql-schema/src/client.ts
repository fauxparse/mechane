// Minimal fetch-based GraphQL client. No codegen exists yet (PRD.md's
// "generated client types" is aspirational for this package until a
// codegen tool is chosen) — this is deliberately small so apps can call
// the API without each hand-rolling fetch/error-handling boilerplate.
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
 */
export async function graphqlRequest<TData, TVariables extends object = Record<string, never>>(
  endpoint: string,
  query: string,
  variables?: TVariables,
): Promise<TData> {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as { data?: TData; errors?: GraphQLResponseError[] };
  if (body.errors && body.errors.length > 0) {
    throw new GraphQLRequestError(body.errors);
  }
  if (body.data === undefined) {
    throw new Error("GraphQL response had no data.");
  }
  return body.data;
}
