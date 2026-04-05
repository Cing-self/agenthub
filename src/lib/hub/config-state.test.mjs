import test from "node:test";
import assert from "node:assert/strict";

import {
  compactHubMediaConfig,
  compactProviderConfig,
  normalizeHubConfigState,
} from "./config-state.js";

test("normalizeHubConfigState preserves provider audio/vision config and hub media defaults", () => {
  const state = normalizeHubConfigState({
    providers: [
      {
        id: "volcengine",
        name: "Doubao",
        apiKey: "test-key",
        endpoints: [{ baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiType: "openai" }],
        audio: {
          transcriptionModel: "doubao-asr-realtime-preview",
          realtimeAsrModel: "doubao-asr-streaming-v2",
          realtimeVoiceModel: "doubao-realtime-voice",
          realtimeAppId: "app-123",
          realtimeAppKey: "app-key-123",
          realtimeToken: "token-123",
          realtimeResourceId: "volc.speech.dialog",
        },
        vision: {
          reasoningModel: "doubao-vision",
        },
      },
    ],
    media: {
      voice: {
        asrProviderId: "volcengine",
        asrModelId: "doubao-asr-streaming-v2",
        realtimeProviderId: "volcengine",
        realtimeModelId: "doubao-realtime-voice",
      },
      video: {
        reasoningProviderId: "googleapis",
        reasoningModelId: "gemini-2.5-flash",
      },
    },
  });

  assert.equal(state.providers[0]?.audio?.transcriptionModel, "doubao-asr-realtime-preview");
  assert.equal(state.providers[0]?.audio?.realtimeAsrModel, "doubao-asr-streaming-v2");
  assert.equal(state.providers[0]?.audio?.realtimeVoiceModel, "doubao-realtime-voice");
  assert.equal(state.providers[0]?.audio?.realtimeAppId, "app-123");
  assert.equal(state.providers[0]?.audio?.realtimeAppKey, "app-key-123");
  assert.equal(state.providers[0]?.audio?.realtimeToken, "token-123");
  assert.equal(state.providers[0]?.audio?.realtimeResourceId, "volc.speech.dialog");
  assert.equal(state.providers[0]?.vision?.reasoningModel, "doubao-vision");
  assert.equal(state.media?.voice?.asrProviderId, "volcengine");
  assert.equal(state.media?.voice?.realtimeProviderId, "volcengine");
  assert.equal(state.media?.voice?.realtimeModelId, "doubao-realtime-voice");
  assert.equal(state.media?.video?.reasoningModelId, "gemini-2.5-flash");
});

test("compactProviderConfig drops empty audio and vision fields before save", () => {
  const provider = compactProviderConfig({
    id: "volcengine",
    name: "Doubao",
    apiKey: "test-key",
    endpoints: [{ baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiType: "openai" }],
    audio: {
      transcriptionModel: "  doubao-asr-realtime-preview  ",
      realtimeAsrModel: "   ",
      realtimeVoiceModel: "  doubao-realtime-voice ",
      realtimeAppId: " app-123 ",
      realtimeAppKey: " app-key-123 ",
      realtimeToken: " token-123 ",
      realtimeResourceId: " ",
    },
    vision: {
      reasoningModel: " ",
    },
  });

  assert.deepEqual(provider.audio, {
    transcriptionModel: "doubao-asr-realtime-preview",
    realtimeVoiceModel: "doubao-realtime-voice",
    realtimeAppId: "app-123",
    realtimeAppKey: "app-key-123",
    realtimeToken: "token-123",
  });
  assert.equal(provider.vision, undefined);
});

test("compactHubMediaConfig trims values and drops empty sections", () => {
  const media = compactHubMediaConfig({
    voice: {
      asrProviderId: " volcengine ",
      asrModelId: " ",
      realtimeProviderId: " volcengine ",
      realtimeModelId: " doubao-realtime-voice ",
    },
    video: {
      reasoningProviderId: "",
      reasoningModelId: " gemini-2.5-flash ",
    },
  });

  assert.deepEqual(media, {
    voice: {
      asrProviderId: "volcengine",
      realtimeProviderId: "volcengine",
      realtimeModelId: "doubao-realtime-voice",
    },
    video: {
      reasoningModelId: "gemini-2.5-flash",
    },
  });
});

test("compactHubMediaConfig returns null when every media field is blank", () => {
  const media = compactHubMediaConfig({
    voice: {
      asrProviderId: " ",
      asrModelId: "",
      realtimeProviderId: "",
      realtimeModelId: "  ",
    },
    video: {
      reasoningProviderId: " ",
      reasoningModelId: "",
    },
  });

  assert.equal(media, null);
});
