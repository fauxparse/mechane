import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PropertyInput } from "./property-input";

const linkedVariable = {
  id: "candidates",
  name: "Candidates → name",
  type: { kind: "array" as const, of: { kind: "shape" as const, shapeId: "candidate" } },
  fieldPath: ["field_name"],
  fieldType: "text" as const,
  current: { kind: "text" as const, value: "Alice" },
};

describe("PropertyInput", () => {
  it("reads a connected Variable's resolved value on its chip, not the Variable's name", () => {
    const html = renderToStaticMarkup(
      createElement(PropertyInput, { type: "text", value: linkedVariable }),
    );

    expect(html).toContain('data-connector="variable"');
    expect(html).toContain("Alice");
    expect(html).not.toContain("Candidates → name");
  });

  it("reads the laid-out size on a Fill chip", () => {
    const html = renderToStaticMarkup(
      createElement(PropertyInput, {
        type: "number",
        dimension: "width",
        sizing: "fill",
        placeholder: "Fill",
        value: { kind: "number", value: 240 },
      }),
    );

    expect(html).toContain('data-connector="sizing"');
    expect(html).toMatch(/>240</);
  });

  it("offers no menu while disabled", () => {
    const html = renderToStaticMarkup(
      createElement(PropertyInput, {
        type: "number",
        dimension: "width",
        disabled: true,
        value: { kind: "number", value: 240 },
      }),
    );

    expect(html).not.toContain("Property options");
  });
});
