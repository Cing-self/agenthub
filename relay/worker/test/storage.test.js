import test from "node:test";
import assert from "node:assert/strict";

import {
  createMemoryRelayStorage,
  createPairingInvite,
  claimPairingInvite,
  listPairedHosts,
  listHostSessions,
  upsertHostSessions,
  upsertHostMetadata,
} from "../src/storage.js";

test("createPairingInvite stores an expiring invite", async () => {
  const storage = createMemoryRelayStorage();

  const invite = await createPairingInvite(storage, {
    inviteId: "invite_123",
    hostId: "host_123",
    code: "PAIR-123",
    createdAt: "2026-04-03T12:00:00.000Z",
    expiresAt: "2026-04-03T12:05:00.000Z",
  });

  assert.equal(invite.inviteId, "invite_123");
  assert.equal(invite.hostId, "host_123");
  assert.equal(invite.claimedAt, null);
  assert.deepEqual(storage.debug().invites[0], invite);
});

test("claimPairingInvite only allows one successful claim", async () => {
  const storage = createMemoryRelayStorage();

  await upsertHostMetadata(storage, {
    hostId: "host_123",
    displayName: "MacBook Pro",
    status: "online",
    lastSeenAt: "2026-04-03T11:59:00.000Z",
    capabilities: ["turns"],
  });
  await createPairingInvite(storage, {
    inviteId: "invite_123",
    hostId: "host_123",
    code: "PAIR-123",
    createdAt: "2026-04-03T12:00:00.000Z",
    expiresAt: "2026-04-03T12:05:00.000Z",
  });

  const firstClaim = await claimPairingInvite(storage, {
    code: "PAIR-123",
    clientId: "client_ios_1",
    claimedAt: "2026-04-03T12:01:00.000Z",
  });

  assert.equal(firstClaim.clientId, "client_ios_1");

  await assert.rejects(
    () =>
      claimPairingInvite(storage, {
        code: "PAIR-123",
        clientId: "client_web_1",
        claimedAt: "2026-04-03T12:02:00.000Z",
      }),
    /already claimed/i,
  );
});

test("listPairedHosts returns paired host metadata for a client", async () => {
  const storage = createMemoryRelayStorage();

  await upsertHostMetadata(storage, {
    hostId: "host_123",
    displayName: "MacBook Pro",
    status: "online",
    lastSeenAt: "2026-04-03T11:59:00.000Z",
    capabilities: ["turns"],
  });
  await createPairingInvite(storage, {
    inviteId: "invite_123",
    hostId: "host_123",
    code: "PAIR-123",
    createdAt: "2026-04-03T12:00:00.000Z",
    expiresAt: "2026-04-03T12:05:00.000Z",
  });
  await claimPairingInvite(storage, {
    code: "PAIR-123",
    clientId: "client_ios_1",
    claimedAt: "2026-04-03T12:01:00.000Z",
  });

  const hosts = await listPairedHosts(storage, {
    clientId: "client_ios_1",
  });

  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].hostId, "host_123");
  assert.equal(hosts[0].displayName, "MacBook Pro");
});

test("upsertHostSessions replaces the current session snapshot for a host", async () => {
  const storage = createMemoryRelayStorage();

  await upsertHostSessions(storage, {
    hostId: "host_123",
    sessions: [
      {
        sessionId: "thread_older",
        hostId: "host_123",
        title: "Older thread",
        summary: "older goal",
        updatedAt: "2026-04-03T11:59:00.000Z",
        primaryAgentId: "dolphin",
        state: "active",
      },
    ],
  });
  await upsertHostSessions(storage, {
    hostId: "host_123",
    sessions: [
      {
        sessionId: "thread_newer",
        hostId: "host_123",
        title: "Newer thread",
        summary: "newer goal",
        updatedAt: "2026-04-03T12:01:00.000Z",
        primaryAgentId: "claude-code",
        state: "active",
      },
    ],
  });

  const sessions = await listHostSessions(storage, { hostId: "host_123" });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, "thread_newer");
});
