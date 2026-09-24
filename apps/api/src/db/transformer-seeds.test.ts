import type { ShowGraph } from "@mechane/domain/graph";
import { describe, expect, it } from "vitest";
import { db } from "./client";
import { runs } from "./schema";
import { setupPostgresTest } from "./test-helpers";
import { readOrCreateTransformerSeeds, reshuffleTransformer } from "./transformer-seeds";

const { showId, createShow } = setupPostgresTest("transformer-seeds-test");
const graph: ShowGraph = {
  nodes: [
    {
      id: "transformer_show_shuffle",
      kind: "transformer",
      name: "Show Shuffle",
      parentId: null,
      position: { x: 0, y: 0 },
      ports: [{ id: "port_show", name: "input", rank: "a" }],
      transform: { kind: "shuffle" },
    },
    {
      id: "transformer_device_shuffle",
      kind: "transformer",
      name: "Device Shuffle",
      parentId: "flow_audience",
      position: { x: 0, y: 0 },
      ports: [{ id: "port_device", name: "input", rank: "a" }],
      transform: { kind: "shuffle" },
    },
  ],
  edges: [],
};

describe("Transformer Shuffle seeds", () => {
  it("persists by owner and reshuffles only the selected root", async () => {
    await createShow();
    const runId = "run_transformer_seeds";
    await db.insert(runs).values({ id: runId, showId });

    const first = await readOrCreateTransformerSeeds(runId, "device_audience", graph, true);
    const second = await readOrCreateTransformerSeeds(runId, "device_audience", graph, true);
    expect(second).toEqual(first);

    await reshuffleTransformer(runId, "transformer_show_shuffle");
    const showReshuffled = await readOrCreateTransformerSeeds(
      runId,
      "device_audience",
      graph,
      true,
    );
    expect(showReshuffled.transformer_show_shuffle).not.toBe(first.transformer_show_shuffle);
    expect(showReshuffled.transformer_device_shuffle).toBe(first.transformer_device_shuffle);

    await reshuffleTransformer(runId, "transformer_device_shuffle", "device_audience");
    const deviceReshuffled = await readOrCreateTransformerSeeds(
      runId,
      "device_audience",
      graph,
      true,
    );
    expect(deviceReshuffled.transformer_show_shuffle).toBe(showReshuffled.transformer_show_shuffle);
    expect(deviceReshuffled.transformer_device_shuffle).not.toBe(
      showReshuffled.transformer_device_shuffle,
    );
  });
});
