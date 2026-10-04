// Real-Postgres regressions for the Source value clipboard operation ledger
// (#897–#900): the Default commit path, the live Current path for a Show-level
// target and a Shared Device Instance target, the atomic prepare/commit/lookup
// protocol, and the authorization, version, wiring, image, scope and race
// refusals each path owns. Every test drives the exported public functions
// through real transactions — no mocks, no source-text assertions.
import type { ShowGraph } from "@mechane/domain/graph";
import type { Shape } from "@mechane/domain/shapes";
import { generateId } from "@mechane/domain/id";
import type { RunState } from "@mechane/domain/structured-values";
import { defaultSourceValues } from "@mechane/domain/source-defaults";
import {
  SOURCE_VALUE_FORMAT,
  expandPortableValue,
  portableText,
  ValueTransferError,
  type ValueHandoff,
  type ValueTarget,
} from "@mechane/domain/value-transfer";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "./client";
import { readRunDeviceState, replaceRunState, startRun } from "./runs";
import { blobs, imageAssets, runDeviceStates, runStructuredValues, user } from "./schema";
import { publishShowGraph, readShowGraph, writeShowGraph } from "./show-graph";
import { setupPostgresTest } from "./test-helpers";
import {
  commitSourceValue,
  lookupSourceValue,
  prepareSourceValue,
  readSourceValue,
  readSourceValueContext,
} from "./value-transfer";

const { userId, showId, createShow } = setupPostgresTest("value-transfer");
const otherUser = `${userId}-intruder`;

const profileType = { kind: "shape", shapeId: "shape_profile" } as const;
const profilesType = { kind: "array", of: profileType } as const;
const profileShape: Shape = {
  id: "shape_profile",
  name: "Profile",
  fields: [
    { id: "count", name: "Count", type: "number", required: true, defaultValue: 0 },
    { id: "nickname", name: "Nickname", type: "text", required: false, defaultValue: "Guest" },
  ],
};

function fixture(): ShowGraph {
  return {
    shapes: [profileShape],
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
        id: "flow_pc",
        kind: "flow",
        name: "Per-Connection Flow",
        position: { x: 0, y: 0 },
        parentId: null,
        defaultSceneId: "scene_pc",
      },
      {
        id: "scene_pc",
        kind: "scene",
        name: "PC",
        position: { x: 0, y: 0 },
        parentId: "flow_pc",
        variables: [],
      },
      {
        id: "device_a",
        kind: "device",
        name: "Shared A",
        position: { x: 0, y: 0 },
        parentId: null,
        perConnection: false,
        pairingCode: null,
      },
      {
        id: "device_b",
        kind: "device",
        name: "Shared B",
        position: { x: 0, y: 0 },
        parentId: null,
        perConnection: false,
        pairingCode: null,
      },
      {
        id: "device_pc",
        kind: "device",
        name: "Per-Connection",
        position: { x: 0, y: 0 },
        parentId: null,
        perConnection: true,
        pairingCode: null,
      },
      {
        id: "show_scalar",
        kind: "source",
        name: "Show Scalar",
        position: { x: 0, y: 0 },
        parentId: null,
        type: "number",
      },
      {
        id: "show_profile",
        kind: "source",
        name: "Show Profile",
        position: { x: 0, y: 0 },
        parentId: null,
        type: profileType,
      },
      {
        id: "show_profile2",
        kind: "source",
        name: "Show Profile Two",
        position: { x: 0, y: 0 },
        parentId: null,
        type: profileType,
      },
      {
        id: "show_image",
        kind: "source",
        name: "Show Image",
        position: { x: 0, y: 0 },
        parentId: null,
        type: "image",
      },
      {
        id: "show_wired",
        kind: "source",
        name: "Show Wired",
        position: { x: 0, y: 0 },
        parentId: null,
        type: "number",
      },
      {
        id: "inst_scalar",
        kind: "source",
        name: "Inst Scalar",
        position: { x: 0, y: 0 },
        parentId: "flow_main",
        type: "number",
      },
      {
        id: "inst_profiles",
        kind: "source",
        name: "Inst Profiles",
        position: { x: 0, y: 0 },
        parentId: "flow_main",
        type: profilesType,
      },
    ],
    edges: [
      {
        id: "drive_a",
        kind: "device",
        sourceId: "flow_main",
        targetId: "device_a",
        sourcePath: [],
        targetPath: [],
      },
      {
        id: "drive_b",
        kind: "device",
        sourceId: "flow_main",
        targetId: "device_b",
        sourcePath: [],
        targetPath: [],
      },
      {
        id: "drive_pc",
        kind: "device",
        sourceId: "flow_pc",
        targetId: "device_pc",
        sourcePath: [],
        targetPath: [],
      },
      {
        id: "wire_show",
        kind: "wiring",
        sourceId: "show_scalar",
        targetId: "show_wired",
        sourcePath: [],
        targetPath: [],
      },
    ],
    // An image Source needs a conforming authored default to materialize into
    // a Run; its revision need not name a stored asset for graph validation.
    sourceFieldDefaults: [
      { nodeId: "show_image", fieldPath: [], value: { assetId: "seed_asset", revision: "seed" } },
    ],
  };
}

