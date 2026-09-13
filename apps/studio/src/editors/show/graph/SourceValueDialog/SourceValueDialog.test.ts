import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@mechane/design-system";
import { generateId, type Shape } from "@mechane/domain";

import { recordIdentifier } from "./ArrayValueEditor/types";
import { ValueEditor } from "./ValueEditor";

const candidate: Shape = {
  id: "candidate",
  name: "Candidate",
  fields: [
    { id: "name", name: "Name", type: "text", required: true, defaultValue: "" },
    { id: "votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
    { id: "image", name: "Image", type: "image", required: false, defaultValue: null },
  ],
};

describe("ValueEditor", () => {
  it("renders recursive Shape controls for a Block default", () => {
    const html = renderToStaticMarkup(
      createElement(
        ToastProvider,
        null,
        createElement(ValueEditor, {
          type: { kind: "shape", shapeId: candidate.id },
          value: {
            name: "Alice",
            votes: 0,
            image: { assetId: "asset-alice", revision: "revision-1" },
          },
          shapes: [candidate],
          imageAssets: [
            {
              assetId: "asset-alice",
              revision: "revision-1",
              url: "/alice.png",
              width: 128,
              height: 128,
              alt: "Alice",
              mimeType: "image/png",
              blurHash: null,
            },
          ],
          path: [],
          onChange: () => {},
          onValidityChange: () => {},
        }),
      ),
    );

    expect(html).toContain("Image");
    expect(html).toContain('aria-label="Choose image file"');
    expect(html).toContain('data-empty="false"');
    expect(html).toContain("Name");
    expect(html).toContain("Votes");
  });
  it("renders primitive values without editing controls in read-only mode", () => {
    const html = renderToStaticMarkup(
      createElement(ValueEditor, {
        type: "text",
        value: "Incoming value",
        shapes: [],
        path: [],
        readOnly: true,
        onChange: () => {},
        onValidityChange: () => {},
      }),
    );

    expect(html).toContain("Incoming value");
    expect(html).not.toContain("combobox");
  });
});

describe("array record identifiers", () => {
  it("uses the first text field instead of the first field", () => {
    const shape: Shape = {
      id: "candidate",
      name: "Candidate",
      fields: [
        { id: "votes", name: "Votes", type: "number", required: true, defaultValue: 0 },
        { id: "name", name: "Name", type: "text", required: true, defaultValue: "" },
      ],
    };
    const record = {
      id: generateId("structuredValue"),
      kind: "shape",
      fields: { votes: 3, name: "Alice" },
    } satisfies Parameters<typeof recordIdentifier>[0];
    expect(recordIdentifier(record, shape.fields)).toBe("Alice");
  });
});
