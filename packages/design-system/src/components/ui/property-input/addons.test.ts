import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Addons } from "./addons";

const linkedVariable = {
  id: "candidates",
  name: "Candidates → name",
  type: { kind: "array" as const, of: { kind: "shape" as const, shapeId: "candidate" } },
  fieldPath: ["field_name"],
  fieldType: "text" as const,
  current: { kind: "text" as const, value: "Alice" },
};

describe("property input addons", () => {
  it("displays the mapped field name for a connected property", () => {
    const html = renderToStaticMarkup(
      createElement(Addons, {
        inputType: "text",
        colorText: "",
        linkedVariable,
        allowLink: false,
        onScrubPointerDown: () => {},
        onScrubPointerMove: () => {},
        onScrubPointerEnd: () => {},
        connector: null,
      }),
    );

    expect(html).toContain("Candidates → name");
  });
});
