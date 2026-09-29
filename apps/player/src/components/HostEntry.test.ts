import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HostEntryView } from "./HostEntry";

vi.mock("./PlayerView", () => ({
  PlayerView: ({ code }: { code: string }) => createElement("main", null, `Device ${code}`),
}));

function render(entry: Parameters<typeof HostEntryView>[0]["entry"]): string {
  return renderToStaticMarkup(
    createElement(HostEntryView, { entry, pairingForm: createElement("form", null, "Code form") }),
  );
}

describe("HostEntryView", () => {
  it("renders the resolved Device's session", () => {
    expect(render({ kind: "device", pairingCode: "4QKEW" })).toContain("Device 4QKEW");
  });

  it("renders the holding page for a host that opens nothing", () => {
    expect(render({ kind: "not_found" })).toContain("Nothing is playing here");
  });

  it("renders Busy after repeated rate limiting", () => {
    expect(render({ kind: "busy" })).toContain("Busy — try again in a moment");
  });

  it("renders the pairing form on the canonical host", () => {
    expect(render({ kind: "canonical" })).toContain("Code form");
  });
});
