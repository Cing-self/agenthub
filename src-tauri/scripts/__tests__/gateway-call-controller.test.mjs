import test from "node:test";
import assert from "node:assert/strict";

import {
  createGatewayCallController,
  resolveGatewayVoiceSessionConfig,
} from "../gateway-call-controller.mjs";

test("gateway call controller promotes a dialing relay call to live once", async () => {
  const fetchCalls = [];
  let activeCallState = "dialing";

  const fetchImpl = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });

    if (String(url).endsWith("/api/hosts/host_123/calls/active")) {
      return new Response(
        JSON.stringify({
          ok: true,
          call: {
            callId: "call_voice_1",
            hostId: "host_123",
            clientId: "client_ios_1",
            sessionId: "thread_123",
            mode: "audio",
            state: activeCallState,
            createdAt: "2026-04-04T03:50:00.000Z",
            updatedAt: "2026-04-04T03:50:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (String(url).endsWith("/api/hosts/host_123/calls/call_voice_1/events")) {
      const body = JSON.parse(options.body);
      activeCallState = body.state;
      return new Response(
        JSON.stringify({
          ok: true,
          call: {
            callId: "call_voice_1",
            hostId: "host_123",
            clientId: "client_ios_1",
            sessionId: "thread_123",
            mode: "audio",
            state: body.state,
            createdAt: "2026-04-04T03:50:00.000Z",
            updatedAt: body.updatedAt,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const acceptedCalls = [];
  const controller = createGatewayCallController({
    relayBaseUrl: "https://relay.example.workers.dev",
    hostId: "host_123",
    fetchImpl,
    now: (() => {
      const values = [
        "2026-04-04T03:50:01.000Z",
        "2026-04-04T03:50:02.000Z",
      ];
      return () => values.shift() || "2026-04-04T03:50:02.000Z";
    })(),
    onAcceptCall: async (call) => {
      acceptedCalls.push(call.callId);
    },
  });

  const first = await controller.tick();
  const second = await controller.tick();

  assert.equal(first?.state, "live");
  assert.equal(second?.state, "live");
  assert.deepEqual(acceptedCalls, ["call_voice_1"]);

  const eventCalls = fetchCalls.filter((call) => call.url.endsWith("/events"));
  assert.equal(eventCalls.length, 2);
  assert.match(eventCalls[0].options.body, /"connecting"/);
  assert.match(eventCalls[1].options.body, /"live"/);
});

test("gateway call controller resolves a realtime voice session when accepting an audio call", async () => {
  let activeCallState = "dialing";
  const startedSessions = [];

  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith("/api/hosts/host_123/calls/active")) {
      return new Response(
        JSON.stringify({
          ok: true,
          call: {
            callId: "call_voice_1",
            hostId: "host_123",
            clientId: "client_ios_1",
            sessionId: "thread_123",
            mode: "audio",
            state: activeCallState,
            createdAt: "2026-04-04T03:50:00.000Z",
            updatedAt: "2026-04-04T03:50:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (String(url).endsWith("/api/hosts/host_123/calls/call_voice_1/events")) {
      const body = JSON.parse(options.body);
      activeCallState = body.state;
      return new Response(
        JSON.stringify({
          ok: true,
          call: {
            callId: "call_voice_1",
            hostId: "host_123",
            clientId: "client_ios_1",
            sessionId: "thread_123",
            mode: "audio",
            state: body.state,
            createdAt: "2026-04-04T03:50:00.000Z",
            updatedAt: body.updatedAt,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const controller = createGatewayCallController({
    relayBaseUrl: "https://relay.example.workers.dev",
    hostId: "host_123",
    fetchImpl,
    now: () => "2026-04-04T03:50:01.000Z",
    loadHub: async () => ({
      providers: [
        {
          id: "volcengine",
          apiKey: "ark_api_key",
          endpoints: [
            {
              baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
              apiType: "openai",
            },
          ],
          audio: {
            realtimeVoiceModel: "doubao-realtime-voice",
            realtimeAppId: "app_123",
            realtimeAppKey: "volc_app_key",
            realtimeToken: "token_456",
            realtimeResourceId: "volc.bigasr.speech",
          },
        },
      ],
      media: {
        voice: {
          realtimeProviderId: "volcengine",
          realtimeModelId: "doubao-realtime-voice",
        },
      },
    }),
    onStartVoiceSession: async ({ session }) => {
      startedSessions.push(session);
    },
  });

  await controller.tick();

  assert.deepEqual(startedSessions, [
    {
      providerId: "volcengine",
      modelId: "doubao-realtime-voice",
      apiKey: "ark_api_key",
      appKey: "volc_app_key",
      endpoint: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiType: "openai",
      },
      appId: "app_123",
      token: "token_456",
      resourceId: "volc.bigasr.speech",
      ready: true,
      missing: [],
    },
  ]);
});

test("gateway call controller recreates a realtime voice session for an already-live audio call after restart", async () => {
  const acceptedCalls = [];
  const startedSessions = [];

  const fetchImpl = async (url) => {
    if (String(url).endsWith("/api/hosts/host_123/calls/active")) {
      return new Response(
        JSON.stringify({
          ok: true,
          call: {
            callId: "call_voice_1",
            hostId: "host_123",
            clientId: "client_ios_1",
            sessionId: "thread_123",
            mode: "audio",
            state: "live",
            createdAt: "2026-04-04T03:50:00.000Z",
            updatedAt: "2026-04-04T03:50:02.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch call: ${url}`);
  };

  const controller = createGatewayCallController({
    relayBaseUrl: "https://relay.example.workers.dev",
    hostId: "host_123",
    fetchImpl,
    loadHub: async () => ({
      providers: [
        {
          id: "volcengine",
          apiKey: "ark_api_key",
          endpoints: [
            {
              baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
              apiType: "openai",
            },
          ],
          audio: {
            realtimeVoiceModel: "doubao-realtime-voice",
            realtimeAppId: "app_123",
            realtimeAppKey: "volc_app_key",
            realtimeToken: "token_456",
            realtimeResourceId: "volc.bigasr.speech",
          },
        },
      ],
      media: {
        voice: {
          realtimeProviderId: "volcengine",
          realtimeModelId: "doubao-realtime-voice",
        },
      },
    }),
    onAcceptCall: async (call) => {
      acceptedCalls.push(call.callId);
    },
    onStartVoiceSession: async ({ call, session }) => {
      startedSessions.push({
        callId: call.callId,
        session,
      });
    },
  });

  const first = await controller.tick();
  const second = await controller.tick();

  assert.equal(first?.state, "live");
  assert.equal(second?.state, "live");
  assert.deepEqual(acceptedCalls, []);
  assert.deepEqual(startedSessions, [
    {
      callId: "call_voice_1",
      session: {
        providerId: "volcengine",
        modelId: "doubao-realtime-voice",
        apiKey: "ark_api_key",
        appKey: "volc_app_key",
        endpoint: {
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          apiType: "openai",
        },
        appId: "app_123",
        token: "token_456",
        resourceId: "volc.bigasr.speech",
        ready: true,
        missing: [],
      },
    },
  ]);
});

test("resolveGatewayVoiceSessionConfig uses the effective call voice target and provider realtime credentials", () => {
  const session = resolveGatewayVoiceSessionConfig({
    hub: {
      providers: [
        {
          id: "volcengine",
          apiKey: "ark_api_key",
          endpoints: [
            {
              baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
              apiType: "openai",
            },
          ],
          audio: {
            realtimeVoiceModel: "doubao-default-voice",
            realtimeAppId: "app_123",
            realtimeAppKey: "volc_app_key",
            realtimeToken: "token_456",
            realtimeResourceId: "volc.bigasr.speech",
          },
        },
      ],
    },
    hostMediaDefaults: {
      voice: {
        providerId: "volcengine",
        modelId: "doubao-default-voice",
      },
    },
    call: {
      callId: "call_voice_1",
      mode: "audio",
      mediaConfig: {
        voice: {
          providerId: "volcengine",
          modelId: "doubao-realtime-voice",
        },
      },
    },
  });

  assert.deepEqual(session, {
    providerId: "volcengine",
    modelId: "doubao-realtime-voice",
    apiKey: "ark_api_key",
    appKey: "volc_app_key",
    endpoint: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiType: "openai",
    },
    appId: "app_123",
    token: "token_456",
    resourceId: "volc.bigasr.speech",
    ready: true,
    missing: [],
  });
});

test("resolveGatewayVoiceSessionConfig reports missing realtime credentials without dropping the target model", () => {
  const session = resolveGatewayVoiceSessionConfig({
    hub: {
      providers: [
        {
          id: "volcengine",
          apiKey: "ark_api_key",
          endpoints: [
            {
              baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
              apiType: "openai",
            },
          ],
          audio: {
            realtimeVoiceModel: "doubao-default-voice",
            realtimeAppId: "app_123",
            realtimeAppKey: "",
            realtimeToken: "",
            realtimeResourceId: "",
          },
        },
      ],
    },
    hostMediaDefaults: {
      voice: {
        providerId: "volcengine",
        modelId: "doubao-default-voice",
      },
    },
    call: {
      callId: "call_voice_1",
      mode: "audio",
      mediaConfig: null,
    },
  });

  assert.deepEqual(session, {
    providerId: "volcengine",
    modelId: "doubao-default-voice",
    apiKey: "ark_api_key",
    appKey: null,
    endpoint: {
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      apiType: "openai",
    },
    appId: "app_123",
    token: null,
    resourceId: null,
    ready: false,
    missing: ["realtimeAppKey", "realtimeToken", "realtimeResourceId"],
  });
});
