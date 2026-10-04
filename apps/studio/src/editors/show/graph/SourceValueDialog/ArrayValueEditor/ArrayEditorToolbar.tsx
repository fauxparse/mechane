import { Button, PlusIcon, SearchInput } from "@mechane/design-system";
import type { ReactNode } from "react";

import { pluralize } from "../../../../../utils/pluralize";

type ArrayEditorToolbarProps = {
  /** What one array entry is called, e.g. "record" or "item". */
  noun: string;
  count: number;
  readOnly: boolean;
  query: string;
  setQuery(value: string): void;
  onAdd(): void;
  /** Controls placed between the filter and the add button. */
  children?: ReactNode;
};

export function ArrayEditorToolbar({
  noun,
  count,
  readOnly,
  query,
  setQuery,
  onAdd,
  children,
}: ArrayEditorToolbarProps) {
  return (
    <div className="flex flex-col px-4 gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchInput
        className="h-8! max-h-8"
        placeholder={`Filter ${pluralize(noun, count)}`}
        value={query}
        onValueChange={setQuery}
      />
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button size="sm" onClick={onAdd} disabled={readOnly}>
          <PlusIcon /> Add {noun}
        </Button>
      </div>
    </div>
  );
}
