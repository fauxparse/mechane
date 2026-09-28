// Typed `me` query (issue #15) — proves a signed-in user is resolvable, per
// apps/api/src/graphql/schema.ts — plus the admin impersonating them, if
// anyone is (issue #845). `Me` and `Impersonator` are derived from the query's
// own result type rather than hand-mirrored, so they can't drift from the
// fields actually selected here.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const MeQuery = graphql(`
  query Me {
    me {
      id
      name
      email
      role
    }
    impersonator {
      id
      name
      email
    }
  }
`);

export type Me = NonNullable<ResultOf<typeof MeQuery>["me"]>;
export type Impersonator = NonNullable<ResultOf<typeof MeQuery>["impersonator"]>;
