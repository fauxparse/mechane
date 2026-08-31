import { BatchSmartSmoothStepEdge } from "./BatchSmartSmoothStepEdge";
import { RoutedSmoothStepEdge } from "./RoutedSmoothStepEdge";

/**
 * Both edges stay registered while #475's self-routing edge is compared
 * against the batch-routed one it replaces. `graph-to-flow` picks which one
 * every edge projects as; nothing here is stored on the graph.
 */
export const showEdgeTypes = {
  smartSmoothStep: BatchSmartSmoothStepEdge,
  routedSmoothStep: RoutedSmoothStepEdge,
};
