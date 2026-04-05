import test from "node:test";
import assert from "node:assert/strict";

import { createGatewayVoiceSessionManager } from "../gateway-voice-session.mjs";

test("gateway voice session manager starts a ready realtime session", async () => {
  const started = [];
  const manager = createGatewayVoiceSessionManager({
    now: () => "2026-04-05T00:30:00.000Z",
    createProviderSession: async ({ call, session }) => {
      started.push({ callId: call.callId, providerId: session.providerId });
      return {
        getSummary() {
          return {
            status: "connecting",
            lastEvent: 100,
            inputAudioChunks: 0,
            inputAudioBytes: 0,
            outputAudioBytes: 0,
            userTranscript: null,
            assistantText: null,
            eventsReceived: 0,
            lastError: null,
            sessionId: call.callId,
          };
        },
        async appendAudioChunk() {},
        async close() {},
      };
    },
  });

  const summary = await manager.startSession({
    call: {
      callId: "call_voice_1",
    },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      token: "token_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
  });

  assert.deepEqual(started, [{ callId: "call_voice_1", providerId: "volcengine" }]);
  assert.equal(summary.callId, "call_voice_1");
  assert.equal(summary.status, "ready");
  assert.equal(summary.receivedChunks, 0);
  assert.equal(summary.receivedBytes, 0);
  assert.equal(summary.startedAt, "2026-04-05T00:30:00.000Z");
  assert.deepEqual(summary.providerState, {
    status: "connecting",
    lastEvent: 100,
    inputAudioChunks: 0,
    inputAudioBytes: 0,
    outputAudioBytes: 0,
    userTranscript: null,
    assistantText: null,
    eventsReceived: 0,
    lastError: null,
    sessionId: "call_voice_1",
  });
});

test("gateway voice session manager forwards decoded audio chunks and updates stream stats", async () => {
  const seenChunks = [];
  const providerState = {
    status: "connecting",
    lastEvent: 100,
    inputAudioChunks: 0,
    inputAudioBytes: 0,
    outputAudioBytes: 0,
    userTranscript: null,
    assistantText: null,
    eventsReceived: 0,
    lastError: null,
    sessionId: "call_voice_1",
  };
  const manager = createGatewayVoiceSessionManager({
    now: (() => {
      const values = [
        "2026-04-05T00:31:00.000Z",
        "2026-04-05T00:31:01.000Z",
      ];
      return () => values.shift() || "2026-04-05T00:31:01.000Z";
    })(),
    createProviderSession: async () => ({
      async appendAudioChunk(chunk) {
        seenChunks.push(chunk);
        providerState.status = "streaming";
        providerState.lastEvent = 200;
        providerState.inputAudioChunks += 1;
        providerState.inputAudioBytes += chunk.buffer.length;
      },
      getSummary() {
        return { ...providerState };
      },
      async close() {},
    }),
  });

  await manager.startSession({
    call: { callId: "call_voice_1" },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      token: "token_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
  });

  const summary = await manager.appendAudioChunk({
    callId: "call_voice_1",
    audioBase64: Buffer.from([0, 1, 2, 3]).toString("base64"),
    mimeType: "audio/pcm",
    sequence: 7,
    sampleRateHz: 16000,
    channels: 1,
    durationMs: 120,
  });

  assert.equal(seenChunks.length, 1);
  assert.equal(seenChunks[0].sequence, 7);
  assert.equal(seenChunks[0].buffer.length, 4);
  assert.equal(seenChunks[0].sampleRateHz, 16000);
  assert.equal(summary.status, "streaming");
  assert.equal(summary.receivedChunks, 1);
  assert.equal(summary.receivedBytes, 4);
  assert.equal(summary.sampleRateHz, 16000);
  assert.equal(summary.channels, 1);
  assert.equal(summary.lastChunkAt, "2026-04-05T00:31:01.000Z");
  assert.deepEqual(summary.providerState, {
    status: "streaming",
    lastEvent: 200,
    inputAudioChunks: 1,
    inputAudioBytes: 4,
    outputAudioBytes: 0,
    userTranscript: null,
    assistantText: null,
    eventsReceived: 0,
    lastError: null,
    sessionId: "call_voice_1",
  });
});

