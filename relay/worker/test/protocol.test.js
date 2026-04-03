import test from "node:test";
import assert from "node:assert/strict";

import { createEnvelope, parseEnvelope } from "../src/protocol.js";

test("createEnvelope requires messageId, hostId, and type", () => {
  assert.throws(
    () => createEnvelope({ hostId: "host_123", type: "host.register" }),
    /messageId/i,
  );
  assert.throws(
    () => createEnvelope({ messageId: "msg_123", type: "host.register" }),
    /hostId/i,
  );
  assert.throws(
    () => createEnvelope({ messageId: "msg_123", hostId: "host_123" }),
    /type/i,
  );
});

test("parseEnvelope accepts a valid envelope and applies defaults", () => {
  const envelope = parseEnvelope({
    messageId: "msg_123",
    hostId: "host_123",
    sessionId: "thread_123",
    type: "turn.submit",
    payload: { message: "hello" },
  });

  assert.equal(envelope.messageId, "msg_123");
  assert.equal(envelope.hostId, "host_123");
  assert.equal(envelope.sessionId, "thread_123");
  assert.equal(envelope.type, "turn.submit");
  assert.deepEqual(envelope.payload, { message: "hello" });
  assert.equal(envelope.seq, 0);
  assert.match(envelope.sentAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("parseEnvelope rejects invalid payloads", () => {
  assert.throws(
    () =>
      parseEnvelope({
        messageId: "msg_123",
        hostId: "host_123",
        type: "turn.submit",
        payload: "hello",
      }),
    /payload/i,
  );
});
