import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSchema, validate } from "graphql";
import { describe, expect, it } from "vitest";

import { GetActiveRunQuery, StartRunMutation, EndRunMutation } from "./runs";
import { GetShowCanvasesQuery } from "./canvas";
import { GetShowGraphQuery } from "./show-graph";

describe("Show graph operations", () => {
  it.each([
    GetShowGraphQuery,
    GetShowCanvasesQuery,
    GetActiveRunQuery,
    StartRunMutation,
    EndRunMutation,
  ])("validates %s against the generated schema", (operation) => {
    const schema = buildSchema(
      readFileSync(fileURLToPath(new URL("../schema.graphql", import.meta.url)), "utf8"),
    );

    expect(validate(schema, operation)).toEqual([]);
  });
});
