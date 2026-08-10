import { describe, expect, it } from "vitest";

import { STEPS, apcaLc, generateScale, parseScheme, wcagRatio } from "./theme-generator";

describe("theme source parser", () => {
  it("normalizes Base16 keys and accepts hash-prefixed values", () => {
    const scheme = parseScheme(`
name: Test
variant: dark
palette:
  base00: "#101010"
  base01: "#202020"
  base02: "#303030"
  base03: "#404040"
  base04: "#505050"
  base05: "#606060"
  base06: "#707070"
  base07: "#808080"
  base08: "#ff0000"
  base09: "#ff8000"
  base0A: "#ffff00"
  base0B: "#00ff00"
  base0C: "#00ffff"
  base0D: "#0000ff"
  base0E: "#8000ff"
`);

    expect(scheme.variant).toBe("dark");
    expect(scheme.palette.base0a).toBe("#ffff00");
    expect(scheme.palette.base0e).toBe("#8000ff");
  });
});

describe("scale generation", () => {
  it("emits every absolute step and pins an authored seed", () => {
    const scale = generateScale("#00ff00", "green");

    expect(Object.keys(scale).map(Number)).toEqual([...STEPS]);
    expect(Object.values(scale)).toContain("#00ff00");
  });
});

describe("contrast metrics", () => {
  it("returns directional APCA and WCAG measurements", () => {
    expect(apcaLc("#000000", "#ffffff")).toBeGreaterThan(0);
    expect(apcaLc("#ffffff", "#000000")).toBeLessThan(0);
    expect(wcagRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
