// A Device's live Custom Domain read through onto its graph node (issue
// #836), which is how Studio's links and QR codes and every Player's QR
// codes and Address outputs learn it.
import { describe, expect, it } from "vitest";

import { setupPostgresTest } from "../db/test-helpers";
import { seedShow } from "../db/seeds/shows/navigation-proof/navigation-proof";
import { readShowGraph } from "../db/show-graph";
import type { CustomDomainStatus } from "./hostname";
import { insertCustomDomain, uniqueHostname } from "./test-fixtures";

const { userId, showId, createShow } = setupPostgresTest("live-domain-test");

describe("a Device node's liveDomain", () => {
  it("is the bound domain's hostname while it is live or needs attention, else null", async () => {
    await createShow();
    await seedShow.seed(showId);
    const devices = (await readShowGraph(showId, "published")).nodes.filter(
      (node) => node.kind === "device",
    );
    expect(devices.length).toBeGreaterThanOrEqual(2);
    const liveDevice = devices[0]!;
    const securingDevice = devices[1]!;

    const expectations: [string, CustomDomainStatus, string][] = [];
    for (const [device, status] of [
      [liveDevice, "needs_attention"],
      [securingDevice, "securing"],
    ] as const) {
      const hostname = uniqueHostname(status.replace("_", "-"));
      await insertCustomDomain({
        userId,
        hostname,
        status,
        deviceShowId: showId,
        deviceId: device.id,
      });
      expectations.push([device.id, status, hostname]);
    }
    await insertCustomDomain({ userId, hostname: uniqueHostname("unbound"), status: "live" });

    for (const state of ["draft", "published"] as const) {
      const byId = new Map(
        (await readShowGraph(showId, state)).nodes.map((node) => [
          node.id,
          node.kind === "device" ? node.liveDomain : undefined,
        ]),
      );
      expect(byId.get(liveDevice.id), state).toBe(expectations[0]![2]);
      expect(byId.get(securingDevice.id), state).toBeNull();
    }
  });
});
