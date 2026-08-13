import { LayoutAlignment, LayoutDirection } from "@mechane/domain";
import { Button, cn, DotIcon, Toggle, ToggleGroup } from "@mechane/design-system";
import type { Ref } from "react";

type AlignmentSelectorProps = {
  direction: LayoutDirection;
  alignPrimary: LayoutAlignment;
  alignCounter: LayoutAlignment;
  onChange: (values: { alignPrimary: LayoutAlignment; alignCounter: LayoutAlignment }) => void;
};

const ALIGNMENTS: LayoutAlignment[] = ["start", "center", "end"] as const;

export const AlignmentSelector = ({
  direction,
  alignPrimary,
  alignCounter,
  onChange,
}: AlignmentSelectorProps) => {
  return (
    <ToggleGroup
      className={cn(
        "group/alignment w-full grid grid-rows-3 grid-cols-3 bg-muted/50 rounded-sm p-0 gap-0",
        "**:[i]:bg-foreground **:[i]:rounded-full [--w:2px] [--h:12px]",
        direction === "horizontal"
          ? "**:[i]:w-(--w) **:[i]:h-(--h)"
          : "**:[i]:h-(--w) **:[i]:w-(--h)",
        direction === "vertical" && "grid-flow-col-dense",
      )}
      data-direction={direction}
      value={[`${alignPrimary}/${alignCounter}`]}
      onValueChange={([value]) => {
        if (!value) return;
        const [alignPrimary, alignCounter] = value.split("/") as [LayoutAlignment, LayoutAlignment];
        onChange({ alignPrimary, alignCounter });
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <Toggle
          size="sm"
          className="group/button bg-transparent hover:bg-transparent aria-pressed:bg-transparent h-5 p-0 grid grid-cols-1 grid-rows-1 *:items-start nth-of-type-[n+4]:*:items-center nth-of-type-[n+7]:*:items-end"
          key={i}
          data-primary-axis={ALIGNMENTS[i % 3]}
          data-counter-axis={ALIGNMENTS[Math.floor(i / 3)]}
          value={`${ALIGNMENTS[i % 3]}/${ALIGNMENTS[Math.floor(i / 3)]}`}
        >
          <DotIcon className="col-start-1 row-start-1 place-self-center group-aria-pressed/button:opacity-0 group-hover/button:opacity-0" />
          <div className="opacity-0 group-hover/button:opacity-50 group-aria-pressed/button:opacity-100 col-start-1 row-start-1 flex gap-0.5 justify-center place-self-center group-data-[direction=vertical]/alignment:flex-col">
            <i className="[--h:9px]"></i>
            <i className="[--h:12px]"></i>
            <i className="[--h:6px]"></i>
          </div>
        </Toggle>
      ))}
    </ToggleGroup>
  );
};
