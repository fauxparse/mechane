// PROTOTYPE (issue #711) — the pieces every variant shows, so the variants
// disagree about *where* a Formula is authored and nothing else.
import { Button, cn, TriangleAlertIcon } from "@mechane/design-system";
import { previewText, type FormulaAnalysis } from "@mechane/domain";

import type { ScopeEntry } from "./property-scope";

/** The mark that says "this Property is computed". `fx`, because spreadsheets. */
export function FormulaGlyph({ blocked, className }: { blocked?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "font-mono text-[0.65rem] font-semibold italic tracking-tight",
        blocked ? "text-destructive" : "text-accent-foreground",
        className,
      )}
    >
      fx
    </span>
  );
}

export function ResultLine({ analysis }: { analysis: FormulaAnalysis | null }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-2">
      <span className="font-mono text-xs text-muted-foreground">=</span>
      <span
        className={cn(
          "truncate text-xs",
          analysis?.blocked ? "text-destructive" : "text-foreground",
        )}
      >
        {analysis?.blocked ? "can't be evaluated yet" : previewText(analysis?.value ?? null)}
      </span>
    </div>
  );
}

/**
 * #672's two severities, worded as #675 settled them. Blocking is destructive;
 * a runtime failure is muted, because it is a fact about now, not a mistake.
 */
export function DiagnosticsList({ analysis }: { analysis: FormulaAnalysis | null }) {
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

export function ReadingNow({ entries }: { entries: readonly ScopeEntry[] }) {
  return (
    <div className="space-y-1 text-xs">
      <span className="font-medium">Reading now</span>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">This Scene has no Variables to read.</p>
      ) : (
        <ul className="space-y-0.5 text-muted-foreground">
          {entries.map((entry) => (
            <li key={entry.identifier} className="truncate">
              <span className="font-mono text-foreground">{entry.identifier}</span>
              {entry.identifier === entry.label ? null : (
                <span className="opacity-60"> ({entry.label})</span>
              )}
              : {previewText(entry.value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A destructive marker for a row whose editor is shut. */
export function BlockedMark({ message }: { message: string }) {
  return (
    <span title={message} className="flex items-center text-destructive">
      <TriangleAlertIcon className="size-3.5" />
    </span>
  );
}

/**
 * The Mixed state. Every variant refuses to open an editor here, and offers
 * the one destructive act explicitly instead.
 */
export function MixedFormulas({
  sources,
  onReplaceAll,
}: {
  sources: readonly string[];
  onReplaceAll(): void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {sources.length} different Formulas across this selection.
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
