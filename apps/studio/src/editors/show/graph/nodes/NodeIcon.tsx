import { VariableTypeIcon } from "@mechane/design-system";
import type { NodeKind } from "@mechane/domain/graph";
import type { Type } from "@mechane/domain/shapes";

import { nodeIcon } from "../node-kinds";

export interface NodeIconProps {
  kind: NodeKind;
  perConnection?: boolean;
  /** A Source's icon reflects the type of data it holds (#35). */
  sourceType?: Type | null;
  className?: string;
}

/** The icon a node shows: `nodeIcon` by kind, except a Source, which goes by data type. */
export function NodeIcon({ kind, perConnection, sourceType, className }: NodeIconProps) {
  if (kind === "source") return <VariableTypeIcon type={sourceType} className={className} />;
  const Icon = nodeIcon(kind, { perConnection });
  return <Icon className={className} />;
}
