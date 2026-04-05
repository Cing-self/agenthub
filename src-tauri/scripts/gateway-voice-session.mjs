import { createVolcengineRealtimeSession } from "./volcengine-realtime-session.mjs";
import { normalizeVoiceDiagnosticsContext } from "./voice-diagnostics.mjs";

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

function cloneSummary(summary) {
  return {
    ...summary,
    endpoint: summary.endpoint ? { ...summary.endpoint } : null,
    missing: Array.isArray(summary.missing) ? [...summary.missing] : [],
    providerState:
      summary.providerState && typeof summary.providerState === "object"
        ? { ...summary.providerState }
        : null,
  };
}

function createInitialSummary({ callId, session, now }) {
  return {
    callId,
    status: session?.ready ? "ready" : "blocked",
    providerId: session?.providerId ?? null,
    modelId: session?.modelId ?? null,
    endpoint: session?.endpoint ? { ...session.endpoint } : null,
    ready: Boolean(session?.ready),
    missing: Array.isArray(session?.missing) ? [...session.missing] : [],
    hasAppId: Boolean(session?.appId),
    hasAppKey: Boolean(session?.appKey),
    hasToken: Boolean(session?.token),
    hasResourceId: Boolean(session?.resourceId),
    startedAt: now(),
    lastChunkAt: null,
    endedAt: null,
    receivedChunks: 0,
    receivedBytes: 0,
    sampleRateHz: null,
    channels: null,
    providerState: null,
  };
}

function cloneProviderState(providerSession) {
  if (!providerSession?.getSummary) {
    return null;
  }
  const summary = providerSession.getSummary();
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }
  return { ...summary };
}

function normalizeOutputAudioChunk(chunk) {
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) {
    return null;
  }

  const sequence = Number.isFinite(chunk.sequence) ? chunk.sequence : null;
  if (sequence == null) {
    return null;
  }

  const audioBase64 =
    typeof chunk.audioBase64 === "string" && chunk.audioBase64.length > 0
      ? chunk.audioBase64
      : Buffer.isBuffer(chunk.buffer)
        ? chunk.buffer.toString("base64")
        : null;

  if (!audioBase64) {
    return null;
  }

  return {
    sequence,
    audioBase64,
    mimeType: optionalString(chunk.mimeType) || "audio/pcm",
    sampleRateHz: Number.isFinite(chunk.sampleRateHz) ? chunk.sampleRateHz : null,
    channels: Number.isFinite(chunk.channels) ? chunk.channels : null,
    durationMs: Number.isFinite(chunk.durationMs) ? chunk.durationMs : null,
  };
}

function collectOutputAudio(providerSession, { afterSequence, limit }) {
  if (!providerSession?.consumeOutputAudio) {
    return [];
  }

  const chunks = providerSession.consumeOutputAudio({ afterSequence, limit });
  if (!Array.isArray(chunks)) {
    return [];
  }

  return chunks
    .map(normalizeOutputAudioChunk)
    .filter(Boolean);
}

async function createDefaultGatewayProviderSession({ call, session }) {
  if (!session || typeof session !== "object") {
    return null;
  }

  if (session.providerId === "volcengine") {
    return createVolcengineRealtimeSession({ call, session });
  }

  return null;
}