const plain = (value: unknown): ValueHandoff => [
  { mediaType: "text/plain", text: portableText(value) },
];

/** The exact [A,A] alias the codec must mint once into fresh [B,B]. */
function aliasedPair(): ValueHandoff {
  const envelope = {
    format: SOURCE_VALUE_FORMAT,
    version: 1,
    origin: { showId: "origin", plane: "default" },
    type: profilesType,
    root: { ref: "list" },
    shapes: [
      {
        id: profileShape.id,
        name: profileShape.name,
        fields: profileShape.fields.map(({ id, name, type, required }) => ({
          id,
          name,
          type,
          required,
        })),
      },
    ],
    records: [
      { id: "list", kind: "array", type: profilesType, items: [{ ref: "A" }, { ref: "A" }] },
      { id: "A", kind: "shape", type: profileType, fields: { count: 7, nickname: null } },
    ],
  };
  return [{ mediaType: "text/plain", text: portableText(envelope) }];
}

async function rejects(run: () => Promise<unknown>): Promise<{ code: string; category: string }> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof ValueTransferError)) throw error;
    return { code: error.diagnostic.code, category: error.diagnostic.category };
  }
  throw new Error("Expected a ValueTransferError.");
}

/** Publishes the fixture fresh; returns the pinned draft and published versions. */
async function published(): Promise<{ draftVersion: number; publishedVersion: number }> {
  await createShow();
  await writeShowGraph(showId, "draft", fixture());
  await publishShowGraph(showId);
  const draft = await readShowGraph(showId, "draft");
  const pub = await readShowGraph(showId, "published");
  return { draftVersion: draft.version, publishedVersion: pub.version };
}

/** Re-publishes a byte-identical graph for a second Run in the same test. */
async function republish(): Promise<number> {
  await writeShowGraph(showId, "draft", fixture());
  await publishShowGraph(showId);
  return (await readShowGraph(showId, "published")).version;
}

async function setInstance(runId: string, deviceId: string, state: RunState): Promise<void> {
  await db
    .update(runDeviceStates)
    .set({
      instanceSourceValues: state.sourceValues,
      instanceStructuredValues: state.structuredValues,
    })
    .where(and(eq(runDeviceStates.runId, runId), eq(runDeviceStates.deviceId, deviceId)));
}

async function startWithShowState(publishedVersion: number, state: RunState): Promise<string> {
  const run = await startRun(showId);
  const graph = await readShowGraph(showId, "published");
  expect(graph.version).toBe(publishedVersion);
  await db.transaction((tx) => replaceRunState(tx, run.id, graph, state));
  return run.id;
}

async function insertActiveImage(assetId: string, revision: string): Promise<void> {
  const digest = `sha256-${assetId}-${revision}`;
  await db
    .insert(blobs)
    .values({ digest, byteLength: 4, mimeType: "image/png", deliveryPath: `/${digest}.png` })
    .onConflictDoNothing();
  await db.insert(imageAssets).values({
    id: assetId,
    showId,
    blobDigest: digest,
    revision,
    width: 1,
    height: 1,
    mimeType: "image/png",
  });
}

// ---------------------------------------------------------------------------
// #897 — Default plane: operation ledger, authorization, version, images
// ---------------------------------------------------------------------------

