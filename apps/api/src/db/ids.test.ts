import { describe, expect, it, vi } from "vitest";

import { withUniqueId } from "./ids";

/** What `pg` throws when an insert violates a unique constraint. */
function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint "shows_pkey"'), {
    code: "23505",
  });
}

describe("withUniqueId", () => {
  it("passes a generated id of the right shape to the insert", async () => {
    const insert = vi.fn().mockResolvedValue("ok");
    await withUniqueId("show", insert);
    expect(insert).toHaveBeenCalledWith(expect.stringMatching(/^s[2-9a-z]{7}$/));
  });

  it("returns the insert's result", async () => {
    await expect(withUniqueId("show", async () => "inserted")).resolves.toBe("inserted");
  });

  it("retries with a different id after a collision", async () => {
    const insert = vi
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce("inserted");

    await expect(withUniqueId("show", insert)).resolves.toBe("inserted");
    expect(insert).toHaveBeenCalledTimes(2);
    const [first, second] = insert.mock.calls.map(([id]) => id as string);
    expect(first).not.toBe(second);
  });

  it("gives up after three collisions rather than looping forever", async () => {
    const insert = vi.fn().mockRejectedValue(uniqueViolation());
    await expect(withUniqueId("show", insert)).rejects.toThrow(/duplicate key/);
    expect(insert).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry an error that isn't a unique violation", async () => {
    const insert = vi.fn().mockRejectedValue(new Error("connection lost"));
    await expect(withUniqueId("show", insert)).rejects.toThrow("connection lost");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("retries any unique violation, including one a new id can't fix", async () => {
    // Only the primary key is worth retrying — a duplicate email won't
    // become unique just because we picked a new id. Both arrive as 23505,
    // so this documents the deliberate limitation: we retry all of them.
    // If a table later gains a second unique column, this is where the
    // distinction (by constraint name) would go.
    const insert = vi.fn().mockRejectedValue(uniqueViolation());
    await expect(withUniqueId("show", insert)).rejects.toThrow();
    expect(insert).toHaveBeenCalledTimes(3);
  });
});
