/**
 * PROTOTYPE — throwaway. Not production code, not wired to anything real.
 *
 * Question (#634): how does an author say a Source's default is absent, and
 * what does an absent Source look like in each editor?
 *
 * Two facts found before building, both of which narrow the job:
 *
 *  1. The Show Editor ALREADY draws field-level absence. `NodeContent.tsx`
 *     renders `(empty)` at 50% opacity for a null field value. So absence has
 *     a house token; the question is whether it stretches to a whole Source.
 *  2. The graph draws AUTHORED values, never live ones ("Authored Source
 *     values are what the Show Editor draws", graph-to-flow.ts). #537 already
 *     decided live values arrive on the Source node behind a popover, so this
 *     prototype shows the default view and treats live as the popover's job.
 *
 * The hard case is not the graph, though. It is the Canvas Editor: #623 kept
 * the runtime rule that an absent value falls back to the type default, so a
 * text Element bound to an absent Source renders an empty string. An author
 * looking at a blank rectangle cannot tell absence from an empty string from
 * a broken connection. Story `Canvas` is that problem.
 */
import { cn, CircleAlertIcon, LinkIcon } from "@mechane/design-system";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import type { ShowFlowNode } from "./graph-to-flow";
import { BaseNode } from "./nodes/BaseNode";
import "./show-graph-editor.css";

/* ------------------------------------------------------------------ fixture */

type NodeData = ShowFlowNode["data"];

const base: NodeData = {
  name: "",
  color: "neutral",
  kind: "source",
  type: "text",
  fields: [],
  cues: [],
  variables: [],
  wiredVariableIds: [],
  defaultSceneId: null,
  isDefaultScene: false,
  childCount: 0,
  perConnection: false,
  driven: false,
  pairingCode: null,
};

interface Row {
  id: string;
  name: string;
  value: string | null;
}

const FILLED: Row[] = [
  { id: "f_name", name: "Name", value: "Alice" },
  { id: "f_votes", name: "Votes", value: "0" },
  { id: "f_image", name: "Image", value: "alice.png" },
];

const HOLLOW: Row[] = FILLED.map((row) => ({ ...row, value: null }));

/* --------------------------------------------------------------- scaffolding */

const Board = ({ title, note, children }: { title: string; note: string; children: ReactNode }) => (
  <div className="min-h-screen bg-background p-10">
    <p className="text-sm font-medium">{title}</p>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{note}</p>
    <div
      className="mechane-show-graph mt-8 flex flex-wrap items-start gap-8"
      data-flow-theme="neutral"
    >
      {children}
    </div>
  </div>
);

const Case = ({ caption, children }: { caption: string; children: ReactNode }) => (
  <div className="flex w-[230px] flex-col gap-2">
    <div>{children}</div>
    <p className="text-xs text-muted-foreground">{caption}</p>
  </div>
);

const SourceCard = ({ name, children }: { name: string; children: ReactNode }) => (
  <BaseNode id={name} data={{ ...base, name, type: "text" }}>
    {children}
  </BaseNode>
);

/* ------------------------------------------------------- A — extend `(empty)` */

/** The token the Show Editor already uses for a null field value. */
const EmptyToken = () => <span className="text-(--flow-muted-foreground) opacity-50">(empty)</span>;

