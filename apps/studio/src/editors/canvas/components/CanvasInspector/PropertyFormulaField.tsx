import {
  Button,
  cn,
  Trash2Icon,
  XIcon,
  type LucideIcon,
  type PropertyInputMenuItem,
} from "@mechane/design-system";
import type { Element } from "@mechane/domain/canvas";
import {
  analyse,
  previewText,
  type FormulaAnalysis,
  type FormulaScope,
} from "@mechane/domain/formula";
import type { PropertyFormula } from "@mechane/domain/property-values";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { FormulaEditor } from "../../../show/graph/formula/FormulaEditor";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";

const FLYOUT_WIDTH = 420;
const GUTTER = 12;
const WRITE_A_FORMULA = "write-a-formula";

/** How one Property reads, writes and displays a Formula on each selected Element. */
export interface PropertyFormulaBinding {
  readonly label: string;
  readonly icon?: LucideIcon | string;
  readonly scope: FormulaScope;
  formulaOf(element: Element): PropertyFormula | null;
  /** The text an author edits for a stored Formula. */
  sourceOf(formula: PropertyFormula): string;
  /** What the row reads at rest: what the Artboard renders for this Formula. */
  restingText(formula: PropertyFormula, analysis: FormulaAnalysis): string;
  /** Suffix the `=` line appends to a draft's result, such as a size's `%`. */
  resultSuffix?(source: string): string;
  /** Properties that make this Element's Property the Formula `source`, keeping its own fallback. */
  write(element: Element, source: string): Record<string, unknown>;
  /** Properties that put this Element's retained literal back. */
  remove(element: Element, formula: PropertyFormula): Record<string, unknown>;
}

/** Wires Formula entry into the ordinary `PropertyInput` while the Property is a literal. */
export interface PropertyFormulaEntry {
  readonly menuItems: readonly PropertyInputMenuItem[];
  onMenuItemSelect(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement>): void;
}

type Session = { readonly selectionKey: string; readonly draft: string };

/**
 * A Property row that can carry a Formula (#711 Variant D, #733). Typing `=` over
 * the whole entry or choosing *Write a Formula* opens a flyout beside the
 * sidebar; the draft commits on Enter or blur as one edit, so the Artboard
 * recomputes once. At rest the row keeps its icon, badged, and reads the result.
 */
export function PropertyFormulaField({
  binding,
  className,
  children,
}: {
  binding: PropertyFormulaBinding;
  className?: string;
  children(entry: PropertyFormulaEntry): ReactNode;
}) {
  const { selected, update, updateElements } = useCanvasInspectorContext();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const selectionKey = selected.map((element) => element.id).join("|");
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const open = session?.selectionKey === selectionKey;

  const carriers = selected.flatMap((element) => {
    const formula = binding.formulaOf(element);
    return formula ? [{ element, formula }] : [];
  });
  const sources = [...new Set(carriers.map(({ formula }) => binding.sourceOf(formula)))];
  const everyElementCarries = carriers.length === selected.length;
  const mixed = sources.length > 1 || (carriers.length > 0 && !everyElementCarries);
  const source = !mixed ? (sources[0] ?? null) : null;
  const first = carriers[0]?.formula ?? null;
  const analysis = source === null ? null : analyse(source, binding.scope);
  const blocking = analysis?.diagnostics.find((diagnostic) => diagnostic.severity === "blocking");

  const write = (updates: readonly { element: Element; properties: Record<string, unknown> }[]) => {
    if (updateElements) {
      if (updates.length > 0)
        updateElements(
          updates.map(({ element, properties }) => ({ elementId: element.id, properties })),
        );
    } else if (updates[0]) {
      update(updates[0].properties);
    }
  };
  const removal = () =>
    carriers.map(({ element, formula }) => ({
      element,
      properties: binding.remove(element, formula),
    }));
  const writeSource = (next: string) =>
    write(selected.map((element) => ({ element, properties: binding.write(element, next) })));

  const begin = (draft = source ?? "") => {
    const next = { selectionKey, draft };
    sessionRef.current = next;
    setSession(next);
  };

  const finish = (commit: boolean) => {
    const current = sessionRef.current;
    if (!current || current.selectionKey !== selectionKey) return;
    sessionRef.current = null;
    setSession(null);
    if (!commit || mixed) return;
    if (current.draft.trim() === "") write(removal());
    else if (!everyElementCarries || current.draft !== source) writeSource(current.draft);
  };

  const remove = () => {
    sessionRef.current = null;
    setSession(null);
    write(removal());
  };

  const replaceAll = () => {
    const replacement = sources[0];
    if (replacement === undefined) return;
    writeSource(replacement);
    begin(replacement);
  };

  const entry: PropertyFormulaEntry = {
    menuItems: [{ value: WRITE_A_FORMULA, label: "Write a Formula", icon: <FormulaGlyph /> }],
    onMenuItemSelect(value) {
      if (value === WRITE_A_FORMULA) begin();
    },
    onKeyDown(event) {
      if (event.key !== "=") return;
      const input = event.currentTarget;
      const wholeEntry =
        input.value === "" ||
        (input.selectionStart === 0 && input.selectionEnd === input.value.length);
      if (!wholeEntry) return;
      event.preventDefault();
      begin("");
    },
  };

  const restingText = mixed
    ? everyElementCarries
      ? `${sources.length} Formulas`
      : "Mixed"
    : first && analysis
      ? binding.restingText(first, analysis)
      : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div ref={anchorRef} className="min-w-0">
        {carriers.length > 0 || open ? (
          <button
            type="button"
            aria-label={`${binding.label} Formula`}
            aria-expanded={open}
            title={source ?? undefined}
            className={cn(
              "flex h-7 w-full min-w-0 items-center rounded-sm bg-muted/50 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              open && "ring-1 ring-ring/40",
              blocking && "ring-1 ring-destructive",
            )}
            onClick={() => {
              if (!open) begin();
            }}
          >
            <BadgedPropertyIcon icon={binding.icon} blocked={blocking !== undefined} />
            <span
              className={cn(
                "min-w-0 flex-1 truncate px-1 text-sm",
                restingText === null && "text-muted-foreground",
                blocking && "text-destructive",
              )}
            >
              {restingText ?? "New Formula"}
            </span>
          </button>
        ) : (
          children(entry)
        )}
      </div>
      {blocking ? (
        <p role="alert" className="text-xs text-destructive">
          {blocking.message}
        </p>
      ) : null}
      {open && session ? (
        <FormulaFlyout
          anchorRef={anchorRef}
          binding={binding}
          draft={session.draft}
          mixed={mixed}
          sources={sources}
          carriers={carriers.length}
          selectionCount={selected.length}
          onDraftChange={(draft) => begin(draft)}
          onFinish={finish}
          onRemove={remove}
          onReplaceAll={replaceAll}
        />
      ) : null}
    </div>
  );
}

