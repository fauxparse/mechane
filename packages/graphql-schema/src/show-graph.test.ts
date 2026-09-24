import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSchema, validate, visit } from "graphql";
import type { DocumentNode } from "graphql";
import { describe, expect, it } from "vitest";

import { GetActiveRunQuery, StartRunMutation, EndRunMutation } from "./runs";
import { GetShowCanvasesQuery } from "./canvas";
import { GetPlayerSessionQuery } from "./player";
import { SHOW_GRAPH_EDITOR_FIELDS } from "./show-graph-document";
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
  it("does not publish the removed graph-only input", () => {
    const schema = buildSchema(
      readFileSync(fileURLToPath(new URL("../schema.graphql", import.meta.url)), "utf8"),
    );

    expect(schema.getType("GraphEditInput")).toBeUndefined();
  });

  // Two documents selecting the graph is how Studio and the Player came to
  // disagree about what the wire means (#742, ADR-0020). Both spread one
  // fragment now, so a field reaches both hosts or neither.
  it.each([
    ["the Show Editor", GetShowGraphQuery],
    ["the Player", GetPlayerSessionQuery],
  ])("selects the Show graph through the shared fragment for %s", (_host, operation) => {
    const definitions = operation.definitions.filter(
      (definition) => definition.kind === "FragmentDefinition",
    );

    expect(definitions.map((definition) => definition.name.value)).toContain("ShowGraphFields");
  });

  // Editor-only fields stay out of the shared fragment: an audience phone on
  // cellular (ADR-0001) should not carry the Show Editor's chrome. Checked by
  // path, because `layout` is also an Element Property the Player does read.
  it("keeps editor-only fields out of the Player's document", () => {
    const selects = (document: DocumentNode, path: string): boolean => {
      const [parent, child] = path.split(".");
      let found = false;
      visit(document, {
        Field(node) {
          if (node.name.value !== parent) return;
          for (const selection of node.selectionSet?.selections ?? []) {
            if (selection.kind === "Field" && selection.name.value === child) found = true;
            if (selection.kind === "InlineFragment") {
              for (const inner of selection.selectionSet.selections) {
                if (inner.kind === "Field" && inner.name.value === child) found = true;
              }
            }
          }
        },
      });
      return found;
    };

    for (const path of SHOW_GRAPH_EDITOR_FIELDS) {
      expect({ path, selected: selects(GetShowGraphQuery, path) }).toEqual({
        path,
        selected: true,
      });
      expect({ path, selected: selects(GetPlayerSessionQuery, path) }).toEqual({
        path,
        selected: false,
      });
    }
  });
});
