// The holding page's two requests: whether the visitor has a Studio session
// (the same `me` query Studio's route guards use, riding the API's session
// cookie) and the waitlist sign-up.
import {
  GraphQLRequestError,
  graphqlRequest,
  JoinWaitlistMutation,
  MeQuery,
} from "@mechane/graphql-schema";
import { useMutation, useQuery } from "@tanstack/react-query";

import type { StudioSession } from "./components/StudioAccess";
import type { WaitlistEntry, WaitlistStatus } from "./components/WaitlistForm";
import { GRAPHQL_ENDPOINT } from "./config";

export function useStudioSession(): StudioSession {
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await graphqlRequest(GRAPHQL_ENDPOINT, MeQuery)).me,
    retry: false,
  });
  if (me.isPending) return { kind: "checking" };
  // An unreachable API reads as signed out: the sign-in link still works,
  // and Studio makes its own session check when it loads.
  if (!me.data) return { kind: "signed-out" };
  return { kind: "signed-in", name: me.data.name };
}

// These codes carry a message written for the visitor: a missing name, a
// malformed address, or too many sign-ups from their network.
function failureMessage(error: Error): string {
  if (
    error instanceof GraphQLRequestError &&
    (error.code === "BAD_USER_INPUT" || error.code === "RATE_LIMITED")
  ) {
    return error.message;
  }
  return "We couldn't add you just now. Try again in a moment.";
}

export function useJoinWaitlist(): {
  status: WaitlistStatus;
  join: (entry: WaitlistEntry) => void;
} {
  // The waitlist has no cached query on this page, so there is nothing to invalidate.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const mutation = useMutation({
    mutationFn: async (entry: WaitlistEntry): Promise<WaitlistEntry> => {
      await graphqlRequest(GRAPHQL_ENDPOINT, JoinWaitlistMutation, entry);
      return { name: entry.name.trim(), email: entry.email.trim() };
    },
  });

  let status: WaitlistStatus;
  if (mutation.isPending) status = { kind: "submitting" };
  else if (mutation.isSuccess) status = { kind: "joined", ...mutation.data };
  else if (mutation.isError) status = { kind: "failed", message: failureMessage(mutation.error) };
  else status = { kind: "idle" };

  return { status, join: mutation.mutate };
}
