import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("keeps the reset control footprint when the value is empty", () => {
    const markup = renderToStaticMarkup(
      createElement(SearchInput, { value: "", onValueChange: () => {} }),
    );

    expect(markup).toContain('data-align="inline-end"');
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain("invisible");
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain("inert");
    expect(markup).not.toMatch(/<button[^>]*aria-hidden/);
    expect(markup).toContain('tabindex="-1"');
  });
});
