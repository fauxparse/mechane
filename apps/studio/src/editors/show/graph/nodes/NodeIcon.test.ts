import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Type } from "@mechane/domain/shapes";

import { NodeIcon } from "./NodeIcon";

const sourceIcon = (sourceType: Type | null) =>
  renderToStaticMarkup(createElement(NodeIcon, { kind: "source", sourceType }));

describe("NodeIcon", () => {
  // #35: a Source's icon reflects the type of data it holds.
  it("resolves a Source by data type", () => {
    expect(sourceIcon("number")).toContain("lucide-hash");
    expect(sourceIcon("text")).not.toContain("lucide-hash");
    // An absent type is an object, not a crash.
    expect(sourceIcon(null)).toContain("lucide-puzzle");
  });

  it("badges an array Source's list icon with its element type", () => {
    const markup = sourceIcon({ kind: "array", of: { kind: "shape", shapeId: "shape_person" } });
    expect(markup).toContain("lucide-list");
    expect(markup).toContain("lucide-puzzle");
  });
});