describe("Default value operations (#897)", () => {
  it("applies one scalar replacement exactly once, and a repeated commit or lookup re-reads the stored outcome", async () => {
    const { draftVersion } = await published();
    const target: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_scalar",
      fieldPath: [],
      draftVersion,
    };
    const prepared = await prepareSourceValue(userId, target, plain(42));

    const first = await commitSourceValue(userId, prepared.operationId);
    expect(first.kind).toBe("committed");
    const afterFirst = await readShowGraph(showId, "draft");
    expect(defaultSourceValues(afterFirst).show_scalar).toBe(42);

    // A repeated identity returns the stored receipt and never reapplies: the
    // draft version does not move a second time.
    const second = await commitSourceValue(userId, prepared.operationId);
    expect(second).toEqual(first);
    const afterSecond = await readShowGraph(showId, "draft");
    expect(afterSecond.version).toBe(afterFirst.version);
    expect(defaultSourceValues(afterSecond).show_scalar).toBe(42);

    expect(await lookupSourceValue(userId, showId, prepared.operationId)).toEqual(first);
  });

  it("stores an explicit optional-Field absence as null rather than resetting to the inherited default, and refuses absence on a required Field", async () => {
    const { draftVersion } = await published();
    const nickname: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_profile",
      fieldPath: ["nickname"],
      draftVersion,
    };
    const prepared = await prepareSourceValue(userId, nickname, plain(null));
    expect((await commitSourceValue(userId, prepared.operationId)).kind).toBe("committed");

    const read = await readSourceValue(userId, {
      ...nickname,
      draftVersion: (await readShowGraph(showId, "draft")).version,
    });
    expect(read.envelope.root).toBeNull();

    const required: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_profile",
      fieldPath: ["count"],
      draftVersion: (await readShowGraph(showId, "draft")).version,
    };
    expect((await rejects(() => prepareSourceValue(userId, required, plain(null)))).category).toBe(
      "rejected-input",
    );
  });

  it("refuses a pinned draft version that no longer matches, on both read and prepare", async () => {
    const { draftVersion } = await published();
    const stale: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_scalar",
      fieldPath: [],
      draftVersion: draftVersion + 7,
    };
    expect((await rejects(() => readSourceValue(userId, stale))).code).toBe("stale-version");
    expect((await rejects(() => prepareSourceValue(userId, stale, plain(1)))).code).toBe(
      "stale-version",
    );
  });

  it("treats a non-owner identically to a missing Show on read, prepare, commit and lookup", async () => {
    const { draftVersion } = await published();
    const target: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_scalar",
      fieldPath: [],
      draftVersion,
    };
    await db.insert(user).values({
      id: otherUser,
      name: "Intruder",
      email: `${otherUser}@example.com`,
      emailVerified: true,
    });
    try {
      expect((await rejects(() => readSourceValue(otherUser, target))).code).toBe(
        "unavailable-or-not-authorized",
      );
      expect((await rejects(() => prepareSourceValue(otherUser, target, plain(1)))).code).toBe(
        "unavailable-or-not-authorized",
      );
      const prepared = await prepareSourceValue(userId, target, plain(5));
      expect((await rejects(() => commitSourceValue(otherUser, prepared.operationId))).code).toBe(
        "unavailable-or-not-authorized",
      );
      expect(
        (await rejects(() => lookupSourceValue(otherUser, showId, prepared.operationId))).code,
      ).toBe("unavailable-or-not-authorized");
    } finally {
      await db.delete(user).where(eq(user.id, otherUser));
    }
  });

  it("rechecks image availability at commit, so an image deactivated after prepare rejects, and an unowned image rejects at prepare", async () => {
    const { draftVersion } = await published();
    await insertActiveImage("asset_hero", "rev1");
    const target: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_image",
      fieldPath: [],
      draftVersion,
    };

    // Unowned revision refuses before anything is stored.
    expect(
      (
        await rejects(() =>
          prepareSourceValue(userId, target, plain({ assetId: "asset_hero", revision: "missing" })),
        )
      ).code,
    ).toBe("unavailable-or-not-authorized");

    const prepared = await prepareSourceValue(
      userId,
      target,
      plain({ assetId: "asset_hero", revision: "rev1" }),
    );
    // The asset loses its active revision between prepare and commit.
    await db.update(imageAssets).set({ state: "inactive" }).where(eq(imageAssets.id, "asset_hero"));
    const outcome = await commitSourceValue(userId, prepared.operationId);
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") throw new Error("unreachable");
    expect(outcome.diagnostic.category).toBe("commit-rejected");
    expect(outcome.diagnostic.code).toBe("unavailable-or-not-authorized");
    // A definitive rejection persists: lookup reports it, not pending.
    expect(await lookupSourceValue(userId, showId, prepared.operationId)).toEqual(outcome);
  });

  it("refuses a Source fed by incoming wiring as copy-only, which a read still surfaces", async () => {
    const { draftVersion } = await published();
    const target: ValueTarget = {
      kind: "default",
      showId,
      sourceId: "show_wired",
      fieldPath: [],
      draftVersion,
    };
    expect((await readSourceValue(userId, target)).copyOnly).toBe(true);
    expect((await rejects(() => prepareSourceValue(userId, target, plain(3)))).code).toBe(
      "incoming-wiring",
    );
  });
});

