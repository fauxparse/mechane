import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ShapeValue } from "@mechane/domain";

import { Button } from "../button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../input-group";
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
  const listId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const activeIndex =
    variables.length === 0 ? -1 : Math.min(highlightedIndex, variables.length - 1);

  useEffect(() => {
    setHighlightedIndex(variables.length > 0 ? 0 : -1);
  }, [query, variables.length]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (variables.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(index + 1, variables.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(variables.length - 1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      const activeVariable = variables[activeIndex];
      if (!activeVariable) return;
      event.preventDefault();
      onSelect(activeVariable);
    }
  };

  return (
    <>
      <InputGroup className="rounded-none border-0 border-b border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:ring-0">
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          id={`${listId}-input`}
          type="search"
          role="combobox"
          placeholder="Search…"
          aria-label="Search variables"
          aria-controls={`${listId}-list`}
          aria-expanded="true"
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          value={query}
          onChange={(event) => {
            setHighlightedIndex(0);
            onQueryChange(event.target.value);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Close variable picker" onClick={onClose}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <div
        id={`${listId}-list`}
        role="listbox"
        aria-label="Variables"
        className="max-h-64 overflow-y-auto p-1"
      >
        {variables.length > 0 ? (
          variables.map((variable, index) => (
            <Button
              key={variable.id}
              id={`${listId}-option-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              variant="ghost"
              size="sm"
              aria-selected={index === activeIndex}
              data-highlighted={index === activeIndex ? "true" : undefined}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              className="w-full justify-start gap-2 aria-selected:bg-accent aria-selected:text-accent-foreground"
              onMouseEnter={() => setHighlightedIndex(index)}
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
      </div>
      {linkedVariable && (
        <div className="flex border-t border-sidebar-border p-2">
          <Button size="sm" variant="outline" className="grow" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      )}
    </>
  );
}
