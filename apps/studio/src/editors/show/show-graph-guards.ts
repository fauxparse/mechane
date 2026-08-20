import type { GraphNode } from "@mechane/domain";

export function moveOutOfFlowDisabledReason(selectedNodes: GraphNode[]): string | undefined {
  if (selectedNodes.length === 0) return "select a Flow-local node first";
  if (selectedNodes.some((node) => node.parentId === null)) {
    return "select only Flow-local nodes";
  }
  return undefined;
}

export function moveIntoFlowDisabledReason(selectedNodes: GraphNode[]): string | undefined {
  const flows = selectedNodes.filter((node) => node.kind === "flow");
  if (flows.length === 0) return "select a Flow and top-level nodes";
  if (flows.length > 1) return "select only one Flow";
  const nodes = selectedNodes.filter((node) => node.kind !== "flow");
  if (nodes.length === 0) return "select at least one top-level node";
  if (nodes.some((node) => node.parentId !== null))
    return "move nested nodes out of their Flow first";
  if (nodes.some((node) => node.kind === "device")) return "Devices cannot be moved into a Flow";
  return undefined;
}
