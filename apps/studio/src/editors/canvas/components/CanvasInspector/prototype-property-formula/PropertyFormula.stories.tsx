// PROTOTYPE (issue #711) — the three Formula authoring surfaces, at the
// inspector's real width, without a running Studio.
//
// The prototype reads its variant from `?variant=`, so each story sets that on
// `window.location` before rendering. Measured in the browser, the inspector's
// content column is 304px and a single Property cell is 114px; the stories
// reproduce that by mounting the real floating `Sidebar`.
import { Sidebar, SidebarProvider } from "@mechane/design-system";
import type { FrameElement, SceneVariable } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState, type ReactNode } from "react";

import type { CanvasArtboardDocument } from "../../../../../api/canvas";
import { StaticGoogleFontsProvider } from "../../../google-fonts-provider";
import type { CanvasSelection } from "../../canvas-selection";
import { CanvasInspector } from "../CanvasInspector";
import { PROTOTYPE_VARIANTS, VARIANT_NAMES, type PrototypeVariant } from "./prototype-variant";

const CANVAS_ID = "prototype-711-canvas";
const ART_ID = "prototype-711-art";

const variables: SceneVariable[] = [
  { id: "candidates", name: "Candidates", type: "number", defaultValue: 5 },
  { id: "headline-copy", name: "Copy / Headline", type: "text", defaultValue: "Vote now" },
  { id: "accent", name: "Colour / Accent", type: "color", defaultValue: "#38bdf8" },
];

const root: FrameElement = {
  id: "prototype-711-root",
  type: "frame",
  name: "Formula review",
  layoutMode: "absolute",
  sizing: { width: { mode: "fixed", value: 720 }, height: { mode: "fixed", value: 480 } },
  children: [
    {
      id: "headline",
      type: "text",
      name: "Headline",
      rank: "a",
      content: "Choose a candidate",
      fontFamily: "Georgia, serif",
      fontSize: 36,
      opacity: 1,
      color: "#0f172a",
      sizing: { width: { mode: "hug" }, height: { mode: "hug" } },
      anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 28 },
    },
    {
      id: "card",
      type: "rect",
      name: "Card",
      rank: "b",
      opacity: 0.72,
      fill: "#38bdf8",
      sizing: { width: { mode: "fixed", value: 280 }, height: { mode: "fixed", value: 160 } },
      anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 120 },
    },
  ],
};

const artboard: CanvasArtboardDocument = {
  canvasId: CANVAS_ID,
  artId: ART_ID,
  kind: "scene",
  name: "Formula review",
  canvas: { kind: "scene", root },
  position: { x: 0, y: 0 },
};

function applyUpdates(
  current: CanvasArtboardDocument,
  updates: readonly { readonly elementId: string; readonly properties: Record<string, unknown> }[],
): CanvasArtboardDocument {
  const children = current.canvas.root.children?.map((child) => {
    const update = updates.find((candidate) => candidate.elementId === child.id);
    return update ? { ...child, ...update.properties } : child;
  });
  return { ...current, canvas: { ...current.canvas, root: { ...current.canvas.root, children } } };
}

function FormulaStory({
  variant,
  selection,
}: {
  variant: PrototypeVariant;
  selection: CanvasSelection;
}) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("variant") !== variant) {
    url.searchParams.set("variant", variant);
    window.history.replaceState({}, "", url.toString());
  }
  const [current, setCurrent] = useState(artboard);
  const onUpdateElements = useCallback(
    (
      _canvasId: string,
      updates: readonly {
        readonly elementId: string;
        readonly properties: Record<string, unknown>;
      }[],
    ) => setCurrent((previous) => applyUpdates(previous, updates)),
    [],
  );
  return (
    <StaticGoogleFontsProvider fonts={[]}>
      <SidebarProvider className="min-h-screen w-full bg-background">
        <Banner>
          #711 · {variant} ({VARIANT_NAMES[variant]})
        </Banner>
        <Sidebar collapsible="offcanvas" variant="floating" side="right" aria-label="Properties">
          <CanvasInspector
            focused={current}
            artboards={[current]}
            selection={selection}
            variables={variables}
            onUpdateElements={onUpdateElements}
          />
        </Sidebar>
      </SidebarProvider>
    </StaticGoogleFontsProvider>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex-1 bg-background p-6">
      <p className="rounded-full bg-yellow-300 px-3 py-1 text-xs font-semibold text-black inline-block">
        {children}
      </p>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Variant A: type <code>=</code> in any Property. Variant B: the <code>fx</code> button in the
        row. Variant C: “Write a Formula” in the Property menu (press <kbd>↓</kbd> in a Property).
      </p>
    </div>
  );
}

const meta: Meta<typeof CanvasInspector> = {
  title: "studio/Editors/Canvas/Prototypes/PropertyFormula",
  component: CanvasInspector,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof CanvasInspector>;

const single: CanvasSelection = { artId: ART_ID, elementIds: ["headline"] };
const multiple: CanvasSelection = { artId: ART_ID, elementIds: ["headline", "card"] };

export const TypeEqualsLikeASpreadsheet: Story = {
  render: () => <FormulaStory variant="A" selection={single} />,
};

export const TheRowNeverGrows: Story = {
  render: () => <FormulaStory variant="B" selection={single} />,
};

export const OneFormulaSection: Story = {
  render: () => <FormulaStory variant="C" selection={single} />,
};

/** Two Elements at once: what the affordance does across a selection. */
export const MultipleElements: Story = {
  render: () => <FormulaStory variant={PROTOTYPE_VARIANTS[0]} selection={multiple} />,
};
