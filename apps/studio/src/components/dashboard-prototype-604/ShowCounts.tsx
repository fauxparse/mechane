// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// "Replace wording with icons for the count info." Spelling out "4 Scenes · 2
// Devices · 1 Sources" cost three lines of wrap in a narrow column and said
// nothing the icon does not.
//
// The icons come from the Show graph's own `NODE_KIND_META`, so a count wears
// the same mark as the node it counts and the two cannot drift apart. The
// label survives as the title and as screen-reader text, so the row stays
// readable to anyone who does not yet know the icons.
import { cn } from "@mechane/design-system";

import { NODE_KIND_META } from "../../editors/show/graph/node-kinds";

export interface ShowCountsProps {
  counts: {
    readonly scenes: number;
    readonly devices: number;
    readonly sources: number;
  };
  /** Renders placeholders rather than a row of zeroes while the graph loads. */
  pending?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Count field paired with the node kind it counts, for icon and label. */
const COUNTED_KINDS = [
  ["scenes", "scene"],
  ["devices", "device"],
  ["sources", "source"],
] as const;

export function ShowCounts({ counts, pending, size = "sm", className }: ShowCountsProps) {
  return (
    <ul className={cn("flex items-center", size === "sm" ? "gap-2.5" : "gap-3.5", className)}>
      {COUNTED_KINDS.map(([field, kind]) => {
        const meta = NODE_KIND_META[kind];
        const Icon = meta.icon;
        const value = counts[field];
        const label = value === 1 ? meta.label : `${meta.label}s`;
        return (
          <li
            key={field}
            className="flex items-center gap-1 text-muted-foreground"
            title={`${value} ${label}`}
          >
            <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
            <span className="tabular-nums">{pending ? "–" : value}</span>
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
