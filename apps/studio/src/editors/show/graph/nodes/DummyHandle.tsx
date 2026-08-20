import type { HandleProps } from "@xyflow/react";

import { cn } from "@mechane/design-system";

import { HANDLE_CLASS } from "../handle-styles";

export function DummyHandle({ id, position }: HandleProps) {
  return (
    <div
      className={cn(HANDLE_CLASS, "react-flow__handle", `react-flow__handle-${position}`)}
      data-id={id}
      data-position={position}
    />
  );
}
