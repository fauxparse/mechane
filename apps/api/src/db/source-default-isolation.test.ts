import { CommandStack, composite, setSourceFieldDefault, type GraphEdit } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import { defaultSourceValueTemplates, defaultSourceValues } from "@mechane/domain/source-defaults";
import {
  materializeInstanceState,
  materializeRunState,
  normalizeStructuredValueTemplate,
  type RunState,
} from "@mechane/domain/structured-values";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "./client";
import { readActiveRun, readRunDeviceState, replaceRunState, startRun } from "./runs";
import { runDeviceStates, shows } from "./schema";
import {
  applyShowEdits,
  publishShowGraph,
  readShowGraph,
  setShowAutoPublish,
  writeShowGraph,
} from "./show-graph";
import { setupPostgresTest } from "./test-helpers";

const { showId, createShow } = setupPostgresTest("source-default-isolation");
const profileType = { kind: "shape", shapeId: "shape_profile" } as const;
const profilesType = { kind: "array", of: profileType } as const;

function fixture(): ShowGraph {
  const graph: ShowGraph = {
    shapes: [
      {
        id: "shape_profile",
        name: "Profile",
        fields: [
          { id: "count", name: "Count", type: "number", required: true, defaultValue: 0 },
          {
            id: "nickname",
            name: "Nickname",
            type: "text",
            required: false,
            defaultValue: "Guest",
          },
        ],
      },
    ],
    nodes: [
      {
        id: "flow_main",
        kind: "flow",
        name: "Main",
        position: { x: 0, y: 0 },
        parentId: null,
        defaultSceneId: "scene_main",
      },
      {
        id: "scene_main",
        kind: "scene",
        name: "Main",
        position: { x: 0, y: 0 },
        parentId: "flow_main",
        variables: [],
      },
      {
        id: "device_main",
        kind: "device",
        name: "Shared",
        position: { x: 0, y: 0 },
        parentId: null,
        perConnection: false,
        pairingCode: null,
      },
    ],
    edges: [
      {
        id: "driver_main",
        kind: "device",
        sourceId: "flow_main",
        targetId: "device_main",
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
  for (const scope of ["show", "instance"]) {
    const parentId = scope === "show" ? null : "flow_main";
    for (const [suffix, type] of [
      ["scalar", "number"],
      ["profile", profileType],
      ["alias", profileType],
      ["profiles", profilesType],
    ] as const) {
      graph.nodes.push({
        id: `${scope}_${suffix}`,
        kind: "source",
        name: `${scope} ${suffix}`,
        position: { x: 0, y: 0 },
        parentId,
        type,
      });
    }
  }
  return graph;
}

function liveState(graph: ShowGraph, scope: "show" | "instance"): RunState {
  const templates = defaultSourceValueTemplates(graph);
  const profile = normalizeStructuredValueTemplate(
    { count: 12, nickname: null },
    profileType,
    graph.shapes,
  );
  templates[`${scope}_scalar`] = 12;
  templates[`${scope}_profile`] = profile;
  templates[`${scope}_alias`] = profile;
  templates[`${scope}_profiles`] = normalizeStructuredValueTemplate(
    [profile, profile],
    profilesType,
    graph.shapes,
  );
  return scope === "show"
    ? materializeRunState(graph, templates)
    : materializeInstanceState(graph, "flow_main", templates);
}

async function sequence(): Promise<number> {
  const [show] = await db
    .select({ sequence: shows.stateSequence })
    .from(shows)
    .where(eq(shows.id, showId));
  if (!show) throw new Error("Show disappeared.");
  return show.sequence;
}

async function expectCurrent(
  showState: RunState,
  instanceState: RunState,
  runId: string,
): Promise<void> {
  const current = await readActiveRun(showId);
  expect(current?.sourceValues).toEqual(showState.sourceValues);
  expect(current?.structuredValues).toEqual(showState.structuredValues);
  const instance = await readRunDeviceState(runId, "device_main");
  expect(instance?.instanceSourceValues).toEqual(instanceState.sourceValues);
  expect(instance?.instanceStructuredValues).toEqual(instanceState.structuredValues);
}

describe("Source Default and Current isolation", () => {
  it.each([false, true])(
    "keeps scalar, Shape, array identities and aliases through authored history, Auto-publish %s",
    async (autoPublish) => {
      await createShow();
      await writeShowGraph(showId, "draft", fixture());
      await publishShowGraph(showId);
      await setShowAutoPublish(showId, autoPublish);
      const run = await startRun(showId);
      const draft = await readShowGraph(showId, "draft");
      const showState = liveState(draft, "show");
      const instanceState = liveState(draft, "instance");
      await db.transaction(async (tx) => {
        await replaceRunState(tx, run.id, draft, showState);
        await tx
          .update(runDeviceStates)
          .set({
            instanceSourceValues: instanceState.sourceValues,
            instanceStructuredValues: instanceState.structuredValues,
          })
          .where(
            and(eq(runDeviceStates.runId, run.id), eq(runDeviceStates.deviceId, "device_main")),
          );
      });
      await expectCurrent(showState, instanceState, run.id);
      let version = draft.version;
      let writes = Promise.resolve();
      const stack = new CommandStack<ShowGraph, GraphEdit>({
        state: draft,
        dispatch: (_command, _graph, edits) => {
          writes = writes.then(async () => {
            version = (await applyShowEdits(showId, edits, [], version)).version;
          });
        },
      });
      const beforeSequence = await sequence();
      stack.execute(
        composite({
          label: "Edit Defaults",
          commands: ["show", "instance"].flatMap((scope) => [
            setSourceFieldDefault(`${scope}_scalar`, [], 5),
            setSourceFieldDefault(`${scope}_profile`, ["count"], 5),
            setSourceFieldDefault(`${scope}_profiles`, [], [{ count: 5, nickname: "Default" }]),
          ]),
        }),
      );
      await writes;
      expect(defaultSourceValues(await readShowGraph(showId, "draft")).show_scalar).toBe(5);
      await expectCurrent(showState, instanceState, run.id);
      if (autoPublish) expect(await sequence()).toBeGreaterThan(beforeSequence);
      else expect(await sequence()).toBe(beforeSequence);

      stack.undo();
      await writes;
      expect(defaultSourceValues(await readShowGraph(showId, "draft")).show_scalar).toBe(0);
      await expectCurrent(showState, instanceState, run.id);
      stack.redo();
      await writes;
      expect(defaultSourceValues(await readShowGraph(showId, "draft")).show_scalar).toBe(5);
      await expectCurrent(showState, instanceState, run.id);

      if (!autoPublish) await publishShowGraph(showId);
      const restarted = await startRun(showId);
      expect(restarted.sourceValues.show_scalar).toBe(5);
      expect(
        (await readRunDeviceState(restarted.id, "device_main"))?.instanceSourceValues
          .instance_scalar,
      ).toBe(5);
    },
  );
});
