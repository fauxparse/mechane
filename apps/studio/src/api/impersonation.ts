// Starting and stopping impersonation (issue #845) through Better Auth's admin
// endpoints (./auth-client.ts). Each swaps the session cookie for another
// user's, so everything already loaded — cached queries, realtime connections —
// belongs to the wrong person. Both finish with a full page load rather than
// cache invalidation, so nothing from the previous identity survives.
import { useMutation } from "@tanstack/react-query";

import { toAuthRequestError } from "./auth";
import { authClient } from "./auth-client";

/** Signs the admin in as `userId` and opens that user's Shows. */
export function useImpersonateUser() {
  // The page reloads on success; there is no cache left to invalidate.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await authClient.admin.impersonateUser({ userId });
      if (error) throw toAuthRequestError(error, "Couldn't impersonate this user.");
    },
    onSuccess: () => window.location.assign("/"),
  });
}

/** Returns the admin to their own session, on the page of the user they were impersonating. */
export function useStopImpersonating() {
  // The page reloads on success; there is no cache left to invalidate.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  return useMutation({
    mutationFn: async (_impersonatedUserId: string) => {
      const { error } = await authClient.admin.stopImpersonating();
      if (error) throw toAuthRequestError(error, "Couldn't stop impersonating.");
    },
    onSuccess: (_data, impersonatedUserId) =>
      window.location.assign(`/admin/users/${encodeURIComponent(impersonatedUserId)}`),
  });
}
