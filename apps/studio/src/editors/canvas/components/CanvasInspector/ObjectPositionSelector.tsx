import { ObjectPosition } from "@mechane/domain";
import { cn, DotIcon, ImageIcon, Toggle, ToggleGroup } from "@mechane/design-system";
import { upperFirst } from "es-toolkit";

type ObjectPositionSelectorProps = {
  className?: string;
  value?: ObjectPosition;
  onChange: (value: ObjectPosition) => void;
};

const HORIZONTAL_ALIGNMENTS = ["left", "center", "right"] as const;
const VERTICAL_ALIGNMENTS = ["top", "center", "bottom"] as const;

const VALUES: ObjectPosition[] = VERTICAL_ALIGNMENTS.flatMap((vertical) =>
  HORIZONTAL_ALIGNMENTS.map((horizontal) => `${horizontal} ${vertical}` as ObjectPosition),
);

export const ObjectPositionSelector = ({
  className,
  value,
  onChange,
}: ObjectPositionSelectorProps) => {
  const changed = ([value]: string[]) => {
    if (!value) return;
    onChange(value as ObjectPosition);
  };

  const selectedValue =
    value === undefined ? undefined : value === "center" ? "center center" : value;

  return (
    <ToggleGroup
      aria-label={value === undefined ? "Mixed object position" : "Object position"}
      className={cn(
        "group/object-position w-full min-w-20 h-16 grid grid-rows-3 grid-cols-3 bg-muted/50 rounded-sm p-0 gap-0",
        "**:[i]:bg-foreground **:[i]:rounded-full [--w:2px] [--h:12px]",
        className,
      )}
      value={selectedValue ? [selectedValue] : []}
      onValueChange={changed}
    >
      {VALUES.map((value) => (
        <Toggle
          key={value}
          className={cn(
            "group/button min-w-0 border-0 bg-transparent hover:bg-transparent aria-pressed:bg-transparent h-5 p-0 grid",
          )}
          title={upperFirst(value)}
          value={value}
        >
          <DotIcon className="col-start-1 row-start-1 place-self-center opacity-25 group-aria-pressed/button:opacity-0 group-hover/button:opacity-0" />
          <ImageIcon className="col-start-1 row-start-1 w-4 h-4 place-self-center opacity-0 group-hover/button:opacity-50 group-aria-pressed/button:opacity-100" />
        </Toggle>
      ))}
    </ToggleGroup>
  );
};
