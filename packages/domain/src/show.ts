// Show naming rules — the one piece of domain logic in the Show vertical
// slice (issue #3) that isn't just the ownership check. Kept here rather
// than inline in a resolver so it has the same unit-test coverage every
// other domain rule gets (PRD.md §8).

const MAX_SHOW_NAME_LENGTH = 200;

export class InvalidShowNameError extends Error {
  constructor(reason: string) {
    super(`Invalid Show name: ${reason}`);
    this.name = "InvalidShowNameError";
  }
}

/**
 * Trims a proposed Show name and throws `InvalidShowNameError` if what's
 * left is empty or unreasonably long. Use this on every create/rename
 * before the name reaches storage, so the same rule applies everywhere a
 * Show gets named rather than being re-derived per call site.
 */
export function assertValidShowName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new InvalidShowNameError("name must not be empty.");
  }
  if (trimmed.length > MAX_SHOW_NAME_LENGTH) {
    throw new InvalidShowNameError(`name must be ${MAX_SHOW_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}
