import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHostRegistrationPayload,
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
