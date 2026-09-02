import type { GraphEdge, ShowGraph } from "@mechane/domain";
import {
  navigationProofCanvases,
  navigationProofGraph,
  NAVIGATION_DEVICE_ID,
  NAVIGATION_FLOW_ID,
} from "../navigation-proof/navigation-proof";
import { seedShowData, type SeedShow } from "../../utils/seed-utils";

export const NAVIGATION_AUDIENCE_DEVICE_ID = "device_navigation_audience_demo";

function audienceDriverEdge(): GraphEdge {
  return {
    id: "edge_navigation_audience_demo",
    kind: "device",
    sourceId: NAVIGATION_FLOW_ID,
    targetId: NAVIGATION_AUDIENCE_DEVICE_ID,
    sourcePath: [],
    targetPath: [],
  };
}

export function navigationAudienceGraph(): ShowGraph {
  const source = navigationProofGraph();
  const sharedDevice = source.nodes.find((node) => node.id === NAVIGATION_DEVICE_ID);
  if (sharedDevice?.kind !== "device") {
    throw new Error("Navigation Proof shared Device is missing.");
  }
  return {
    ...source,
    nodes: [
      ...source.nodes.filter((node) => node.kind !== "device"),
      {
        ...sharedDevice,
        id: NAVIGATION_AUDIENCE_DEVICE_ID,
        name: "Navigation Audience",
        perConnection: true,
        pairingCode: null,
      },
    ],
    edges: [...source.edges.filter((edge) => edge.kind !== "device"), audienceDriverEdge()],
  };
}

async function seedNavigationAudience(showId: string): Promise<void> {
  await seedShowData(showId, navigationAudienceGraph, navigationProofCanvases);
}

export const seedShow = {
  name: "Navigation Audience",
  seed: seedNavigationAudience,
} satisfies SeedShow;
