import type { FormulaScope } from "@mechane/domain";
import { lazy, Suspense } from "react";

const FormulaCodeEditor = lazy(() => import("./FormulaCodeEditor"));

export interface FormulaEditorProps {
  value: string;
  scope: FormulaScope;
  onChange(value: string): void;
  placeholder?: string;
  className?: string;
}

export function FormulaEditor(props: FormulaEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[4.5rem] rounded-sm border border-input bg-background p-2 font-mono text-xs text-muted-foreground">
          Loading Formula editor…
        </div>
      }
    >
      <FormulaCodeEditor {...props} />
    </Suspense>
  );
}
