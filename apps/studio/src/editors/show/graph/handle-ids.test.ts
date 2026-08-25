import { describe, expect, it } from "vitest";

import { handleFor, readHandle, type HandleId } from "./handle-ids";

const handles: HandleId[] = [
  { kind: "input" },
  { kind: "output" },
  { kind: "variable", id: "variable:prompt" },
  { kind: "field", id: "field/headline" },
  { kind: "deviceSource", name: "qr-code" },
];

describe("handle ids", () => {
  it.each(handles)("round-trips a $kind handle", (handle) => {
    expect(readHandle(handleFor(handle))).toEqual(handle);
  });

  it("keeps Variable and Shape Field ids unambiguous", () => {
    const variable = handleFor({ kind: "variable", id: "shared" });
    const field = handleFor({ kind: "field", id: "shared" });

    expect(variable).not.toBe(field);
    expect(readHandle(variable)).toEqual({ kind: "variable", id: "shared" });
    expect(readHandle(field)).toEqual({ kind: "field", id: "shared" });
  });

  it("rejects malformed or unknown ids", () => {
    expect(readHandle("shared")).toBeNull();
    expect(readHandle("field:%ZZ")).toBeNull();
    expect(readHandle("variable:")).toBeNull();
  });
});