test("gateway voice session manager blocks chunk ingestion when realtime config is missing", async () => {
  const manager = createGatewayVoiceSessionManager({
    now: () => "2026-04-05T00:32:00.000Z",
    createProviderSession: async () => ({
      async appendAudioChunk() {},
      async close() {},
    }),
  });

  await manager.startSession({
    call: { callId: "call_voice_1" },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      token: null,
      resourceId: null,
      ready: false,
      missing: ["realtimeToken", "realtimeResourceId"],
    },
  });

  await assert.rejects(
    () => manager.appendAudioChunk({
      callId: "call_voice_1",
      audioBase64: Buffer.from([0, 1]).toString("base64"),
      mimeType: "audio/pcm",
      sequence: 1,
      sampleRateHz: 16000,
      channels: 1,
      durationMs: 40,
    }),
    /voice_session_not_ready/,
  );
});

test("gateway voice session manager returns provider output audio chunks for bridge playback", async () => {
  const manager = createGatewayVoiceSessionManager({
    now: () => "2026-04-05T00:33:00.000Z",
    createProviderSession: async () => ({
      getSummary() {
        return {
          status: "streaming",
          lastEvent: 359,
          inputAudioChunks: 1,
          inputAudioBytes: 3200,
          outputAudioBytes: 6400,
          userTranscript: "你好",
          assistantText: "你好，我在。",
          eventsReceived: 4,
          lastError: null,
          sessionId: "call_voice_1",
        };
      },
      consumeOutputAudio() {
        return [
          {
            sequence: 3,
            buffer: Buffer.from([9, 8, 7, 6]),
            mimeType: "audio/pcm",
            sampleRateHz: 24000,
            channels: 1,
            durationMs: 80,
          },
        ];
      },
      async appendAudioChunk() {},
      async close() {},
    }),
  });

  await manager.startSession({
    call: { callId: "call_voice_1" },
    session: {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      apiKey: "volc_api_key",
      appId: "app_123",
      token: "token_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
  });

  const output = manager.getOutputAudio({
    callId: "call_voice_1",
    afterSequence: 2,
    limit: 8,
  });

  assert.deepEqual(output, {
    chunks: [
      {
        sequence: 3,
        audioBase64: Buffer.from([9, 8, 7, 6]).toString("base64"),
        mimeType: "audio/pcm",
        sampleRateHz: 24000,
        channels: 1,
        durationMs: 80,
      },
    ],
    session: {
      callId: "call_voice_1",
      status: "ready",
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      ready: true,
      missing: [],
      hasAppId: true,
      hasAppKey: false,
      hasToken: true,
      hasResourceId: true,
      startedAt: "2026-04-05T00:33:00.000Z",
      lastChunkAt: null,
      endedAt: null,
      receivedChunks: 0,
      receivedBytes: 0,
      sampleRateHz: null,
      channels: null,
      providerState: {
        status: "streaming",
        lastEvent: 359,
        inputAudioChunks: 1,
        inputAudioBytes: 3200,
        outputAudioBytes: 6400,
        userTranscript: "你好",
        assistantText: "你好，我在。",
        eventsReceived: 4,
        lastError: null,
        sessionId: "call_voice_1",
      },
    },
  });
});

test("gateway voice session manager forwards normalized final interactions from the provider session", async () => {
  const seenInteractions = [];
  let emitInteraction = async () => {};
  const manager = createGatewayVoiceSessionManager({
    now: () => "2026-04-05T13:10:00.000Z",
    onInteraction: async (interaction) => {
      seenInteractions.push(interaction);
    },
    createProviderSession: async () => ({
      configureInteractionSink(sink) {
        emitInteraction = sink;
      },
      getSummary() {
        return {
          status: "streaming",
          lastEvent: 152,
          inputAudioChunks: 12,
          inputAudioBytes: 57600,
          outputAudioBytes: 32000,
          userTranscript: "你好，帮我记一下",
          assistantText: "好的，我已经记下来了。",
          eventsReceived: 8,
          lastError: null,
          sessionId: "call_voice_1",
        };
      },
      async appendAudioChunk() {},
      async close() {},
    }),
  });

  await manager.startSession({
    call: {
      callId: "call_voice_1",
      sessionId: "thread_123",
    },
    session: {
      providerId: "volcengine",
      modelId: "O",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      appKey: "app_key_123",
      token: "token_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
  });

  await emitInteraction({
    kind: "user_final",
    text: "你好，帮我记一下",
    sourceEvent: 151,
  });
  await emitInteraction({
    kind: "assistant_final",
    text: "好的，我已经记下来了。",
    sourceEvent: 152,
  });

  assert.deepEqual(seenInteractions, [
    {
      callId: "call_voice_1",
      threadId: "thread_123",
      kind: "user_final",
      text: "你好，帮我记一下",
      providerId: "volcengine",
      modelId: "O",
      sourceEvent: 151,
      occurredAt: "2026-04-05T13:10:00.000Z",
    },
    {
      callId: "call_voice_1",
      threadId: "thread_123",
      kind: "assistant_final",
      text: "好的，我已经记下来了。",
      providerId: "volcengine",
      modelId: "O",
      sourceEvent: 152,
      occurredAt: "2026-04-05T13:10:00.000Z",
    },
  ]);
});

test("gateway voice session manager enables per-call diagnostics across bridge and provider layers", async () => {
  const diagnostics = [];
  const providerDiagnostics = [];
  const manager = createGatewayVoiceSessionManager({
    now: () => "2026-04-05T00:34:00.000Z",
    logDiagnostics(entry) {
      diagnostics.push(entry);
    },
    createProviderSession: async () => ({
      configureDiagnostics(context) {
        providerDiagnostics.push(context);
      },
      getSummary() {
        return {
          status: "streaming",
          lastEvent: 200,
          inputAudioChunks: 0,
          inputAudioBytes: 0,
          outputAudioBytes: 0,
          userTranscript: null,
          assistantText: null,
          eventsReceived: 0,
          lastError: null,
          sessionId: "call_voice_diag_1",
        };
      },
      async appendAudioChunk() {},
      consumeOutputAudio() {
        return [];
      },
      async close() {},
    }),
  });

  await manager.startSession({
    call: { callId: "call_voice_diag_1" },
    session: {
      providerId: "volcengine",
      modelId: "O",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      appKey: "app_key_123",
      token: "token_456",
      resourceId: "volc.speech.dialog",
      ready: true,
      missing: [],
    },
  });

  await manager.appendAudioChunk({
    callId: "call_voice_diag_1",
    audioBase64: Buffer.from([0, 1, 2, 3]).toString("base64"),
    mimeType: "audio/pcm",
    sequence: 3,
    sampleRateHz: 24000,
    channels: 1,
    durationMs: 80,
    diagnostics: {
      enabled: true,
      source: "ios-app",
      transport: "direct-bridge",
    },
  });

  manager.getOutputAudio({
    callId: "call_voice_diag_1",
    diagnostics: {
      enabled: true,
      source: "ios-app",
      transport: "direct-bridge",
    },
  });

  assert.deepEqual(
    providerDiagnostics.map(({ enabled, source, transport, callId }) => ({
      enabled,
      source,
      transport,
      callId,
    })),
    [
      {
        enabled: true,
        source: "ios-app",
        transport: "direct-bridge",
        callId: "call_voice_diag_1",
      },
    ],
  );
  assert.deepEqual(
    diagnostics
      .filter((entry) => entry.source === "ios-app" && entry.callId === "call_voice_diag_1")
      .map((entry) => entry.event),
    [
      "voice-session:append-chunk",
      "voice-session:get-output",
    ],
  );
});