const RowsA = ({ rows, whole }: { rows: Row[]; whole?: boolean }) => {
  if (whole) {
    return (
      <div className="border-t border-(--flow-border)/50 px-4 py-2 text-sm">
        <EmptyToken />
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-baseline justify-between gap-2 border-t border-(--flow-border)/50 px-4 py-2 text-sm first:border-t-0"
        >
          <span className="min-w-0 truncate">{row.value ?? <EmptyToken />}</span>
          <span className="text-xs text-(--flow-muted-foreground)">{row.name}</span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------ B — absence has shape */

const RowsB = ({ rows, whole }: { rows: Row[]; whole?: boolean }) => (
  <div className={cn("flex flex-col", whole && "opacity-60")}>
    {rows.map((row) => (
      <div
        key={row.id}
        className="flex items-center justify-between gap-2 border-t border-(--flow-border)/50 px-4 py-2 text-sm first:border-t-0"
      >
        {row.value === null ? (
          <span className="h-px flex-1 bg-(--flow-border)/60" aria-label="no value" />
        ) : (
          <span className="min-w-0 flex-1 truncate">{row.value}</span>
        )}
        <span className="text-xs text-(--flow-muted-foreground)">{row.name}</span>
      </div>
    ))}
  </div>
);

/* ------------------------------------------------- C — nothing on the node */

const RowsC = ({ rows }: { rows: Row[]; whole?: boolean }) => (
  <div className="flex flex-col">
    {rows.map((row) => (
      <div
        key={row.id}
        className="flex items-baseline justify-between gap-2 border-t border-(--flow-border)/50 px-4 py-2 text-sm first:border-t-0"
      >
        <span className="min-w-0 truncate">{row.value ?? " "}</span>
        <span className="text-xs text-(--flow-muted-foreground)">{row.name}</span>
      </div>
    ))}
  </div>
);

/* --------------------------------------------------------------- the matrix */

function Matrix({ Rows }: { Rows: typeof RowsA }) {
  return (
    <>
      <Case caption="A Shape Source with a populated default. The baseline.">
        <SourceCard name="candidates">
          <Rows rows={FILLED} />
        </SourceCard>
      </Case>
      <Case caption="`selected` — default is absent. Nothing was ever materialised.">
        <SourceCard name="selected">
          <Rows rows={HOLLOW} whole />
        </SourceCard>
      </Case>
      <Case caption="A Shape whose default exists but whose every field is empty. Different thing, same look?">
        <SourceCard name="draft">
          <Rows rows={HOLLOW} />
        </SourceCard>
      </Case>
      <Case caption="An absent array.">
        <SourceCard name="shortlist">
          <Rows rows={[]} whole />
        </SourceCard>
      </Case>
      <Case caption="An empty array. #623 made these behave identically at runtime; only the editor could ever show the difference.">
        <SourceCard name="shortlist">
          <Rows rows={[]} />
        </SourceCard>
      </Case>
    </>
  );
}

/* ------------------------------------------------------------------ stories */

const meta: Meta = {
  title: "studio/PROTOTYPE/Absent Source (#634)",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const A_ExtendEmpty: Story = {
  name: "A — extend the `(empty)` token upward",
  render: () => (
    <Board
      title="A — the house token, stretched from a field to a whole Source"
      note="`(empty)` at 50% opacity is already what NodeContent draws for a null field. A wholly absent Source collapses to one such row instead of listing fields that do not exist. Cheapest possible answer, and the only one that invents no new vocabulary."
    >
      <Matrix Rows={RowsA} />
    </Board>
  ),
};

export const B_AbsenceHasShape: Story = {
  name: "B — absence keeps the shape",
  render: () => (
    <Board
      title="B — draw the structure, leave the values as rules"
      note="Field names stay, values become a rule. An absent Shape still reads as a Candidate-shaped hole rather than a word, so what is missing is legible without reading. Costs a new visual token the rest of the graph does not use."
    >
      <Matrix Rows={RowsB} />
    </Board>
  ),
};

export const C_NothingOnTheNode: Story = {
  name: "C — say nothing here",
  render: () => (
    <Board
      title="C — absence is a fact about a reading, not a property of the node"
      note="The node shows blank and moves on. The argument: absence is ordinary data per #623, not an error, and a graph that annotates every empty value trains authors to ignore the annotation. Where it actually bites is the Canvas Editor, so put the explanation there and nowhere else."
    >
      <Matrix Rows={RowsC} />
    </Board>
  ),
};

/* ------------------------------------------------------- the Canvas problem */

const Artboard = ({
  caption,
  children,
  annotation,
}: {
  caption: string;
  children: ReactNode;
  annotation?: ReactNode;
}) => (
  <div className="flex w-[260px] flex-col gap-2">
    <div className="relative rounded-md border bg-card p-4">
      <div className="flex h-24 flex-col justify-center gap-2">{children}</div>
      {annotation}
    </div>
    <p className="text-xs text-muted-foreground">{caption}</p>
  </div>
);

const Blank = ({ outlined }: { outlined?: boolean }) => (
  <div
    className={cn(
      "h-6 w-full rounded-sm",
      outlined ? "border border-dashed border-amber-500/70 bg-amber-500/5" : "bg-transparent",
    )}
  />
);

export const Canvas: Story = {
  name: "The Canvas problem — three blank rectangles",
  render: () => (
    <div className="min-h-screen bg-background p-10">
      <p className="text-sm font-medium">An author is looking at a blank rectangle</p>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        #623 kept the rule that an absent value falls back to the type default, so a text Element
        bound through an absent Source renders an empty string rather than disappearing. These three
        are indistinguishable today, and only one of them is anybody&rsquo;s fault.
      </p>

      <div className="mt-8 flex flex-wrap gap-8">
        <Artboard caption="Connected to `selected.name`, which is absent. Working exactly as designed.">
          <Blank />
        </Artboard>
        <Artboard caption="Connected to a Variable holding an empty string. Also fine, also blank.">
          <Blank />
        </Artboard>
        <Artboard caption="Connected to a Variable that no longer exists. Broken, and looks identical.">
          <Blank />
        </Artboard>
      </div>

      <p className="mt-10 max-w-3xl text-sm font-medium">Two ways to tell them apart</p>
      <div className="mt-4 flex flex-wrap gap-8">
        <Artboard
          caption="Editor-only outline on any Element resolving to nothing, whatever the cause. Cheap, but marks the two harmless cases as loudly as the broken one."
          annotation={
            <span className="absolute top-1 right-1 text-[10px] text-amber-600">resolves to nothing</span>
          }
        >
          <Blank outlined />
        </Artboard>
        <Artboard
          caption="Say nothing on the Canvas; explain it in the inspector when the Element is selected. Quiet, but only found by an author who already suspects something."
          annotation={
            <div className="mt-3 space-y-1 border-t pt-2 text-[11px]">
              <p className="flex items-center gap-1 text-muted-foreground">
                <LinkIcon className="size-3" /> Content ← selected.Name
              </p>
              <p className="text-muted-foreground">
                <span className="opacity-50">(empty)</span> — `selected` has no value
              </p>
            </div>
          }
        >
          <Blank />
        </Artboard>
        <Artboard
          caption="Only ever mark the broken one. Absence is data and stays silent; a dangling connection is a fault and says so."
          annotation={
            <span className="absolute top-1 right-1 inline-flex items-center gap-1 text-[10px] text-amber-600">
              <CircleAlertIcon className="size-3" /> no such Variable
            </span>
          }
        >
          <Blank outlined />
        </Artboard>
      </div>
    </div>
  ),
};
