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
  if (flows.length === 0) return "select a Flow and the nodes to put in it";
  if (flows.length > 1) return "select only one Flow";
  const flow = flows[0] as GraphNode;
  const nodes = selectedNodes.filter((node) => node.kind !== "flow");
  if (nodes.length === 0) return "select at least one node to move";
  if (nodes.some((node) => node.kind === "device")) return "Devices cannot be moved into a Flow";
  // A node already in that Flow has nowhere to go; one in *another* Flow does,
  // since #508 made moving between Flows a single move.
  if (nodes.every((node) => node.parentId === flow.id)) return "those nodes are already in it";
  return undefined;
}
