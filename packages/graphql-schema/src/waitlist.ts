// Typed waitlist mutation used by the holding page (apps/site); see
// apps/api/src/graphql/waitlist.ts.
import { graphql } from "./graphql";

export const JoinWaitlistMutation = graphql(`
  mutation JoinWaitlist($email: String!) {
    joinWaitlist(email: $email)
  }
`);
