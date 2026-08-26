import { CheckIcon, Pencil, XIcon } from "lucide-react";
import { PropsWithChildren, useEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./ui/input-group";

export interface EditableNameProps {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  onStartEditing?(): void;
  onCommit(value: string): void;
  onCancel?(): void;
}

export function EditableName({
  value,
  placeholder,
  ariaLabel = "Name",
  className,
  children,
  onStartEditing,
  onCommit,
  onCancel,
}: PropsWithChildren<EditableNameProps>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const editingRef = useRef(false);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(value);
  }, [value]);

  const beginEditing = () => {
    if (editingRef.current) return;
    editingRef.current = true;
    cancelBlurRef.current = false;
    setDraft(value);
    setEditing(true);
    onStartEditing?.();
  };

  const finishEditing = (commit: boolean, nextValue: string) => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    if (commit) onCommit(nextValue);
    else onCancel?.();
  };

  return (
    <span className={cn("group/name inline-flex h-8 w-full min-w-0 flex-1", className)}>
      <InputGroup
        className={cn(
          "min-w-0 flex-1 rounded-sm -ml-1",
          editing ? "bg-input/30" : "border-transparent bg-transparent dark:bg-transparent",
        )}
      >
        {editing ? (
          <InputGroupInput
            autoFocus
            aria-label={ariaLabel}
            className="h-full min-w-0 pr-0 pl-1 py-1 text-sm font-medium"
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onBlur={(event) => {
              if (cancelBlurRef.current) {
                cancelBlurRef.current = false;
                finishEditing(false, event.currentTarget.value);
                return;
              }
              finishEditing(true, event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                cancelBlurRef.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="flex h-full min-w-0 flex-1 items-center truncate pr-0 pl-1 text-sm font-medium">
            {value || placeholder}
          </span>
        )}
        <InputGroupAddon align="inline-end" className="py-0 px-1! gap-0">
          {editing ? (
            <>
              <InputGroupButton
                size="icon-xs"
                aria-label={`Save ${ariaLabel.toLowerCase()}`}
                title={`Save ${ariaLabel.toLowerCase()}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => finishEditing(true, draft)}
              >
                <CheckIcon aria-hidden="true" />
              </InputGroupButton>
              <InputGroupButton
                size="icon-xs"
                aria-label={`Cancel editing ${ariaLabel.toLowerCase()}`}
                title={`Cancel editing ${ariaLabel.toLowerCase()}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => finishEditing(false, draft)}
              >
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </>
          ) : (
            <>
              <InputGroupButton
                size="icon-xs"
                aria-label={`Edit ${ariaLabel.toLowerCase()}`}
                title={`Edit ${ariaLabel.toLowerCase()}`}
                className="pointer-events-none opacity-0 transition-opacity group-hover/name:pointer-events-auto group-hover/name:opacity-100 group-focus-within/name:pointer-events-auto group-focus-within/name:opacity-100"
                onClick={beginEditing}
              >
                <Pencil aria-hidden="true" />
              </InputGroupButton>
            </>
          )}
        </InputGroupAddon>
        {children}
      </InputGroup>
    </span>
  );
}
