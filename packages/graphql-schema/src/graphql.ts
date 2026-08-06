// The typed `graphql()` tagged-template used to author every GraphQL
// document in this package (issue #15). `graphql-env.d.ts` — regenerated
// from `schema.graphql` by `pnpm codegen` — also declares a global
// augmentation of gql.tada's `setupSchema` interface (which is what the
// `gql.tada/ts-plugin` editor integration relies on, see tsconfig.json),
// but `graphql` here is built with `initGraphQLTada` instead of the plain
// `gql.tada` export: that bakes the schema into `graphql`'s own type
// rather than depending on every *consumer's* TS program happening to load
// the ambient augmentation too (it only reliably does inside this package,
// since only this package's tsconfig `include`s graphql-env.d.ts as a root
// file) — without this, apps importing `MeQuery`/`ListShowsQuery`/etc.
// resolved their Result/Variables types as `unknown`. No `scalars` mapping
// is needed since the schema only uses the built-in scalars (String, ID,
// Boolean), which gql.tada maps correctly by default.
import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./graphql-env.d.ts";

export const graphql = initGraphQLTada<{
  introspection: introspection;
}>();

export type { FragmentOf, ResultOf, TadaDocumentNode, VariablesOf } from "gql.tada";