// ---------------------------------------------------------------------------
// #899 — Show-level Current plane: root/Field aliases, races, lifecycle
// ---------------------------------------------------------------------------

// One well-formed Structured Value id the Run state must accept; two Sources
// alias it so a root rebind and a Field write can be told apart.
const SHARED = generateId("structuredValue");

function sharedProfileState(): RunState {
  // Readable aliasing state; branded ids make it a valid Run state in one cast.
  return {
    sourceValues: {
      show_scalar: 3,
      show_wired: 0,
      show_image: { assetId: "seed_asset", revision: "seed" },
      show_profile: { ref: SHARED },
      show_profile2: { ref: SHARED },
    },
    structuredValues: {
      [SHARED]: {
        id: SHARED,
        kind: "shape",
        type: profileType,
        fields: { count: 1, nickname: "old" },
      },
    },
  } as unknown as RunState;
}

async function sharedPayload(runId: string): Promise<Record<string, unknown>> {
  const [row] = await db
    .select()
    .from(runStructuredValues)
    .where(
      and(eq(runStructuredValues.runId, runId), eq(runStructuredValues.structuredValueId, SHARED)),
    );
  // The aliased record is a Shape; its payload is the fields map written above.
  return (row?.payload ?? {}) as Record<string, unknown>;
}

async function mutateShared(runId: string, fields: Record<string, unknown>): Promise<void> {
  await db
    .update(runStructuredValues)
    .set({ payload: fields })
    .where(
      and(eq(runStructuredValues.runId, runId), eq(runStructuredValues.structuredValueId, SHARED)),
    );
}