export function createGatewayVoiceSessionManager({
  now = () => new Date().toISOString(),
  createProviderSession = createDefaultGatewayProviderSession,
  logDiagnostics = async () => {},
  onInteraction = async () => {},
} = {}) {
  const sessions = new Map();

  async function handleInteraction({ call, session, interaction }) {
    if (!interaction || typeof interaction !== "object") {
      return;
    }

    const kind = optionalString(interaction.kind);
    const text = optionalString(interaction.text);
    if (!kind || !text) {
      return;
    }

    await onInteraction({
      callId: requiredString(call?.callId, "call.callId"),
      threadId: optionalString(call?.sessionId),
      kind,
      text,
      providerId: optionalString(session?.providerId),
      modelId: optionalString(session?.modelId),
      sourceEvent: Number.isFinite(interaction.sourceEvent) ? interaction.sourceEvent : null,
      occurredAt: now(),
    });
  }

  function emitDiagnostics(entry, event, details = {}) {
    const diagnostics = normalizeVoiceDiagnosticsContext(details.diagnostics, {
      callId: details.callId,
    });
    if (!diagnostics) {
      return null;
    }

    const nextEntry = {
      event,
      callId: diagnostics.callId,
      source: diagnostics.source,
      transport: diagnostics.transport,
      ...details.extra,
    };
    void logDiagnostics(nextEntry);

    if (
      !entry.diagnostics ||
      entry.diagnostics.source !== diagnostics.source ||
      entry.diagnostics.transport !== diagnostics.transport
    ) {
      entry.providerSession?.configureDiagnostics?.({
        enabled: true,
        source: diagnostics.source,
        transport: diagnostics.transport,
        callId: diagnostics.callId,
        logger: logDiagnostics,
      });
      entry.diagnostics = diagnostics;
    }

    return diagnostics;
  }

  async function startSession({ call, session }) {
    const callId = requiredString(call?.callId, "call.callId");
    const existing = sessions.get(callId);
    if (existing?.providerSession?.close) {
      await existing.providerSession.close();
    }

    const providerSession = await createProviderSession({ call, session });
    providerSession?.configureInteractionSink?.((interaction) =>
      handleInteraction({ call, session, interaction })
    );
    const summary = createInitialSummary({ callId, session, now });
    summary.providerState = cloneProviderState(providerSession);
    sessions.set(callId, {
      providerSession,
      summary,
      diagnostics: null,
    });
    return cloneSummary(summary);
  }

  async function appendAudioChunk({
    callId,
    audioBase64,
    mimeType,
    sequence,
    sampleRateHz,
    channels,
    durationMs,
    diagnostics = null,
  }) {
    const normalizedCallId = requiredString(callId, "callId");
    const entry = sessions.get(normalizedCallId);
    if (!entry) {
      throw new Error("voice_session_not_found");
    }
    if (!entry.summary.ready) {
      throw new Error("voice_session_not_ready");
    }

    const payload = optionalString(audioBase64);
    if (!payload) {
      throw new Error("audio_chunk_required");
    }

    const buffer = Buffer.from(payload, "base64");
    if (buffer.length === 0) {
      throw new Error("audio_chunk_invalid");
    }

    emitDiagnostics(entry, "voice-session:append-chunk", {
      diagnostics,
      callId: normalizedCallId,
      extra: {
        sequence: Number.isFinite(sequence) ? sequence : null,
        bytes: buffer.length,
        sampleRateHz: Number.isFinite(sampleRateHz) ? sampleRateHz : null,
        channels: Number.isFinite(channels) ? channels : null,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
      },
    });

    await entry.providerSession?.appendAudioChunk?.({
      buffer,
      mimeType: optionalString(mimeType) || "audio/pcm",
      sequence: Number.isFinite(sequence) ? sequence : null,
      sampleRateHz: Number.isFinite(sampleRateHz) ? sampleRateHz : null,
      channels: Number.isFinite(channels) ? channels : null,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
    });

    entry.summary.status = "streaming";
    entry.summary.receivedChunks += 1;
    entry.summary.receivedBytes += buffer.length;
    entry.summary.lastChunkAt = now();
    entry.summary.sampleRateHz = Number.isFinite(sampleRateHz) ? sampleRateHz : null;
    entry.summary.channels = Number.isFinite(channels) ? channels : null;
    entry.summary.providerState = cloneProviderState(entry.providerSession);

    return cloneSummary(entry.summary);
  }

  function getSession(callId, diagnostics = null) {
    const normalizedCallId = requiredString(callId, "callId");
    const entry = sessions.get(normalizedCallId);
    if (entry) {
      emitDiagnostics(entry, "voice-session:get", {
        diagnostics,
        callId: normalizedCallId,
        extra: {
          status: entry.summary.status,
          ready: entry.summary.ready,
        },
      });
    }
    if (entry) {
      entry.summary.providerState = cloneProviderState(entry.providerSession);
    }
    return entry ? cloneSummary(entry.summary) : null;
  }

  function getOutputAudio({ callId, afterSequence = -1, limit = 12, diagnostics = null }) {
    const normalizedCallId = requiredString(callId, "callId");
    const entry = sessions.get(normalizedCallId);
    if (!entry) {
      throw new Error("voice_session_not_found");
    }

    entry.summary.providerState = cloneProviderState(entry.providerSession);
    const chunks = collectOutputAudio(entry.providerSession, { afterSequence, limit });
    emitDiagnostics(entry, "voice-session:get-output", {
      diagnostics,
      callId: normalizedCallId,
      extra: {
        afterSequence,
        limit,
        chunkCount: chunks.length,
      },
    });
    return {
      chunks,
      session: cloneSummary(entry.summary),
    };
  }

  async function endSession(callId, reason = "ended") {
    const normalizedCallId = requiredString(callId, "callId");
    const entry = sessions.get(normalizedCallId);
    if (!entry) {
      return null;
    }

    await entry.providerSession?.close?.({ reason });
    entry.summary.status = reason;
    entry.summary.endedAt = now();
    entry.summary.providerState = cloneProviderState(entry.providerSession);
    return cloneSummary(entry.summary);
  }

  return {
    startSession,
    appendAudioChunk,
    getSession,
    getOutputAudio,
    endSession,
  };
}
