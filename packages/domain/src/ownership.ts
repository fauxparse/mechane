// Single-user ownership model (PRD.md §1, §9): every resource in Presence
// belongs to exactly one authenticated user account — there are no
// orgs/teams or sharing/permissions model in v1. This module is the one
// place that invariant is checked, so every resource type (Show, and
// whatever else follows it) enforces it the same way instead of each
// resolver re-deriving its own ownership check.

/** Anything that records which user owns it. */
export interface Owned {
  userId: string;
}

/** Whether `userId` is the owner of `resource`. */
export function isOwnedBy(resource: Owned, userId: string): boolean {
  return resource.userId === userId;
}

export class NotOwnerError extends Error {
  constructor() {
    super("The current user does not own this resource.");
    this.name = "NotOwnerError";
  }
}

/**
 * Throws `NotOwnerError` unless `userId` owns `resource`. Intended for use
 * at the top of any resolver/mutation that reads or writes an owned
 * resource on behalf of the authenticated user.
 */
export function assertOwnedBy<T extends Owned>(resource: T, userId: string): T {
  if (!isOwnedBy(resource, userId)) {
    throw new NotOwnerError();
  }
  return resource;
}
