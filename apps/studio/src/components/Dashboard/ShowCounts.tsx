// What a Show contains, as icons rather than prose (issue #604). Spelling out
// "4 Scenes · 2 Devices · 1 Sources" cost three lines of wrap in a narrow
// column and said nothing the icon does not.
//
// The icons come from the Show graph's own `NODE_KIND_META`, so a count wears
// the same mark as the node it counts and the two cannot drift apart. The
// label survives as the title and as screen-reader text, so the row stays
// readable to anyone who does not yet know the icons.
import { cn } from "@mechane/design-system";

import { NODE_KIND_META } from "../../editors/show/graph/node-kinds";
import type { ShowCounts as Counts } from "./use-show-dossier";

export interface ShowCountsProps {
  counts: Counts;
  pending?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/** Each count field paired with the node kind it counts, for icon and label. */
const COUNTED_KINDS = [
  ["scenes", "scene"],
  ["devices", "device"],
  ["sources", "source"],
] as const;

export function ShowCounts({ counts, pending, size = "sm", className }: ShowCountsProps) {
  return (
    <ul
      className={cn(
        "flex items-center",
        size === "sm" ? "gap-3 text-xs" : "gap-4 text-sm",
        className,
      )}
      data-size={size}
    >
      {COUNTED_KINDS.map(([field, kind]) => {
        const meta = NODE_KIND_META[kind];
        const Icon = meta.icon;
        const value = counts[field];
        const label = value === 1 ? meta.label : `${meta.label}s`;
        return value === 0 ? null : (
          <li
            key={field}
            className="flex items-center gap-2 text-muted-foreground"
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
