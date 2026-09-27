// Typed waitlist mutation used by the holding page (apps/site); see
// apps/api/src/graphql/waitlist.ts.
import { graphql } from "./graphql";

export const JoinWaitlistMutation = graphql(`
  mutation JoinWaitlist($name: String!, $email: String!) {
    joinWaitlist(name: $name, email: $email)
  }
`);
