import { InputGroup, InputGroupAddon, InputGroupInput } from "../input-group";
import { clamp } from "./color-utils";

export function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <InputGroup className="text-xs p-0 border-transparent bg-muted h-6 rounded-sm not-first:rounded-l-none not-last:rounded-r-none has-[[data-slot=input-group-control]:focus-visible]:ring-0">
      <InputGroupAddon align="inline-start">{label}</InputGroupAddon>
      <InputGroupInput
        aria-label={label}
        className="h-6 min-w-0 p-1 appearance-none rounded text-xs outline-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        min={min}
        max={max}
        step={step}
        type="number"
        onFocus={(event) => event.currentTarget.select()}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clamp(next, min, max));
        }}
      />
    </InputGroup>
  );
}
