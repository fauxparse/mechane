// Device identity (issue #45): the Show-level row behind every Device node
// on the canvas, and the pairing code a physical device joins with (#8).
//
// A Device leads two lives. On the canvas it is a graph node — draft or
// published, rewritten wholesale on every save, deleted the moment the
// director deletes it. At the Show level it is an identity with a code
// that must stay put across every Run (PRD.md §4.3) and survive a draft
// edit that a live Run hasn't been shown yet (ADR-0002). This module is
// the seam between the two: `syncDevices` is called from inside the graph
// write, `retireUnreferencedDevices` from inside publish, and nothing else
// writes the `devices` table.
import { randomInt } from "node:crypto";

import type { DeviceNode, GraphNode } from "@mechane/domain";
import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";

import { devices, graphNodes, showGraphs } from "./schema";

/** The transaction type every function here runs inside. */
type Tx = Parameters<Parameters<typeof import("./client").db.transaction>[0]>[0];

/** What a stored Device contributes to its node on the canvas. */
export interface StoredDevice {
  pairingCode: string;
  perConnection: boolean;
}

const CODE_LENGTH = 5;

/**
 * The alphabet a pairing code is drawn from: uppercase letters and digits,
 * minus the four characters that read as each other. `I`/`L` vs `1`, and
 * `O` vs `0` — the letters go, the digits stay, so a code read aloud over
 * a headset or squinted at from the back of a venue can only be typed one
 * way. (`1` survives because with `I` and `L` gone nothing collides with
 * it.)
 *
 * 32 characters, which is not a coincidence worth relying on but is worth
 * noting: 32^5 is about 33.5 million codes, against 10^6 for the six
 * digits this replaces. Shorter to read out *and* 33× harder to guess.
 */
const CODE_ALPHABET = "123456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * How many codes to try before giving up. Collisions are drawn against every
 * Device because pairing accepts a code without a separate Show id.
 */
const CODE_ATTEMPTS = 8;

/**
 * A candidate pairing code: five characters from `CODE_ALPHABET`.
 *
 * Drawn character by character from `randomInt`, not `Math.random`,
 * because this one string is both how a Device is named publicly and the
 * entire trust boundary for joining it (PRD.md §4.3: no login, possession
 * of the code is the credential). `Math.random` is predictable output —
 * fine for picking a color, not for something an attacker profits from
 * guessing. `randomInt` also draws uniformly, where the usual
 * `floor(random() * n)` skews very slightly toward low values.
 */
function candidatePairingCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Inserts a Device row, retrying until its code doesn't collide anywhere.
 * The uniqueness that matters is the database's, not the generator's: two
 * directors saving at once would both see an empty result from a pre-check,
 * so the insert itself has to be what decides.
 */
async function insertDevice(tx: Tx, showId: string, node: DeviceNode): Promise<StoredDevice> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const pairingCode = candidatePairingCode();
    const [row] = await tx
      .insert(devices)
      .values({ id: node.id, showId, pairingCode, perConnection: node.perConnection })
      .onConflictDoNothing({ target: devices.pairingCode })
      .returning();
    if (row) return { pairingCode: row.pairingCode, perConnection: row.perConnection };
  }
  throw new Error(
    `Couldn't mint a unique pairing code for Device "${node.id}" in ${CODE_ATTEMPTS} attempts.`,
  );
}

/**
 * Brings the `devices` table in line with the Device nodes in a graph
 * being written, and answers with what each node should carry.
 *
 * Three things happen here, all of them consequences of a Device's
 * identity outliving any one graph state:
 *
 *   - A Device the table hasn't seen gets a row and a freshly minted code.
 *   - A Device it has seen keeps the code it already had and takes
 *     `perConnection` from the incoming node, so an inspector toggle
 *     survives a save. The pairing code is still the server's.
 *   - A Device that had been retired is un-retired, because it is
 *     referenced again. That is what makes undo of a delete restore the
 *     *same* code rather than mint a new one.
 */
export async function syncDevices(
  tx: Tx,
  showId: string,
  nodes: GraphNode[],
): Promise<Map<string, StoredDevice>> {
  const deviceNodes = nodes.filter((node): node is DeviceNode => node.kind === "device");
  if (deviceNodes.length === 0) return new Map();

  const existing = await tx
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.showId, showId),
        inArray(
          devices.id,
          deviceNodes.map((node) => node.id),
        ),
      ),
    );
  const stored = new Map<string, StoredDevice>(
    existing.map((row) => [
      row.id,
      { pairingCode: row.pairingCode, perConnection: row.perConnection },
    ]),
  );

  const returning = await Promise.all(
    deviceNodes.map(async (node) => {
      const known = stored.get(node.id);
      if (!known) return [node.id, await insertDevice(tx, showId, node)] as const;
      if (known.perConnection === node.perConnection) {
        return [node.id, known] as const;
      }
      await tx
        .update(devices)
        .set({ perConnection: node.perConnection, updatedAt: new Date() })
        .where(and(eq(devices.showId, showId), eq(devices.id, node.id)));
      return [
        node.id,
        { pairingCode: known.pairingCode, perConnection: node.perConnection },
      ] as const;
    }),
  );

  const revived = existing.filter((row) => row.retiredAt !== null).map((row) => row.id);
  if (revived.length > 0) {
    await tx
      .update(devices)
      .set({ retiredAt: null, updatedAt: new Date() })
      .where(and(eq(devices.showId, showId), inArray(devices.id, revived)));
  }

  return new Map(returning);
}

/**
 * Retires every Device on the Show that no graph state names any more, and
 * un-retires any that a state names again.
 *
 * Called from publish, and only from publish. A Device deleted from the
 * draft is still referenced by the published graph until the director
 * publishes, so its code keeps working for a Run that is already under
 * way — which is the whole point of ADR-0002's split, and the difference
 * between an edit and an outage.
 */
export async function retireUnreferencedDevices(tx: Tx, showId: string): Promise<void> {
  const referenced = tx
    .select({ id: graphNodes.id })
    .from(graphNodes)
    .innerJoin(showGraphs, eq(graphNodes.graphId, showGraphs.id))
    .where(and(eq(showGraphs.showId, showId), eq(graphNodes.kind, "device")));

  const now = new Date();
  await tx
    .update(devices)
    .set({ retiredAt: now, updatedAt: now })
    .where(
      and(
        eq(devices.showId, showId),
        isNull(devices.retiredAt),
        notInArray(devices.id, referenced),
      ),
    );
  await tx
    .update(devices)
    .set({ retiredAt: null, updatedAt: now })
    .where(
      and(
        eq(devices.showId, showId),
        isNotNull(devices.retiredAt),
        inArray(devices.id, referenced),
      ),
    );
}
