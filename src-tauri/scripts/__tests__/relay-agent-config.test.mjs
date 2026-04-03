import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHostSyncRequest,
  buildHostRegistrationPayload,
  buildRelayApiUrl,
  buildSessionSnapshotPayload,
} from "../relay-agent.mjs";

test("buildHostRegistrationPayload produces a normalized relay host payload", () => {
  const payload = buildHostRegistrationPayload({
    hostId: "host_123",
    displayName: "MacBook Pro",
    platform: "macos",
    runtimeVersion: "0.1.0",
    capabilities: ["turns", "streaming"],
    connectedAt: "2026-04-03T12:00:00.000Z",
  });

  assert.deepEqual(payload, {
    hostId: "host_123",
    displayName: "MacBook Pro",
    platform: "macos",
    runtimeVersion: "0.1.0",
    status: "online",
    connectedAt: "2026-04-03T12:00:00.000Z",
    capabilities: ["turns", "streaming"],
  });
});

test("buildSessionSnapshotPayload maps collaboration threads into relay sessions", () => {
  const payload = buildSessionSnapshotPayload({
    hostId: "host_123",
    hub: {
      collaboration: {
        threads: [
          {
            id: "thread_older",
            title: "Older thread",
            goal: "older goal",
            primary_agent_id: "dolphin",
            updated_at: "2026-04-03T11:59:00.000Z",
          },
          {
            id: "thread_newer",
            title: "Newer thread",
            goal: "newer goal",
            primary_agent_id: "claude-code",
            updated_at: "2026-04-03T12:01:00.000Z",
          },
        ],
      },
    },
  });

  assert.equal(payload.hostId, "host_123");
  assert.equal(payload.sessions.length, 2);
  assert.deepEqual(payload.sessions[0], {
    sessionId: "thread_newer",
    hostId: "host_123",
    title: "Newer thread",
    summary: "newer goal",
    updatedAt: "2026-04-03T12:01:00.000Z",
    primaryAgentId: "claude-code",
    state: "active",
  });
});

test("buildRelayApiUrl keeps a single api prefix", () => {
  assert.equal(
    buildRelayApiUrl("https://relay.example.workers.dev/api", "/hosts/sync"),
    "https://relay.example.workers.dev/api/hosts/sync",
  );
  assert.equal(
    buildRelayApiUrl("https://relay.example.workers.dev", "hosts/sync"),
    "https://relay.example.workers.dev/api/hosts/sync",
  );
});

test("buildHostSyncRequest combines host metadata with session snapshot", () => {
  const request = buildHostSyncRequest({
    relayBaseUrl: "https://relay.example.workers.dev/api",
    host: {
      hostId: "host_123",
      displayName: "MacBook Pro",
      platform: "darwin",
      runtimeVersion: "0.1.0",
      capabilities: ["turns", "session-list"],
      connectedAt: "2026-04-03T12:00:00.000Z",
    },
    snapshot: {
      hostId: "host_123",
      sessions: [
        {
          sessionId: "thread_1",
          hostId: "host_123",
          title: "Relay v1",
          summary: "Design work",
          updatedAt: "2026-04-03T12:01:00.000Z",
          primaryAgentId: "claude-code",
          state: "active",
        },
      ],
    },
  });

  assert.equal(request.url, "https://relay.example.workers.dev/api/hosts/sync");
  assert.deepEqual(request.body, {
    hostId: "host_123",
    host: {
      hostId: "host_123",
      displayName: "MacBook Pro",
      platform: "darwin",
      runtimeVersion: "0.1.0",
      status: "online",
      connectedAt: "2026-04-03T12:00:00.000Z",
      lastSeenAt: "2026-04-03T12:00:00.000Z",
      capabilities: ["turns", "session-list"],
    },
    sessions: [
      {
        sessionId: "thread_1",
        hostId: "host_123",
        title: "Relay v1",
        summary: "Design work",
        updatedAt: "2026-04-03T12:01:00.000Z",
        primaryAgentId: "claude-code",
        state: "active",
      },
    ],
  });
});
