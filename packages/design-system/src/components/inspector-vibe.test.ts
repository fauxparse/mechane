import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { InspectorProvider } from "./inspector-vibe";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton } from "./ui/input-group";
import { Select, SelectTrigger } from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

function renderInspector(children: ReactNode) {
  return renderToStaticMarkup(createElement(InspectorProvider, null, children));
}

describe("inspector vibe", () => {
  it("applies the shared compact control treatment", () => {
    const markup = renderInspector(
      createElement(
        "div",
        null,
        createElement(
          Select,
          { items: [{ label: "Type", value: "type" }], defaultValue: "type" },
          createElement(SelectTrigger, { "aria-label": "Type" }),
        ),
        createElement(Input, { "aria-label": "Name" }),
      ),
    );

    expect(markup).toContain("h-7");
    expect(markup).toContain("rounded-sm");
    expect(markup).toContain("bg-muted/50");
  });

  it("lets an explicit default vibe opt one control out", () => {
    const markup = renderInspector(createElement(Button, { vibe: "default" }, "Save"));

    expect(markup).toContain("h-8");
    expect(markup).not.toContain('data-vibe="inspector"');
  });

  it("propagates to grouped controls and selects compact child defaults", () => {
    const markup = renderInspector(
      createElement(
        "div",
        null,
        createElement(
          InputGroup,
          null,
          createElement(InputGroupAddon, { align: "inline-end" }, "Suffix"),
          createElement(InputGroupButton, { "aria-label": "Clear" }, "×"),
        ),
        createElement(
          ToggleGroup,
          { value: [] },
          createElement(ToggleGroupItem, { value: "one" }, "One"),
        ),
      ),
    );

    expect(markup).toContain('data-size="icon-xs"');
    expect(markup).toContain('data-size="sm"');
    expect(markup).toContain('data-vibe="inspector"');
    expect(markup).toContain("mr-0");
  });
});
