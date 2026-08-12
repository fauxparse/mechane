import { SearchIcon, XIcon } from "lucide-react";
import type { ShapeValue } from "@mechane/domain";

import { Button } from "../button";
import { InputGroupAddon, InputGroupButton, InputGroupInput } from "../input-group";
import { getValueText } from "./use-property-input";
import type { VariableReference } from "./property-input-types";

export function VariablePicker<T extends ShapeValue>({
  query,
  variables,
  totalVariables,
  linkedVariable,
  onQueryChange,
  onClose,
  onSelect,
  onDisconnect,
}: {
  query: string;
  variables: VariableReference<T>[];
  totalVariables: number;
  linkedVariable: VariableReference<T> | null;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelect: (variable: VariableReference<T>) => void;
  onDisconnect: () => void;
}) {
  return (
    <>
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        placeholder="Search…"
        aria-label="Search variables"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Close variable picker" onClick={onClose}>
          <XIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <div className="absolute top-full left-0 right-0 z-10 max-h-64 overflow-y-auto bg-popover p-1">
        {variables.length > 0 ? (
          variables.map((variable) => (
            <Button
              key={variable.id}
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => onSelect(variable)}
            >
              <span className="truncate">{variable.name}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {getValueText(variable.current)}
              </span>
            </Button>
          ))
        ) : (
          <div className="flex w-full justify-center py-4 text-center text-sm text-muted-foreground">
            {totalVariables === 0 ? "No variables to connect" : "No matching variables"}
          </div>
        )}
        {linkedVariable && (
          <div className="flex border-t border-sidebar-border p-2">
            <Button size="sm" variant="outline" className="grow" onClick={onDisconnect}>
              Disconnect
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
