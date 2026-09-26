import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type ReactNode } from "react";

import { useTheme, type ThemeContextValue } from "./theme-provider";

interface ColorToken {
  /** Custom property name, e.g. `--background`. */
  name: string;
  /** Value as written in the theme block, e.g. `var(--palette-neutral-800)`. */
  declared: string;
  /** `declared` with `var()` aliases followed to the concrete color. */
  resolved: string;
}

interface ColorScale {
  name: string;
  steps: { step: number; token: ColorToken }[];
}

const THEME_SELECTOR_ATTRIBUTES = /data-theme-(?:mode|palette)/;
const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*\)$/;
const SCALE_STEP = /^(--.+)-(\d+)$/;

/**
 * Reads the color tokens the loaded stylesheets declare for one mode/palette pair. Theme blocks
 * are keyed off the same attributes ThemeProvider puts on `<html>`, so a detached element carrying
 * them matches exactly the active theme's rules; `:root`-only rules never match it.
 */
function readThemeTokens({ mode, palette }: ThemeContextValue): ColorToken[] {
  const probe = document.createElement("div");
  probe.setAttribute("data-theme-mode", mode);
  probe.setAttribute("data-theme-palette", palette);

  const declared = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    collectThemeDeclarations(readRules(sheet), probe, declared);
  }

  return Array.from(declared, ([name, value]) => ({
    name,
    declared: value,
    resolved: resolveAlias(value, declared),
  })).filter((token) => CSS.supports("color", token.resolved));
}

function readRules(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules);
  } catch {
    // Cross-origin stylesheets refuse rule access; theme CSS is always same-origin.
    return [];
  }
}

function collectThemeDeclarations(
  rules: CSSRule[],
  probe: Element,
  into: Map<string, string>,
): void {
  for (const rule of rules) {
    if (rule instanceof CSSLayerBlockRule) {
      collectThemeDeclarations(Array.from(rule.cssRules), probe, into);
    } else if (
      rule instanceof CSSStyleRule &&
      THEME_SELECTOR_ATTRIBUTES.test(rule.selectorText) &&
      probe.matches(rule.selectorText)
    ) {
      for (const property of Array.from(rule.style)) {
        if (property.startsWith("--")) {
          into.set(property, rule.style.getPropertyValue(property).trim());
        }
      }
    }
  }
}

function resolveAlias(value: string, declared: Map<string, string>): string {
  const visited = new Set<string>();
  let current = value;
  for (
    let alias = VAR_REFERENCE.exec(current)?.[1];
    alias !== undefined;
    alias = VAR_REFERENCE.exec(current)?.[1]
  ) {
    const target = declared.get(alias);
    if (target === undefined || visited.has(alias)) return current;
    visited.add(alias);
    current = target;
  }
  return current;
}

function groupTokens(tokens: ColorToken[]) {
  const semantic: ColorToken[] = [];
  const paletteRoles: ColorToken[] = [];
  const scales = new Map<string, ColorScale>();
  for (const token of tokens) {
    const [, scaleName, step] = SCALE_STEP.exec(token.name) ?? [];
    if (scaleName !== undefined && step !== undefined) {
      const scale: ColorScale = scales.get(scaleName) ?? { name: scaleName, steps: [] };
      scale.steps.push({ step: Number(step), token });
      scales.set(scaleName, scale);
    } else if (token.name.startsWith("--palette-")) {
      paletteRoles.push(token);
    } else {
      semantic.push(token);
    }
  }
  for (const scale of scales.values()) scale.steps.sort((a, b) => a.step - b.step);
  return { semantic, paletteRoles, scales: Array.from(scales.values()) };
}

function TokenCard({ token }: { token: ColorToken }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
      <div className="h-16 border-b" style={{ background: `var(${token.name})` }} />
      <div className="flex flex-col gap-0.5 p-2 font-mono text-xs">
        <span className="font-semibold">{token.name}</span>
        {token.declared !== token.resolved && (
          <span className="text-muted-foreground">{token.declared}</span>
        )}
        <span className="text-muted-foreground">{token.resolved}</span>
      </div>
    </div>
  );
}

function TokenGrid({ tokens }: { tokens: ColorToken[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
      {tokens.map((token) => (
        <TokenCard key={token.name} token={token} />
      ))}
    </div>
  );
}

function ScaleRow({ scale }: { scale: ColorScale }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] items-start gap-3">
      <span className="pt-2 font-mono text-xs font-semibold">{scale.name}</span>
      <div className="grid auto-cols-fr grid-flow-col gap-1">
        {scale.steps.map(({ step, token }) => (
          <div
            key={token.name}
            className="flex min-w-0 flex-col gap-1"
            title={
              token.declared === token.resolved ? token.name : `${token.name}: ${token.declared}`
            }
          >
            <div className="h-10 rounded border" style={{ background: `var(${token.name})` }} />
            <span className="font-mono text-[10px] leading-tight text-muted-foreground">
              {step}
              <br />
              {token.resolved}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function ColorTokens() {
  const theme = useTheme();
  const { semantic, paletteRoles, scales } = useMemo(
    () => groupTokens(readThemeTokens(theme)),
    [theme],
  );

  return (
    <div className="flex min-h-screen flex-col gap-8 bg-background p-6 text-foreground">
      <h1 className="text-lg font-semibold">
        Color tokens · {theme.palette} / {theme.mode}
      </h1>
      <Section title="Semantic">
        <TokenGrid tokens={semantic} />
      </Section>
      <Section title="Palette roles">
        <TokenGrid tokens={paletteRoles} />
      </Section>
      <Section title="Scales">
        <div className="flex flex-col gap-3">
          {scales.map((scale) => (
            <ScaleRow key={scale.name} scale={scale} />
          ))}
        </div>
      </Section>
    </div>
  );
}

const meta = {
  title: "design-system/Color Tokens",
  component: ColorTokens,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ColorTokens>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentTheme: Story = {};
