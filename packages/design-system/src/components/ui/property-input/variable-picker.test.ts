import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VariablePicker } from "./variable-picker";
import type { VariableReference } from "./property-input-types";

const variables: readonly VariableReference[] = [
  {
    id: "candidates",
    name: "Candidates → name",
    type: { kind: "array", of: { kind: "shape", shapeId: "candidate" } },
    fieldPath: ["field_name"],
    fieldType: "text",
    current: { kind: "text", value: "Alice" },
  },
  {
    id: "candidates",
    name: "Candidates → votes",
    type: { kind: "array", of: { kind: "shape", shapeId: "candidate" } },
    fieldPath: ["field_votes"],
    fieldType: "number",
    current: { kind: "number", value: 3 },
  },
];

const props = {
  query: "",
  variables,
  totalVariables: variables.length,
  linkedVariable: variables[1] ?? null,
  onQueryChange: () => {},
  onClose: () => {},
  onSelect: () => {},
  onDisconnect: () => {},
};

describe("VariablePicker", () => {
  it("marks the mapped field selected and uses each field leaf icon", () => {
    const html = renderToStaticMarkup(createElement(VariablePicker, props));

    expect(html).toContain("Candidates → name");
    expect(html).toContain("Candidates → votes");
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(1);
    expect(html).toContain("lucide-type");
    expect(html).toContain("lucide-hash");
  });
});
