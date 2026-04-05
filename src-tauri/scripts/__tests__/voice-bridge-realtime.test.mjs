import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import WebSocket from "ws";

import { createVoiceBridgeRealtimeServer } from "../voice-bridge-realtime.mjs";

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function waitForMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString("utf8")));
    });
    socket.once("error", reject);
  });
}

function waitForMessages(socket, count) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const handleMessage = (data) => {
      messages.push(JSON.parse(data.toString("utf8")));
      if (messages.length >= count) {
        socket.off("message", handleMessage);
        socket.off("error", handleError);
        resolve(messages);
      }
    };
    const handleError = (error) => {
      socket.off("message", handleMessage);
      socket.off("error", handleError);
      reject(error);
    };

    socket.on("message", handleMessage);
    socket.once("error", handleError);
  });
}

function waitForUnexpectedResponse(socket) {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => {
      resolve(response.statusCode);
    });
    socket.once("open", () => reject(new Error("expected handshake rejection")));
    socket.once("error", () => {});
  });
}

async function closeSocket(socket) {
  if (!socket) {
    return;
  }

  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  await new Promise((resolve) => {
    socket.once("close", resolve);
    socket.terminate();
  });
}

async function listen(server) {
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `ws://127.0.0.1:${address.port}`;
}

test("voice bridge realtime server authenticates, streams output audio, and forwards input chunks", async () => {
  const seenChunks = [];
  let outputDelivered = false;
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const bridge = createVoiceBridgeRealtimeServer({
    token: "bridge_secret",
    voiceSessionManager: {
      getSession(callId) {
        assert.equal(callId, "call_voice_1");
        return {
          callId,
          status: "ready",
          providerId: "volcengine",
          modelId: "O",
          ready: true,
          missing: [],
          hasAppId: true,
          hasToken: true,
          hasResourceId: true,
          startedAt: "2026-04-05T13:20:00.000Z",
          lastChunkAt: null,
          endedAt: null,
          receivedChunks: 0,
          receivedBytes: 0,
          sampleRateHz: 24000,
          channels: 1,
        };
      },
      async appendAudioChunk(chunk) {
        seenChunks.push(chunk);
        return {
          callId: chunk.callId,
          status: "streaming",
          providerId: "volcengine",
          modelId: "O",
          ready: true,
          missing: [],
          hasAppId: true,
          hasToken: true,
          hasResourceId: true,
          startedAt: "2026-04-05T13:20:00.000Z",
          lastChunkAt: "2026-04-05T13:20:01.000Z",
          endedAt: null,
          receivedChunks: 1,
          receivedBytes: 4,
          sampleRateHz: 24000,
          channels: 1,
        };
      },
      getOutputAudio({ callId, afterSequence, limit }) {
        assert.equal(callId, "call_voice_1");
        assert.equal(limit, 8);
        if (afterSequence >= 0 || outputDelivered) {
          return {
            chunks: [],
            session: this.getSession(callId),
          };
        }
        outputDelivered = true;
        return {
          chunks: [
            {
              sequence: 0,
              audioBase64: Buffer.from([9, 8, 7, 6]).toString("base64"),
              mimeType: "audio/pcm",
              sampleRateHz: 24000,
              channels: 1,
              durationMs: 80,
            },
          ],
          session: this.getSession(callId),
        };
      },
    },
    outputPollIntervalMs: 10,
  });
  server.on("upgrade", bridge.handleUpgrade);

  const baseUrl = await listen(server);
  const socket = new WebSocket(`${baseUrl}/calls/call_voice_1/realtime`, {
    headers: {
      Authorization: "Bearer bridge_secret",
    },
  });

  try {
    await waitForOpen(socket);
    const initialPromise = waitForMessage(socket);
    socket.send(JSON.stringify({ type: "hello" }));

    const initial = await initialPromise;
    assert.deepEqual(initial, {
      type: "session.state",
      session: {
        callId: "call_voice_1",
        status: "ready",
        providerId: "volcengine",
        modelId: "O",
        ready: true,
        missing: [],
        hasAppId: true,
        hasToken: true,
        hasResourceId: true,
        startedAt: "2026-04-05T13:20:00.000Z",
        lastChunkAt: null,
        endedAt: null,
        receivedChunks: 0,
        receivedBytes: 0,
        sampleRateHz: 24000,
        channels: 1,
      },
    });

    const streamedPromise = waitForMessages(socket, 2);
    socket.send(JSON.stringify({
      type: "audio.input",
      chunk: {
        audioBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
        mimeType: "audio/pcm",
        sequence: 7,
        sampleRateHz: 24000,
        channels: 1,
        durationMs: 100,
      },
    }));

    const streamed = await streamedPromise;

    assert.equal(seenChunks.length, 1);
    assert.equal(seenChunks[0].callId, "call_voice_1");
    assert.equal(seenChunks[0].sequence, 7);
    assert.deepEqual(streamed, [
      {
        type: "session.state",
        session: {
          callId: "call_voice_1",
          status: "streaming",
          providerId: "volcengine",
          modelId: "O",
          ready: true,
          missing: [],
          hasAppId: true,
          hasToken: true,
          hasResourceId: true,
          startedAt: "2026-04-05T13:20:00.000Z",
          lastChunkAt: "2026-04-05T13:20:01.000Z",
          endedAt: null,
          receivedChunks: 1,
          receivedBytes: 4,
          sampleRateHz: 24000,
          channels: 1,
        },
      },
      {
        type: "audio.output",
        chunk: {
          sequence: 0,
          audioBase64: Buffer.from([9, 8, 7, 6]).toString("base64"),
          mimeType: "audio/pcm",
          sampleRateHz: 24000,
          channels: 1,
          durationMs: 80,
        },
      },
    ]);
  } finally {
    bridge.close();
    await closeSocket(socket);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("voice bridge realtime server pushes transcript and assistant events to connected clients", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const bridge = createVoiceBridgeRealtimeServer({
    token: "bridge_secret",
    voiceSessionManager: {
      getSession(callId) {
        return {
          callId,
          status: "ready",
          providerId: "volcengine",
          modelId: "O",
          ready: true,
          missing: [],
          hasAppId: true,
          hasToken: true,
          hasResourceId: true,
          startedAt: "2026-04-05T13:21:00.000Z",
          lastChunkAt: null,
          endedAt: null,
          receivedChunks: 0,
          receivedBytes: 0,
          sampleRateHz: 24000,
          channels: 1,
        };
      },
      async appendAudioChunk() {
        throw new Error("not_expected");
      },
      getOutputAudio({ callId }) {
        return {
          chunks: [],
          session: this.getSession(callId),
        };
      },
    },
    outputPollIntervalMs: 10,
  });
  server.on("upgrade", bridge.handleUpgrade);

  const baseUrl = await listen(server);
  const socket = new WebSocket(`${baseUrl}/calls/call_voice_1/realtime`, {
    headers: {
      Authorization: "Bearer bridge_secret",
    },
  });

  try {
    await waitForOpen(socket);
    const initialPromise = waitForMessage(socket);
    socket.send(JSON.stringify({ type: "hello" }));
    await initialPromise;

    const interactionMessagesPromise = waitForMessages(socket, 2);
    bridge.publishInteraction({
      callId: "call_voice_1",
      kind: "user_final",
      text: "你好，帮我记一下",
      providerId: "volcengine",
      modelId: "O",
    });
    bridge.publishInteraction({
      callId: "call_voice_1",
      kind: "assistant_final",
      text: "好的，我已经记下来了。",
      providerId: "volcengine",
      modelId: "O",
    });

    const [first, second] = await interactionMessagesPromise;
    assert.deepEqual(first, {
      type: "transcript.final",
      interaction: {
        callId: "call_voice_1",
        kind: "user_final",
        text: "你好，帮我记一下",
        providerId: "volcengine",
        modelId: "O",
      },
    });
    assert.deepEqual(second, {
      type: "assistant.final",
      interaction: {
        callId: "call_voice_1",
        kind: "assistant_final",
        text: "好的，我已经记下来了。",
        providerId: "volcengine",
        modelId: "O",
      },
    });
  } finally {
    bridge.close();
    await closeSocket(socket);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("voice bridge realtime server rejects unauthorized websocket upgrades", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  const bridge = createVoiceBridgeRealtimeServer({
    token: "bridge_secret",
    voiceSessionManager: {
      getSession() {
        return null;
      },
      async appendAudioChunk() {},
      getOutputAudio() {
        return { chunks: [], session: null };
      },
    },
    outputPollIntervalMs: 10,
  });
  server.on("upgrade", bridge.handleUpgrade);

  const baseUrl = await listen(server);
  const socket = new WebSocket(`${baseUrl}/calls/call_voice_1/realtime`);

  try {
    const statusCode = await waitForUnexpectedResponse(socket);
    assert.equal(statusCode, 401);
  } finally {
    bridge.close();
    await closeSocket(socket);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});