describe("Show-level Current value operations (#899)", () => {
  it("rebinds only the selected Source root, leaving every other reference to the old value intact", async () => {
    const { publishedVersion } = await published();
    const runId = await startWithShowState(publishedVersion, sharedProfileState());
    const target: ValueTarget = {
      kind: "current-show",
      showId,
      sourceId: "show_profile",
      fieldPath: [],
      runId,
      publishedVersion,
    };
    const prepared = await prepareSourceValue(userId, target, plain({ Count: 5, Nickname: "new" }));
    expect(prepared.aliasEffects).toContain("Rebinds only");
    expect((await commitSourceValue(userId, prepared.operationId)).kind).toBe("committed");

    expect(expandPortableValue((await readSourceValue(userId, target)).envelope)).toEqual({
      Count: 5,
      Nickname: "new",
    });
    // The aliasing Source still observes the untouched old value.
    expect(
      expandPortableValue(
        (await readSourceValue(userId, { ...target, sourceId: "show_profile2" })).envelope,
      ),
    ).toEqual({ Count: 1, Nickname: "old" });
    expect(await sharedPayload(runId)).toEqual({ count: 1, nickname: "old" });
  });

  it("writes the existing containing holder for a Field, so every alias observes the new value", async () => {
    const { publishedVersion } = await published();
    const runId = await startWithShowState(publishedVersion, sharedProfileState());
    const target: ValueTarget = {
      kind: "current-show",
      showId,
      sourceId: "show_profile",
      fieldPath: ["count"],
      runId,
      publishedVersion,
    };
    const prepared = await prepareSourceValue(userId, target, plain(99));
    expect((await commitSourceValue(userId, prepared.operationId)).kind).toBe("committed");

    expect(await sharedPayload(runId)).toEqual({ count: 99, nickname: "old" });
    // The aliasing Source reads the in-place change.
    const sibling = await readSourceValue(userId, {
      kind: "current-show",
      showId,
      sourceId: "show_profile2",
      fieldPath: [],
      runId,
      publishedVersion,
    });
    expect(expandPortableValue(sibling.envelope)).toEqual({ Count: 99, Nickname: "old" });
  });

  it("passes a sibling-only race but rejects a change to the selected Field under the commit lock", async () => {
    const { publishedVersion } = await published();

    // Sibling-only change: the untouched Field moves, the selected one does not.
    const siblingRun = await startWithShowState(publishedVersion, sharedProfileState());
    const siblingTarget: ValueTarget = {
      kind: "current-show",
      showId,
      sourceId: "show_profile",
      fieldPath: ["count"],
      runId: siblingRun,
      publishedVersion,
    };
    const siblingPrepared = await prepareSourceValue(userId, siblingTarget, plain(50));
    await mutateShared(siblingRun, { count: 1, nickname: "changed" });
    expect((await commitSourceValue(userId, siblingPrepared.operationId)).kind).toBe("committed");
    expect(await sharedPayload(siblingRun)).toEqual({ count: 50, nickname: "changed" });

    // Selected change: the chosen Field moved, so the commit refuses.
    const v2 = await republish();
    const selectedRun = await startWithShowState(v2, sharedProfileState());
    const selectedTarget: ValueTarget = {
      kind: "current-show",
      showId,
      sourceId: "show_profile",
      fieldPath: ["count"],
      runId: selectedRun,
      publishedVersion: v2,
    };
    const selectedPrepared = await prepareSourceValue(userId, selectedTarget, plain(50));
    await mutateShared(selectedRun, { count: 2, nickname: "old" });
    const outcome = await commitSourceValue(userId, selectedPrepared.operationId);
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") throw new Error("unreachable");
    expect(outcome.diagnostic.code).toBe("stale-value");
  });

  it("refuses a stale published version on read and a Run that is no longer active on commit", async () => {
    const { publishedVersion } = await published();
    const runId = await startWithShowState(publishedVersion, sharedProfileState());
    const target: ValueTarget = {
      kind: "current-show",
      showId,
      sourceId: "show_scalar",
      fieldPath: [],
      runId,
      publishedVersion,
    };

    expect(
      (
        await rejects(() =>
          readSourceValue(userId, { ...target, publishedVersion: publishedVersion + 1 }),
        )
      ).code,
    ).toBe("stale-version");

    const prepared = await prepareSourceValue(userId, target, plain(8));
    // A new Run ends the one the operation was prepared against.
    await startRun(showId);
    const outcome = await commitSourceValue(userId, prepared.operationId);
    expect(outcome.kind).toBe("rejected");
    if (outcome.kind !== "rejected") throw new Error("unreachable");
    expect(outcome.diagnostic.code).toBe("run-not-active");
  });
});

// ---------------------------------------------------------------------------
// #900 — Shared Device Instance Current plane: isolation, scope, context
// ---------------------------------------------------------------------------

type RecordView = {
  id: string;
  kind: "array" | "shape";
  items?: { ref: string }[];
  fields?: Record<string, unknown>;
};

function instanceState(): RunState {
  // A fresh empty array the paste rebinds; branded ids keep it a valid state.
  const listId = generateId("structuredValue");
  return {
    sourceValues: { inst_scalar: 1, inst_profiles: { ref: listId } },
    structuredValues: { [listId]: { id: listId, kind: "array", type: profilesType, items: [] } },
  } as unknown as RunState;
}

async function readInstance(
  runId: string,
  deviceId: string,
): Promise<{
  sourceValues: Record<string, unknown>;
  structuredValues: Record<string, RecordView>;
}> {
  const row = await readRunDeviceState(runId, deviceId);
  // The Instance JSON columns persist exactly the RunState written above.
  return {
    sourceValues: (row?.instanceSourceValues ?? {}) as Record<string, unknown>,
    structuredValues: (row?.instanceStructuredValues ?? {}) as Record<string, RecordView>,
  };
}

function profilesItems(instance: {
  sourceValues: Record<string, unknown>;
  structuredValues: Record<string, RecordView>;
}): { ref: string }[] {
  const root = instance.sourceValues.inst_profiles;
  if (typeof root !== "object" || root === null || !("ref" in root))
    throw new Error("Expected an array reference.");
  const listRef = root.ref;
  if (typeof listRef !== "string") throw new Error("Expected a string reference.");
  return instance.structuredValues[listRef]?.items ?? [];
}

