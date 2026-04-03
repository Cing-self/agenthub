import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { createMemoryRelayStorage } from "../src/storage.js";

async function readJson(response) {
  return response.json();
}

test("GET /health returns relay service metadata", async () => {
  const response = await worker.fetch(new Request("https://relay.example/health"));
  const payload = await readJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    service: "agenthub-relay",
  });
});

test("pairing invite claim flow returns paired hosts for the client", async () => {
  const storage = createMemoryRelayStorage();

  const createInviteResponse = await worker.fetch(
    new Request("https://relay.example/api/pairing/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteId: "invite_123",
        host: {
          hostId: "host_123",
          displayName: "MacBook Pro",
          status: "online",
          lastSeenAt: "2026-04-03T11:59:00.000Z",
          capabilities: ["turns"],
        },
        code: "PAIR-123",
        createdAt: "2026-04-03T12:00:00.000Z",
        expiresAt: "2026-04-03T12:05:00.000Z",
      }),
    }),
    { RELAY_STORAGE: storage },
  );

  assert.equal(createInviteResponse.status, 200);

  const claimResponse = await worker.fetch(
    new Request("https://relay.example/api/pairing/invites/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "PAIR-123",
        clientId: "client_ios_1",
        claimedAt: "2026-04-03T12:01:00.000Z",
      }),
    }),
    { RELAY_STORAGE: storage },
  );

  assert.equal(claimResponse.status, 200);

  const hostsResponse = await worker.fetch(
    new Request("https://relay.example/api/clients/client_ios_1/hosts"),
    { RELAY_STORAGE: storage },
  );
  const payload = await readJson(hostsResponse);

  assert.equal(hostsResponse.status, 200);
  assert.equal(payload.hosts.length, 1);
  assert.equal(payload.hosts[0].hostId, "host_123");
  assert.equal(payload.hosts[0].displayName, "MacBook Pro");
});
