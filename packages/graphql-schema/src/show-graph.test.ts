import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSchema, validate } from "graphql";
import { describe, expect, it } from "vitest";

import { GetShowGraphQuery } from "./show-graph";

describe("Show graph operations", () => {
  it("validate against the generated schema", () => {
    const schema = buildSchema(
      readFileSync(fileURLToPath(new URL("../schema.graphql", import.meta.url)), "utf8"),
    );

    expect(validate(schema, GetShowGraphQuery)).toEqual([]);
  });
});
