import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import type { EventBinding } from "@mechane/domain/interactions";
import { useState } from "react";
import { useCanvasInspectorContext } from "./CanvasInspectorContext";

export function InteractionValues({ binding }: { binding: EventBinding }) {
  const { cues = [], cueValueSources = [], onPassCueValue } = useCanvasInspectorContext();
  const [error, setError] = useState<string | null>(null);
  const cue = cues.find((candidate) => candidate.id === binding.cueId);
  if (!cue || !onPassCueValue) return null;
  const pass = (index: string, parameterId?: string) => {
    const value = cueValueSources[Number(index)];
    if (!value) return;
    try {
      onPassCueValue(binding.id, value, parameterId);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Cannot pass this value.");
    }
  };
  return (
    <div className="col-span-full grid gap-2 pl-5">
      {(cue.parameters ?? []).map((parameter) => {
        const mapping = binding.parameterMappings?.find(
          (mapping) => mapping.parameterId === parameter.id,
        );
        const current = cueValueSources.findIndex(
          (value) => JSON.stringify(value.source) === JSON.stringify(mapping?.source),
        );
        return (
          <div
            key={parameter.id}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2"
          >
            <span className="text-xs text-muted-foreground">{parameter.name}</span>
            <Select
              value={current < 0 ? null : String(current)}
              onValueChange={(value) => {
                if (value !== null) pass(value, parameter.id);
              }}
            >
              <SelectTrigger aria-label={`Value for ${parameter.name}`}>
                <SelectValue placeholder="Choose a value">
                  {current < 0
                    ? undefined
                    : cueValueSources[current]?.source.kind === "runtimeItem"
                      ? `Current item · ${cueValueSources[current]?.name}`
                      : cueValueSources[current]?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {cueValueSources.map(
                  (value, index) =>
                    JSON.stringify(value.type) === JSON.stringify(parameter.type) && (
                      <SelectItem key={JSON.stringify(value)} value={String(index)}>
                        {value.source.kind === "runtimeItem"
                          ? `Current item · ${value.name}`
                          : value.name}
                      </SelectItem>
                    ),
                )}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      <Select
        value={null}
        onValueChange={(value) => {
          if (value !== null) pass(value);
        }}
      >
        <SelectTrigger aria-label={`Pass value to ${cue.name}`}>
          <SelectValue placeholder="Pass a value…" />
        </SelectTrigger>
        <SelectContent>
          {cueValueSources.map((value, index) => (
            <SelectItem key={JSON.stringify(value)} value={String(index)}>
              {value.source.kind === "runtimeItem" ? `Current item · ${value.name}` : value.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
