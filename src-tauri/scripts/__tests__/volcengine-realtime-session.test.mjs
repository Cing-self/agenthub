import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVolcengineServerResponse,
  createVolcengineRealtimeSession,
  parseVolcengineFrame,
} from "../volcengine-realtime-session.mjs";

class FakeWebSocket {
  constructor(url, protocols, options) {
    this.url = url;
    this.protocols = protocols;
    this.options = options;
    this.sent = [];
    this.listeners = new Map();
    this.closed = false;
    queueMicrotask(() => this.#emit("open", {}));
  }

  addEventListener(type, listener) {
    const items = this.listeners.get(type) || [];
    items.push(listener);
    this.listeners.set(type, items);
  }

  removeEventListener(type, listener) {
    const items = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      items.filter((item) => item !== listener),
    );
  }

  send(data) {
    this.sent.push(Buffer.from(data));
  }

  close(code = 1000, reason = "normal") {
    this.closed = true;
    queueMicrotask(() => this.#emit("close", { code, reason }));
  }

  receive(data) {
    this.#emit("message", { data });
  }

  #emit(type, event) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

function buildRawVolcengineErrorFrame({ errorCode, payload }) {
  const payloadBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from([0x11, 0xf0, 0x10, 0x00]);
  const codeBuffer = Buffer.alloc(4);
  codeBuffer.writeUInt32BE(errorCode, 0);
  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(payloadBuffer.length, 0);
  return Buffer.concat([header, codeBuffer, payloadLength, payloadBuffer]);
}

test("volcengine realtime session opens the dialogue websocket and sends start requests", async () => {
  const sockets = [];
  const session = await createVolcengineRealtimeSession({
    call: { callId: "call_voice_1" },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      apiKey: "ark_api_key",
      appKey: "app_key_123",
      appId: "app_id_123",
      token: "access_key_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
    webSocketFactory: (url, protocols, options) => {
      const socket = new FakeWebSocket(url, protocols, options);
      sockets.push(socket);
      return socket;
    },
    connectIdFactory: () => "connect_123",
  });

  const socket = sockets[0];
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(socket.url, "wss://openspeech.bytedance.com/api/v3/realtime/dialogue");
  assert.deepEqual(socket.options?.headers, {
    "X-Api-App-ID": "app_id_123",
    "X-Api-App-Key": "app_key_123",
    "X-Api-Access-Key": "access_key_456",
    "X-Api-Resource-Id": "volc.speech.dialog",
    "X-Api-Connect-Id": "connect_123",
  });
  assert.equal(socket.sent.length, 2);

  const startConnection = parseVolcengineFrame(socket.sent[0]);
  assert.equal(startConnection.kind, "client_full_request");
  assert.equal(startConnection.event, 1);
  assert.deepEqual(startConnection.payload, {});

  const startSession = parseVolcengineFrame(socket.sent[1]);
  assert.equal(startSession.kind, "client_full_request");
  assert.equal(startSession.event, 100);
  assert.equal(startSession.sessionId, "call_voice_1");
  assert.equal(startSession.payload?.dialog?.extra?.input_mod, "audio");
  assert.equal(startSession.payload?.tts?.audio_config?.format, "pcm");

  assert.equal(session.getSummary().status, "connecting");
});

test("volcengine realtime session forwards audio requests and tracks provider output state", async () => {
  let socket = null;
  const session = await createVolcengineRealtimeSession({
    call: { callId: "call_voice_1" },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      apiKey: "ark_api_key",
      appKey: "app_key_123",
      appId: "app_id_123",
      token: "access_key_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
    webSocketFactory: (url, protocols, options) => {
      socket = new FakeWebSocket(url, protocols, options);
      return socket;
    },
    connectIdFactory: () => "connect_123",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.receive(
    buildVolcengineServerResponse({
      kind: "server_full_response",
      event: 150,
      sessionId: "call_voice_1",
      payload: {
        asr_text: "你好",
      },
    }),
  );
  socket.receive(
    buildVolcengineServerResponse({
      kind: "server_ack",
      event: 250,
      sessionId: "call_voice_1",
      payload: Buffer.from([1, 2, 3, 4]),
      payloadFormat: "binary",
      compression: "none",
    }),
  );

  await session.appendAudioChunk({
    buffer: Buffer.from([10, 11, 12, 13]),
    mimeType: "audio/pcm",
    sequence: 7,
    sampleRateHz: 16000,
    channels: 1,
    durationMs: 120,
  });

  const audioFrame = parseVolcengineFrame(socket.sent[2]);
  assert.equal(audioFrame.kind, "client_audio_only_request");
  assert.equal(audioFrame.event, 200);
  assert.equal(audioFrame.sessionId, "call_voice_1");
  assert.deepEqual(audioFrame.payload, Buffer.from([10, 11, 12, 13]));

  socket.receive(
    buildVolcengineServerResponse({
      kind: "server_full_response",
      event: 350,
      sessionId: "call_voice_1",
      payload: {
        answer: "你好，我在。",
      },
    }),
  );
  socket.receive(
    buildVolcengineServerResponse({
      kind: "server_full_response",
      event: 359,
      sessionId: "call_voice_1",
      payload: {
        reply_text: "你好，我在。",
      },
    }),
  );

  assert.deepEqual(session.getSummary(), {
    status: "streaming",
    lastEvent: 359,
    inputAudioChunks: 1,
    inputAudioBytes: 4,
    outputAudioBytes: 4,
    userTranscript: "你好",
    assistantText: "你好，我在。",
    eventsReceived: 4,
    lastError: null,
    sessionId: "call_voice_1",
  });

  assert.deepEqual(session.consumeOutputAudio({ afterSequence: -1, limit: 8 }), [
    {
      sequence: 0,
      audioBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
      mimeType: "audio/pcm",
      sampleRateHz: 24000,
      channels: 1,
      durationMs: null,
    },
  ]);
  assert.deepEqual(session.consumeOutputAudio({ afterSequence: 0, limit: 8 }), []);
});

test("volcengine realtime session normalizes float32 pcm output audio into int16 bridge chunks", async () => {
  let socket = null;
  const session = await createVolcengineRealtimeSession({
    call: { callId: "call_voice_float_1" },
    session: {
      providerId: "volcengine",
      modelId: "O",
      apiKey: "ark_api_key",
      appKey: "app_key_123",
      appId: "app_id_123",
      token: "access_key_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
    webSocketFactory: (url, protocols, options) => {
      socket = new FakeWebSocket(url, protocols, options);
      return socket;
    },
    connectIdFactory: () => "connect_float_123",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const floatPcm = Buffer.alloc(16);
  floatPcm.writeFloatLE(0.0, 0);
  floatPcm.writeFloatLE(0.5, 4);
  floatPcm.writeFloatLE(-0.5, 8);
  floatPcm.writeFloatLE(1.0, 12);

  socket.receive(
    buildVolcengineServerResponse({
      kind: "server_ack",
      event: 250,
      sessionId: "call_voice_float_1",
      payload: floatPcm,
      payloadFormat: "binary",
      compression: "none",
    }),
  );

  const chunks = session.consumeOutputAudio({ afterSequence: -1, limit: 4 });
  const normalized = Buffer.from(chunks[0].audioBase64, "base64");

  assert.equal(chunks.length, 1);
  assert.deepEqual([...normalized], [
    0x00, 0x00,
    0x00, 0x40,
    0x00, 0xc0,
    0xff, 0x7f,
  ]);
});

test("volcengine realtime session uses realtime app key instead of provider api key for websocket auth", async () => {
  let socket = null;

  await createVolcengineRealtimeSession({
    call: { callId: "call_voice_2" },
    session: {
      providerId: "volcengine",
      modelId: "O",
      apiKey: "ark_api_key",
      appKey: "app_key_456",
      appId: "app_id_456",
      token: "access_key_789",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
    webSocketFactory: (url, protocols, options) => {
      socket = new FakeWebSocket(url, protocols, options);
      return socket;
    },
    connectIdFactory: () => "connect_456",
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(socket.options?.headers?.["X-Api-App-Key"], "app_key_456");
});

test("parseVolcengineFrame parses server error responses that omit session ids", () => {
  const frame = buildRawVolcengineErrorFrame({
    errorCode: 45000001,
    payload: {
      error: "invalid X-Api-App-Key",
    },
  });

  assert.deepEqual(parseVolcengineFrame(frame), {
    kind: "server_error_response",
    event: null,
    errorCode: 45000001,
    sessionId: null,
    serialization: "json",
    compression: "none",
    payload: {
      error: "invalid X-Api-App-Key",
    },
  });
});
