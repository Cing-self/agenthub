import {
  buildRelayApiUrl,
  extractRelayMediaDefaults,
  fetchRelayJson,
} from "./relay-agent.mjs";

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return null;
  }

  const baseUrl = optionalString(endpoint.baseUrl);
  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl,
    apiType: optionalString(endpoint.apiType) || "openai",
  };
}

function resolveEffectiveVoiceTarget({ call, hostMediaDefaults }) {
  const callVoice = call?.mediaConfig?.voice;
  const defaultVoice = hostMediaDefaults?.voice;
  const providerId = optionalString(callVoice?.providerId) || optionalString(defaultVoice?.providerId);
  const modelId = optionalString(callVoice?.modelId) || optionalString(defaultVoice?.modelId);

  if (!providerId && !modelId) {
    return null;
  }

  return {
    providerId,
    modelId,
  };
}

export function resolveGatewayVoiceSessionConfig({ hub, hostMediaDefaults = null, call }) {
  if (call?.mode !== "audio") {
    return null;
  }

  const target = resolveEffectiveVoiceTarget({ call, hostMediaDefaults });
  if (!target?.providerId) {
    return null;
  }

  const providers = Array.isArray(hub?.providers) ? hub.providers : [];
  const provider = providers.find(
    (item) => optionalString(item?.id) === target.providerId,
  ) || null;
  const endpoint = normalizeEndpoint(provider?.endpoints?.[0]);
  const audio = provider?.audio && typeof provider.audio === "object" ? provider.audio : {};
  const modelId = target.modelId || optionalString(audio.realtimeVoiceModel);
  const appId = optionalString(audio.realtimeAppId);
  const appKey = optionalString(audio.realtimeAppKey);
  const token = optionalString(audio.realtimeToken);
  const resourceId = optionalString(audio.realtimeResourceId);
  const apiKey = optionalString(provider?.apiKey);
  const missing = [];

  if (!endpoint) {
    missing.push("endpoint");
  }
  if (!apiKey) {
    missing.push("apiKey");
  }
  if (!modelId) {
    missing.push("modelId");
  }

  if (target.providerId === "volcengine") {
    if (!appId) {
      missing.push("realtimeAppId");
    }
    if (!appKey) {
      missing.push("realtimeAppKey");
    }
    if (!token) {
      missing.push("realtimeToken");
    }
    if (!resourceId) {
      missing.push("realtimeResourceId");
    }
  }

  return {
    providerId: target.providerId,
    modelId,
    apiKey,
    appKey,
    endpoint,
    appId,
    token,
    resourceId,
    ready: missing.length === 0,
    missing,
  };
}

export function summarizeGatewayVoiceSessionConfig(session) {
  if (!session) {
    return null;
  }

  return {
    providerId: session.providerId,
    modelId: session.modelId ?? null,
    endpoint: session.endpoint ?? null,
    ready: Boolean(session.ready),
    missing: Array.isArray(session.missing) ? [...session.missing] : [],
    hasAppId: Boolean(session.appId),
    hasAppKey: Boolean(session.appKey),
    hasToken: Boolean(session.token),
    hasResourceId: Boolean(session.resourceId),
  };
}

export function buildActiveRelayCallRequest({ relayBaseUrl, hostId }) {
  return {
    url: buildRelayApiUrl(
      relayBaseUrl,
      `/hosts/${encodeURIComponent(requiredString(hostId, "hostId"))}/calls/active`,
    ),
    options: {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    },
  };
}

export function buildRelayCallEventRequest({
  relayBaseUrl,
  hostId,
  callId,
  state,
  updatedAt,
}) {
  return {
    url: buildRelayApiUrl(
      relayBaseUrl,
      `/hosts/${encodeURIComponent(requiredString(hostId, "hostId"))}/calls/${encodeURIComponent(requiredString(callId, "callId"))}/events`,
    ),
    options: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        state: requiredString(state, "state"),
        updatedAt: requiredString(updatedAt, "updatedAt"),
      }),
    },
  };
}

async function postRelayCallState({
  relayBaseUrl,
  hostId,
  callId,
  state,
  updatedAt,
  fetchImpl,
}) {
  const request = buildRelayCallEventRequest({
    relayBaseUrl,
    hostId,
    callId,
    state,
    updatedAt,
  });

  const payload = await fetchRelayJson(fetchImpl, request.url, request.options);
  return payload?.call || null;
}

export function createGatewayCallController({
  relayBaseUrl,
  hostId,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
  onAcceptCall = async () => {},
  loadHub = async () => null,
  onStartVoiceSession = async () => {},
}) {
  let acceptedCallId = null;
  let activeCall = null;
  let startedVoiceSessionCallId = null;

  async function ensureVoiceSession(nextCall) {
    if (
      nextCall?.mode !== "audio" ||
      nextCall?.callId === startedVoiceSessionCallId ||
      nextCall?.state === "ended" ||
      nextCall?.state === "failed"
    ) {
      return;
    }

    const hub = await loadHub();
    const session = resolveGatewayVoiceSessionConfig({
      hub,
      hostMediaDefaults: extractRelayMediaDefaults(hub),
      call: nextCall,
    });
    await onStartVoiceSession({
      call: nextCall,
      session,
    });
    startedVoiceSessionCallId = nextCall.callId;
  }

  async function tick() {
    const request = buildActiveRelayCallRequest({ relayBaseUrl, hostId });
    const payload = await fetchRelayJson(fetchImpl, request.url, request.options);
    const nextCall = payload?.call || null;

    if (!nextCall) {
      activeCall = null;
      acceptedCallId = null;
      startedVoiceSessionCallId = null;
      return null;
    }

    if (nextCall.state === "dialing" && acceptedCallId !== nextCall.callId) {
      await onAcceptCall(nextCall);
      await ensureVoiceSession(nextCall);
      await postRelayCallState({
        relayBaseUrl,
        hostId,
        callId: nextCall.callId,
        state: "connecting",
        updatedAt: now(),
        fetchImpl,
      });
      activeCall = await postRelayCallState({
        relayBaseUrl,
        hostId,
        callId: nextCall.callId,
        state: "live",
        updatedAt: now(),
        fetchImpl,
      });
      acceptedCallId = nextCall.callId;
      return activeCall;
    }

    activeCall = nextCall;
    await ensureVoiceSession(nextCall);
    if (nextCall.state === "ended" || nextCall.state === "failed") {
      acceptedCallId = null;
      if (startedVoiceSessionCallId === nextCall.callId) {
        startedVoiceSessionCallId = null;
      }
    }
    return activeCall;
  }

  return {
    tick,
    getActiveCall() {
      return activeCall;
    },
  };
}
