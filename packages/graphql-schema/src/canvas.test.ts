import { print } from "graphql";
import { describe, expect, it } from "vitest";

import { CanvasElementFields } from "./canvas";

describe("Canvas GraphQL query", () => {
  it("requests text alignment when loading Canvas Elements", () => {
    expect(print(CanvasElementFields)).toContain("textAlign");
  });
});
