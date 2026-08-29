import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Shape } from "@mechane/domain";

import { ValueEditor } from "./ValueEditor";

const candidate: Shape = {
  id: "candidate",
  name: "Candidate",
  fields: [
    { id: "name", name: "Name", type: "text", required: true, defaultValue: "" },
    { id: "votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
  ],
};

describe("ValueEditor", () => {
  it("renders recursive Shape controls for a Block default", () => {
    const html = renderToStaticMarkup(
      createElement(ValueEditor, {
        type: { kind: "shape", shapeId: candidate.id },
        value: { name: "Alice", votes: 0 },
        shapes: [candidate],
        path: [],
        onChange: () => {},
        onValidityChange: () => {},
      }),
    );

    expect(html).toContain("Name");
    expect(html).toContain("Votes");
  });
});
