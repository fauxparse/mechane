import { SidebarHeader, SquareDashedIcon } from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain";
import { useMemo } from "react";
import { pluralize } from "../../../../utils/pluralize";
import { NODE_KIND_META, nodeIcon } from "../node-kinds";

type HeaderProps = {
  selected: GraphNode[];
};

function common<T>(selected: GraphNode[], get: (node: GraphNode) => T): T | null {
  const values = Array.from(new Set(selected.map(get)));
  return values.length === 1 ? (values[0] as T) : null;
}

export const Header = ({ selected }: HeaderProps) => {
  const { Icon, label, name } = useMemo(() => {
    if (selected.length === 0) return { Icon: null, label: "" };

    const kind = common(selected, (node) => node.kind);
    const perConnection = common(selected, (node) =>
      node.kind === "device" ? node.perConnection : false,
    );
    const sourceType = common(selected, (node) =>
      node.kind === "source" && typeof node.type === "string" ? node.type : undefined,
    );

    const Icon = kind
      ? nodeIcon(kind, {
          perConnection: perConnection ?? false,
          sourceType: sourceType ?? undefined,
        })
      : SquareDashedIcon;

    const name = selected.length === 1 ? selected[0]!.name : null;

    const label =
      perConnection && kind === "device"
        ? "audience device"
        : kind
          ? NODE_KIND_META[kind].label
          : "node";

    return { Icon, label, name };
  }, [selected]);

  if (!Icon) return null;

  return (
    <SidebarHeader>
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="truncate grow">{name ?? pluralize(label, selected.length)}</span>
      </div>
    </SidebarHeader>
  );
};
