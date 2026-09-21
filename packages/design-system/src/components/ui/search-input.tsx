import useMergedRef from "@react-hook/merged-ref";
import { SearchIcon, XIcon } from "lucide-react";
import { Ref, useRef } from "react";
import { cn } from "../../lib/utils";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";

type SearchInputProps = {
  className?: string;
  placeholder?: string;
  value: string;
  ref?: Ref<HTMLInputElement>;
  onValueChange: (value: string) => void;
};

export const SearchInput = ({
  className,
  placeholder = "Search…",
  value,
  ref: passedRef,
  onValueChange,
}: SearchInputProps) => {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = useMergedRef(passedRef ?? null, ownRef);

  return (
    <InputGroup className={cn("rounded-full bg-muted/50 border-0 w-60", className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        ref={ref}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end" className="size-8 p-1 mr-0!">
        <InputGroupButton
          className={cn("rounded-full size-6", !value && "invisible pointer-events-none")}
          aria-label="Clear search"
          inert={!value}
          tabIndex={value ? undefined : -1}
          onClick={() => {
            onValueChange("");
            ownRef.current?.focus();
          }}
        >
          <XIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
};
