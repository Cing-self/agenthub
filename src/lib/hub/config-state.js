function trimToUndefined(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function compactProviderAudioConfig(audio) {
  if (!audio || typeof audio !== "object") return undefined;
  const transcriptionModel = trimToUndefined(audio.transcriptionModel);
  const realtimeAsrModel = trimToUndefined(audio.realtimeAsrModel);
  const realtimeVoiceModel = trimToUndefined(audio.realtimeVoiceModel);
  const realtimeAppId = trimToUndefined(audio.realtimeAppId);
  const realtimeAppKey = trimToUndefined(audio.realtimeAppKey);
  const realtimeToken = trimToUndefined(audio.realtimeToken);
  const realtimeResourceId = trimToUndefined(audio.realtimeResourceId);

  if (
    !transcriptionModel &&
    !realtimeAsrModel &&
    !realtimeVoiceModel &&
    !realtimeAppId &&
    !realtimeAppKey &&
    !realtimeToken &&
    !realtimeResourceId
  ) {
    return undefined;
  }
  return {
    ...(transcriptionModel ? { transcriptionModel } : {}),
    ...(realtimeAsrModel ? { realtimeAsrModel } : {}),
    ...(realtimeVoiceModel ? { realtimeVoiceModel } : {}),
    ...(realtimeAppId ? { realtimeAppId } : {}),
    ...(realtimeAppKey ? { realtimeAppKey } : {}),
    ...(realtimeToken ? { realtimeToken } : {}),
    ...(realtimeResourceId ? { realtimeResourceId } : {}),
  };
}

function compactProviderVisionConfig(vision) {
  if (!vision || typeof vision !== "object") return undefined;
  const reasoningModel = trimToUndefined(vision.reasoningModel);

  if (!reasoningModel) return undefined;
  return { reasoningModel };
}

function compactHubVoiceConfig(voice) {
  if (!voice || typeof voice !== "object") return undefined;
  const asrProviderId = trimToUndefined(voice.asrProviderId);
  const asrModelId = trimToUndefined(voice.asrModelId);
  const realtimeProviderId = trimToUndefined(voice.realtimeProviderId);
  const realtimeModelId = trimToUndefined(voice.realtimeModelId);

  if (!asrProviderId && !asrModelId && !realtimeProviderId && !realtimeModelId) return undefined;
  return {
    ...(asrProviderId ? { asrProviderId } : {}),
    ...(asrModelId ? { asrModelId } : {}),
    ...(realtimeProviderId ? { realtimeProviderId } : {}),
    ...(realtimeModelId ? { realtimeModelId } : {}),
  };
}

function compactHubVideoConfig(video) {
  if (!video || typeof video !== "object") return undefined;
  const reasoningProviderId = trimToUndefined(video.reasoningProviderId);
  const reasoningModelId = trimToUndefined(video.reasoningModelId);

  if (!reasoningProviderId && !reasoningModelId) return undefined;
  return {
    ...(reasoningProviderId ? { reasoningProviderId } : {}),
    ...(reasoningModelId ? { reasoningModelId } : {}),
  };
}

export function compactProviderConfig(provider) {
  return {
    ...provider,
    audio: compactProviderAudioConfig(provider.audio),
    vision: compactProviderVisionConfig(provider.vision),
  };
}

export function compactHubMediaConfig(media) {
  if (!media || typeof media !== "object") return null;
  const voice = compactHubVoiceConfig(media.voice);
  const video = compactHubVideoConfig(media.video);

  if (!voice && !video) return null;
  return {
    ...(voice ? { voice } : {}),
    ...(video ? { video } : {}),
  };
}

function normalizeProvider(provider) {
  if (Array.isArray(provider?.endpoints)) {
    return compactProviderConfig(provider);
  }

  return compactProviderConfig({
    id: provider?.id ?? "",
    name: provider?.name ?? "",
    apiKey: provider?.apiKey ?? "",
    endpoints: [
      {
        baseUrl: provider?.baseUrl ?? "",
        apiType: provider?.apiType ?? "openai",
      },
    ],
    audio: provider?.audio,
    vision: provider?.vision,
  });
}

export function normalizeHubConfigState(hub) {
  const providers = Array.isArray(hub?.providers)
    ? hub.providers.map(normalizeProvider)
    : hub?.models && typeof hub.models === "object" && !Array.isArray(hub.models)
      ? (((hub.models.providers) ?? []).map(normalizeProvider))
      : [];

  const models = Array.isArray(hub?.models) ? hub.models : [];
  const mcpServers = Array.isArray(hub?.mcpServers) ? hub.mcpServers : [];
  const media = compactHubMediaConfig(hub?.media ?? null);

  return {
    providers,
    models,
    mcpServers,
    media,
  };
}