function FormulaFlyout({
  anchorRef,
  binding,
  draft,
  mixed,
  sources,
  carriers,
  selectionCount,
  onDraftChange,
  onFinish,
  onRemove,
  onReplaceAll,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  binding: PropertyFormulaBinding;
  draft: string;
  mixed: boolean;
  sources: readonly string[];
  carriers: number;
  selectionCount: number;
  onDraftChange(draft: string): void;
  onFinish(commit: boolean): void;
  onRemove(): void;
  onReplaceAll(): void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const position = useFlyoutPosition(anchorRef);
  const analysis = draft.trim() === "" ? null : analyse(draft, binding.scope);

  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (isInside(event.target, panelRef, anchorRef)) return;
      finishRef.current(true);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [anchorRef]);

  const close = (commit: boolean) => {
    onFinish(commit);
    // The row re-renders once the session ends; focus whichever control it became.
    requestAnimationFrame(() =>
      anchorRef.current?.querySelector<HTMLElement>("button, input")?.focus(),
    );
  };

  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`${binding.label} Formula`}
      style={{ top: position.top, left: position.left, width: FLYOUT_WIDTH }}
      className="fixed z-50 flex flex-col gap-2 rounded-lg bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-foreground/10"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // The flyout owns Escape; the Canvas would otherwise read it as "clear selection".
        event.preventDefault();
        event.stopPropagation();
        close(false);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !isInside(event.relatedTarget, panelRef, anchorRef))
          onFinish(true);
      }}
    >
      <div className="flex items-center gap-2">
        <FormulaGlyph />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{binding.label}</span>
        <span className="text-xs text-muted-foreground">
          {selectionCount === 1 ? "1 Element" : `${selectionCount} Elements`}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close the Formula editor"
          onClick={() => close(true)}
        >
          <XIcon />
        </Button>
      </div>
      {mixed ? (
        <MixedFormulas
          sources={sources}
          carriers={carriers}
          selectionCount={selectionCount}
          onReplaceAll={onReplaceAll}
        />
      ) : (
        <>
          <FormulaEditor
            autoFocus
            value={draft}
            scope={binding.scope}
            onChange={onDraftChange}
            onSubmit={() => close(true)}
          />
          <ResultLine analysis={analysis} suffix={binding.resultSuffix?.(draft) ?? ""} />
          <DiagnosticsList analysis={analysis} />
          <ReadingNow scope={binding.scope} />
        </>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {mixed ? null : "Enter applies · Esc cancels"}
        </span>
        {carriers > 0 ? (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
            <Trash2Icon /> Remove Formula
          </Button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Beside its row and clear of the sidebar; the sidebar's own layout never moves. */
function useFlyoutPosition(anchorRef: RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      // Clear of the sidebar, not just the row: an H row's flyout must not cover W.
      const column = (
        anchor.closest("[data-slot=sidebar-inner]") ?? anchor
      ).getBoundingClientRect();
      const left =
        column.left - FLYOUT_WIDTH - GUTTER >= GUTTER
          ? column.left - FLYOUT_WIDTH - GUTTER
          : Math.min(column.right + GUTTER, window.innerWidth - FLYOUT_WIDTH - GUTTER);
      setPosition({ top: Math.max(GUTTER, Math.min(rect.top, window.innerHeight - 320)), left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);
  return position;
}

/** CodeMirror portals completion and lint tooltips to the body; they belong to the flyout. */
function isInside(
  target: EventTarget | null,
  panelRef: RefObject<HTMLDivElement | null>,
  anchorRef: RefObject<HTMLDivElement | null>,
): boolean {
  if (!(target instanceof Node)) return false;
  if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return true;
  const element = target instanceof HTMLElement ? target : target.parentElement;
  return Boolean(element?.closest(".cm-tooltip"));
}

function FormulaGlyph() {
  return (
    <span
      aria-hidden="true"
      className="w-4 text-center font-mono text-[0.65rem] font-semibold italic tracking-tight text-primary"
    >
      fx
    </span>
  );
}

/** The Property keeps its own icon and carries a dot saying it is computed. */
function BadgedPropertyIcon({ icon, blocked }: { icon?: LucideIcon | string; blocked: boolean }) {
  const Icon = typeof icon === "string" || icon === undefined ? null : icon;
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center select-none">
      {Icon ? (
        <Icon aria-hidden="true" className="size-4" />
      ) : (
        <span aria-hidden="true">{typeof icon === "string" ? icon : null}</span>
      )}
      <span
        aria-hidden="true"
        data-slot="formula-badge"
        className={cn(
          "absolute top-1 right-1 size-1.5 rounded-full ring-1 ring-background",
          blocked ? "bg-destructive" : "bg-primary",
        )}
      />
    </span>
  );
}

function ResultLine({ analysis, suffix }: { analysis: FormulaAnalysis | null; suffix: string }) {
  const value = analysis?.value ?? null;
  const present = value !== null && value.kind !== "absent" && value.kind !== "failure";
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
      <span className="font-mono text-xs text-muted-foreground">=</span>
      <span
        className={cn(
          "truncate text-xs",
          analysis?.blocked ? "text-destructive" : "text-foreground",
        )}
      >
        {analysis?.blocked
          ? "can't be evaluated yet"
          : `${previewText(value)}${present ? suffix : ""}`}
      </span>
    </div>
  );
}

function DiagnosticsList({ analysis }: { analysis: FormulaAnalysis | null }) {
  if (!analysis?.diagnostics.length) return null;
  return (
    <ul className="space-y-1">
      {analysis.diagnostics.map((diagnostic, index) => (
        <li
          key={`${diagnostic.category}-${diagnostic.from}-${index}`}
          className={cn(
            "text-xs leading-snug",
            diagnostic.severity === "blocking" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {diagnostic.message}
          <span className="ml-1 opacity-60">
            · {diagnostic.severity === "blocking" ? "blocks publishing" : "right now"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReadingNow({ scope }: { scope: FormulaScope }) {
  const entries = [...(scope.itemBinding ? [scope.itemBinding] : []), ...scope.ports];
  return (
    <div className="space-y-1 text-xs">
      <span className="font-medium">Reading now</span>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">This Scene has no Variables to read.</p>
      ) : (
        <ul className="space-y-0.5 text-muted-foreground">
          {entries.map((entry) => (
            <li key={entry.name} className="truncate">
              <span className="font-mono text-foreground">{entry.name}</span>:{" "}
              {previewText(entry.value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mixed opens no editor: a controlled editor handed one Formula would overwrite the rest. */
function MixedFormulas({
  sources,
  carriers,
  selectionCount,
  onReplaceAll,
}: {
  sources: readonly string[];
  carriers: number;
  selectionCount: number;
  onReplaceAll(): void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {carriers === selectionCount
          ? `${sources.length} different Formulas across this selection.`
          : `${carriers} of ${selectionCount} Elements carry a Formula.`}
      </p>
      <ul className="space-y-0.5">
        {sources.map((source) => (
          <li key={source} className="truncate font-mono text-xs text-foreground">
            = {source}
          </li>
        ))}
      </ul>
      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onReplaceAll}>
        Replace all with the first
      </Button>
    </div>
  );
}