describe("Shared Device Instance Current value operations (#900)", () => {
  it("lists only configured Shared Instances holding Flow state, excluding per-connection Devices", async () => {
    const { publishedVersion } = await published();
    const run = await startRun(showId);
    await setInstance(run.id, "device_a", instanceState());
    await setInstance(run.id, "device_b", instanceState());
    const context = await readSourceValueContext(userId, showId, "inst_profiles");
    expect(context.activeRun).toEqual({ runId: run.id, publishedVersion });
    expect(context.instances.map((instance) => instance.deviceId)).toEqual([
      "device_a",
      "device_b",
    ]);
  });

  it("pastes a typed [A,A] alias as a fresh [B,B] into one Instance without disturbing the sibling Instance", async () => {
    const { publishedVersion } = await published();
    const run = await startRun(showId);
    await setInstance(run.id, "device_a", instanceState());
    const untouched = instanceState();
    await setInstance(run.id, "device_b", untouched);

    const target: ValueTarget = {
      kind: "current-instance",
      showId,
      sourceId: "inst_profiles",
      fieldPath: [],
      runId: run.id,
      publishedVersion,
      deviceId: "device_a",
      flowId: "flow_main",
    };
    const prepared = await prepareSourceValue(userId, target, aliasedPair());
    expect((await commitSourceValue(userId, prepared.operationId)).kind).toBe("committed");

    const a = await readInstance(run.id, "device_a");
    const items = profilesItems(a);
    expect(items).toHaveLength(2);
    // The alias survives as one shared fresh record (B,B), minted anew (not "A").
    expect(items[0]!.ref).toBe(items[1]!.ref);
    expect(items[0]!.ref).not.toBe("A");
    expect(a.structuredValues[items[0]!.ref]?.fields).toEqual({ count: 7, nickname: null });

    // The sibling Instance is byte-for-byte unchanged.
    const b = await readInstance(run.id, "device_b");
    expect(b.sourceValues).toEqual(untouched.sourceValues);
    expect(b.structuredValues).toEqual(untouched.structuredValues);
  });

  it("mints a distinct fresh record per plain occurrence rather than aliasing them", async () => {
    const { publishedVersion } = await published();
    const run = await startRun(showId);
    await setInstance(run.id, "device_a", instanceState());
    const target: ValueTarget = {
      kind: "current-instance",
      showId,
      sourceId: "inst_profiles",
      fieldPath: [],
      runId: run.id,
      publishedVersion,
      deviceId: "device_a",
      flowId: "flow_main",
    };
    const prepared = await prepareSourceValue(
      userId,
      target,
      plain([
        { Count: 1, Nickname: "same" },
        { Count: 1, Nickname: "same" },
      ]),
    );
    expect((await commitSourceValue(userId, prepared.operationId)).kind).toBe("committed");

    const items = profilesItems(await readInstance(run.id, "device_a"));
    expect(items[0]!.ref).not.toBe(items[1]!.ref);
  });

  it("refuses a cross-scope target and a per-connection Device", async () => {
    const { publishedVersion } = await published();
    const run = await startRun(showId);
    await setInstance(run.id, "device_a", instanceState());

    // A Show-level Source addressed as an Instance target crosses scope.
    const crossScope: ValueTarget = {
      kind: "current-instance",
      showId,
      sourceId: "show_scalar",
      fieldPath: [],
      runId: run.id,
      publishedVersion,
      deviceId: "device_a",
      flowId: "flow_main",
    };
    expect((await rejects(() => prepareSourceValue(userId, crossScope, plain(2)))).code).toBe(
      "cross-scope-target",
    );

    // A per-connection Device is not a configured Shared Instance.
    const perConnection: ValueTarget = {
      kind: "current-instance",
      showId,
      sourceId: "inst_scalar",
      fieldPath: [],
      runId: run.id,
      publishedVersion,
      deviceId: "device_pc",
      flowId: "flow_main",
    };
    expect((await rejects(() => prepareSourceValue(userId, perConnection, plain(2)))).code).toBe(
      "device-not-eligible",
    );
  });
});
