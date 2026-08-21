import { createServer } from "node:http";

import WebSocket from "ws";
import { describe, expect, it } from "vitest";

import { LocalRealtimeProvider, LocalRealtimeServer } from "./local";
import { playerChannel, runChannel } from "./index";

describe("LocalRealtimeProvider", () => {
  it("publishes ordered messages and replays after a cursor", async () => {
    const channel = new LocalRealtimeProvider().channel(runChannel("run_1"));
    await channel.publish("first", { value: 1 });
    await channel.publish("second", { value: 2 });

    const received: string[] = [];
    const subscription = channel.subscribe((message) => received.push(message.type), { after: 1 });

    expect(received).toEqual(["second"]);
    subscription.close();
    await channel.publish("third", { value: 3 });
    expect(received).toEqual(["second"]);
  });

  it("requests a snapshot when a cursor falls outside the replay buffer", async () => {
    const channel = new LocalRealtimeProvider().channel(runChannel("run_2"));
    for (let index = 0; index < 1_002; index += 1) {
      await channel.publish("value", index);
    }

    const received: string[] = [];
    channel.subscribe((message) => received.push(message.type), { after: 1 });

    expect(received).toEqual(["snapshot-required"]);
  });

  it("supports stable Player channels independently of Run channels", async () => {
    const channel = new LocalRealtimeProvider().channel(playerChannel("device_1"));
    const received: string[] = [];
    channel.subscribe((message) => received.push(message.type));

    await channel.publish("player.updated", null);

    expect(received).toEqual(["player.updated"]);
  });

  it("delivers a subscribed message over WebSockets", async () => {
    const provider = new LocalRealtimeProvider();
    const realtime = new LocalRealtimeServer(provider);
    const server = createServer();
    server.on("upgrade", (request, socket, head) => realtime.handleUpgrade(request, socket, head));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not get a port.");

    const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise<void>((resolve, reject) => {
      client.once("open", () => resolve());
      client.once("error", reject);
    });
    const received = new Promise<string>((resolve, reject) => {
      client.once("message", (data) => resolve(data.toString()));
      client.once("error", reject);
    });
    client.send(JSON.stringify({ type: "subscribe", channel: runChannel("run_3") }));
    await provider.channel(runChannel("run_3")).publish("run.cutover", { version: 2 });

    expect(JSON.parse(await received)).toMatchObject({
      type: "run.cutover",
      payload: { version: 2 },
    });
    client.close();
    await realtime.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
