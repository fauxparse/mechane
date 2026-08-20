import { LayoutAlignment, LayoutDirection } from "@mechane/domain";
import { cn, DotIcon, Toggle, ToggleGroup } from "@mechane/design-system";

type AlignmentSelectorProps = {
  className?: string;
  direction: LayoutDirection;
  alignPrimary: LayoutAlignment;
  alignCounter: LayoutAlignment;
  auto?: boolean;
  onChange: (values: { alignPrimary?: LayoutAlignment; alignCounter?: LayoutAlignment }) => void;
};

const ALIGNMENTS: LayoutAlignment[] = ["start", "center", "end"] as const;

export const AlignmentSelector = ({
  className,
  direction,
  alignPrimary,
  alignCounter,
  auto = false,
  onChange,
}: AlignmentSelectorProps) => {
  const changed = ([value]: string[]) => {
    if (!value) return;

    if (auto) {
      const [alignCounter] = value.split("/") as [LayoutAlignment];
      onChange({ alignCounter });
    } else {
      const [alignPrimary, alignCounter] = value.split("/") as [LayoutAlignment, LayoutAlignment];
      onChange({ alignPrimary, alignCounter });
    }
  };

  return (
    <ToggleGroup
      className={cn(
        "group/alignment w-full min-w-20 h-16 grid grid-rows-3 grid-cols-3 bg-muted/50 rounded-sm p-0 gap-0",
        "**:[i]:bg-foreground **:[i]:rounded-full [--w:2px] [--h:12px]",
        direction === "horizontal"
          ? "**:[i]:w-(--w) **:[i]:h-(--h)"
          : "**:[i]:h-(--w) **:[i]:w-(--h)",
        direction === "vertical" && "grid-flow-col-dense",
        className,
      )}
      data-direction={direction}
      value={auto ? [alignCounter] : [`${alignPrimary}/${alignCounter}`]}
      onValueChange={changed}
    >
      {Array.from({ length: 9 }).map((_, i) =>
        !auto || i % 3 === 0 ? (
          <Toggle
            key={i}
            size="sm"
            className={cn(
              "group/button min-w-0 border-0 bg-transparent hover:bg-transparent aria-pressed:bg-transparent h-5 p-0 grid",
              auto
                ? [
                    direction === "horizontal"
                      ? "col-span-3 grid-cols-subgrid *:row-start-1 *:col-start-1 *:col-span-3 *:grid-cols-subgrid"
                      : "row-span-3 grid-rows-subgrid *:col-start-1 *:row-start-1 *:row-span-3 *:grid-rows-subgrid",
                    "*:items-start nth-of-type-2:*:items-center nth-of-type-3:*:items-end",
                  ]
                : "*:row-start-1 *:col-start-1 *:row-span-1 *:col-span-1 *:gap-0.5 *:items-start nth-of-type-[n+4]:*:items-center nth-of-type-[n+7]:*:items-end",
            )}
            title={`Counter: ${ALIGNMENTS[Math.floor(i / 3)]}`}
            value={
              auto
                ? ALIGNMENTS[Math.floor(i / 3)]
                : `${ALIGNMENTS[i % 3]}/${ALIGNMENTS[Math.floor(i / 3)]}`
            }
          >
            <div className="grid items-center justify-items-center">
              {Array.from({ length: auto ? 3 : 1 }).map((_, j) => (
                <DotIcon
                  key={j}
                  className="place-self-center opacity-25 group-aria-pressed/button:opacity-0 group-hover/button:opacity-0"
                />
              ))}
            </div>
            <div
              className={cn(
                auto
                  ? "grid"
                  : "flex justify-center place-self-center group-data-[direction=vertical]/alignment:flex-col",
                "justify-items-center opacity-0 group-hover/button:opacity-50 group-aria-pressed/button:opacity-100",
              )}
            >
              <i className="[--h:9px]"></i>
              <i className="[--h:12px]"></i>
              <i className="[--h:6px]"></i>
            </div>
          </Toggle>
        ) : null,
      )}
    </ToggleGroup>
  );
};
