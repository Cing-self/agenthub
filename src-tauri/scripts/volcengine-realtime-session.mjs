import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";

const DIALOGUE_URL = "wss://openspeech.bytedance.com/api/v3/realtime/dialogue";

const PROTOCOL_VERSION = 0b0001;
const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR_RESPONSE = 0b1111;
const MSG_WITH_EVENT = 0b0100;
const NO_SERIALIZATION = 0b0000;
const JSON_SERIALIZATION = 0b0001;
const NO_COMPRESSION = 0b0000;
const GZIP_COMPRESSION = 0b0001;

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

function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (typeof value === "string") {
    return Buffer.from(value);
  }
  throw new TypeError("Unsupported websocket payload type");
}

function compressionBits(name) {
  return name === "none" ? NO_COMPRESSION : GZIP_COMPRESSION;
}

function serializationBits(name) {
  return name === "binary" ? NO_SERIALIZATION : JSON_SERIALIZATION;
}

function compressionName(bits) {
  return bits === NO_COMPRESSION ? "none" : "gzip";
}

function serializationName(bits) {
  return bits === NO_SERIALIZATION ? "binary" : "json";
}

function messageTypeBits(kind) {
  switch (kind) {
    case "client_full_request":
      return CLIENT_FULL_REQUEST;
    case "client_audio_only_request":
      return CLIENT_AUDIO_ONLY_REQUEST;
    case "server_full_response":
      return SERVER_FULL_RESPONSE;
    case "server_ack":
      return SERVER_ACK;
    case "server_error_response":
      return SERVER_ERROR_RESPONSE;
    default:
      throw new TypeError(`Unsupported frame kind: ${kind}`);
  }
}

function kindForMessageType(bits) {
  switch (bits) {
    case CLIENT_FULL_REQUEST:
      return "client_full_request";
    case CLIENT_AUDIO_ONLY_REQUEST:
      return "client_audio_only_request";
    case SERVER_FULL_RESPONSE:
      return "server_full_response";
    case SERVER_ACK:
      return "server_ack";
    case SERVER_ERROR_RESPONSE:
      return "server_error_response";
    default:
      return "unknown";
  }
}

function generateHeader({
  messageType,
  serialization = "json",
  compression = "gzip",
  flags = MSG_WITH_EVENT,
  reservedData = 0x00,
} = {}) {
  const header = Buffer.alloc(4);
  header[0] = (PROTOCOL_VERSION << 4) | 0b0001;
  header[1] = (messageType << 4) | flags;
  header[2] = (serializationBits(serialization) << 4) | compressionBits(compression);
  header[3] = reservedData;
  return header;
}

function encodePayload({ payload, serialization = "json", compression = "gzip" }) {
  const raw =
    serialization === "binary"
      ? toBuffer(payload ?? Buffer.alloc(0))
      : Buffer.from(JSON.stringify(payload ?? {}), "utf8");
  return compression === "none" ? raw : gzipSync(raw);
}

function parsePayload({ payload, serialization, compression }) {
  const raw = compression === "none" ? payload : gunzipSync(payload);
  if (serialization === "binary") {
    return raw;
  }
  return JSON.parse(raw.toString("utf8"));
}

function encodeFrame({
  kind,
  event,
  sessionId = null,
  payload,
  serialization = "json",
  compression = "gzip",
}) {
  const header = generateHeader({
    messageType: messageTypeBits(kind),
    serialization,
    compression,
  });
  const payloadBuffer = encodePayload({ payload, serialization, compression });
  const parts = [header, Buffer.alloc(4)];
  parts[1].writeUInt32BE(Number(event) || 0, 0);

  const normalizedSessionId = optionalString(sessionId);
  if (normalizedSessionId) {
    const sessionIdBuffer = Buffer.from(normalizedSessionId, "utf8");
    const sessionLength = Buffer.alloc(4);
    sessionLength.writeUInt32BE(sessionIdBuffer.length, 0);
    parts.push(sessionLength, sessionIdBuffer);
  }

  const payloadLength = Buffer.alloc(4);
  payloadLength.writeUInt32BE(payloadBuffer.length, 0);
  parts.push(payloadLength, payloadBuffer);
  return Buffer.concat(parts);
}

function parseFrameWithSession(buffer, { hasSessionId }) {
  const frame = toBuffer(buffer);
  const headerSize = (frame[0] & 0x0f) * 4;
  const messageType = frame[1] >> 4;
  const flags = frame[1] & 0x0f;
  const serialization = serializationName(frame[2] >> 4);
  const compression = compressionName(frame[2] & 0x0f);
  let offset = headerSize;
  let event = null;

  if (flags & MSG_WITH_EVENT) {
    event = frame.readUInt32BE(offset);
    offset += 4;
  }

  let sessionId = null;
  if (hasSessionId) {
    const sessionIdSize = frame.readUInt32BE(offset);
    offset += 4;
    sessionId = frame.slice(offset, offset + sessionIdSize).toString("utf8");
    offset += sessionIdSize;
  }

  const payloadSize = frame.readUInt32BE(offset);
  offset += 4;
  const payloadBuffer = frame.slice(offset, offset + payloadSize);

  return {
    kind: kindForMessageType(messageType),
    event,
    sessionId,
    serialization,
    compression,
    payload: parsePayload({
      payload: payloadBuffer,
      serialization,
      compression,
    }),
  };
}

export function parseVolcengineFrame(buffer) {
  const frame = toBuffer(buffer);
  const messageType = frame[1] >> 4;
  const headerSize = (frame[0] & 0x0f) * 4;
  const flags = frame[1] & 0x0f;

  if (messageType === SERVER_ERROR_RESPONSE) {
    let offset = headerSize;
    const errorCode = frame.readUInt32BE(offset);
    offset += 4;
    const payloadSize = frame.readUInt32BE(offset);
    offset += 4;
    const payloadBuffer = frame.slice(offset, offset + payloadSize);
    const serialization = serializationName(frame[2] >> 4);
    const compression = compressionName(frame[2] & 0x0f);

    return {
      kind: kindForMessageType(messageType),
      event: flags & MSG_WITH_EVENT ? errorCode : null,
      errorCode,
      sessionId: null,
      serialization,
      compression,
      payload: parsePayload({
        payload: payloadBuffer,
        serialization,
        compression,
      }),
    };
  }

  const event = frame.readUInt32BE(headerSize);
  const hasSessionId =
    messageType === CLIENT_AUDIO_ONLY_REQUEST ||
    messageType === SERVER_FULL_RESPONSE ||
    messageType === SERVER_ACK ||
    ![1, 2].includes(event);
  return parseFrameWithSession(frame, { hasSessionId });
}

export function buildVolcengineControlRequest({ event, sessionId = null, payload = {} }) {
  return encodeFrame({
    kind: "client_full_request",
    event,
    sessionId,
    payload,
  });
}

export function buildVolcengineAudioRequest({ event = 200, sessionId, payload }) {
  return encodeFrame({
    kind: "client_audio_only_request",
    event,
    sessionId,
    payload,
    serialization: "binary",
    compression: "gzip",
  });
}

export function buildVolcengineServerResponse({
  kind,
  event,
  sessionId,
  payload,
  payloadFormat = "json",
  compression = "gzip",
}) {
  return encodeFrame({
    kind,
    event,
    sessionId,
    payload,
    serialization: payloadFormat,
    compression,
  });
}

function createInitialSummary(callId) {
  return {
    status: "connecting",
    lastEvent: null,
    inputAudioChunks: 0,
    inputAudioBytes: 0,
    outputAudioBytes: 0,
    userTranscript: null,
    assistantText: null,
    eventsReceived: 0,
    lastError: null,
    sessionId: callId,
  };
}

function looksLikeFloat32PcmBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.length % 4 !== 0) {
    return false;
  }

  const sampleCount = Math.min(buffer.length / 4, 128);
  let finiteCount = 0;
  let inRangeCount = 0;
  let energeticCount = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const value = buffer.readFloatLE(index * 4);
    if (!Number.isFinite(value)) {
      continue;
    }
    finiteCount += 1;
    if (value >= -1.25 && value <= 1.25) {
      inRangeCount += 1;
    }
    if (Math.abs(value) >= 0.0005) {
      energeticCount += 1;
    }
  }

  if (finiteCount === 0) {
    return false;
  }

  return (
    inRangeCount / finiteCount >= 0.95 &&
    energeticCount / finiteCount >= 0.25
  );
}

function normalizeOutputAudioBuffer(buffer) {
  if (!looksLikeFloat32PcmBuffer(buffer)) {
    return buffer;
  }

  const sampleCount = buffer.length / 4;
  const pcm16 = Buffer.alloc(sampleCount * 2);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = buffer.readFloatLE(index * 4);
    const clamped = Math.max(-1, Math.min(1, value));
    const scaled = clamped >= 0
      ? Math.round(clamped * 0x7fff)
      : Math.round(clamped * 0x8000);
    pcm16.writeInt16LE(scaled, index * 2);
  }

  return pcm16;
}

function cloneSummary(summary) {
  return {
    ...summary,
  };
}

function walkPayloadText(payload, keys) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = walkPayloadText(item, keys);
      if (value) {
        return value;
      }
    }
    return null;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && keys.includes(key) && value.trim().length > 0) {
      return value.trim();
    }
    if (value && typeof value === "object") {
      const nested = walkPayloadText(value, keys);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function extractEventTexts(payload) {
  return {
    userTranscript: walkPayloadText(payload, [
      "asr_text",
      "user_text",
      "question",
      "transcript",
      "input_text",
    ]),
    assistantText: walkPayloadText(payload, [
      "llm_text",
      "bot_text",
      "answer",
      "reply_text",
      "output_text",
    ]),
  };
}

function defaultSocketFactory(url, protocols, options) {
  return new WebSocket(url, protocols, options);
}

function addSocketListener(socket, type, listener) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(type, listener);
    return () => socket.removeEventListener?.(type, listener);
  }

  socket.on?.(type, listener);
  return () => socket.off?.(type, listener);
}

function waitForSocketOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = [];
    const done = (callback) => (event) => {
      for (const dispose of cleanup) dispose();
      callback(event);
    };

    cleanup.push(addSocketListener(socket, "open", done(() => resolve())));
    cleanup.push(addSocketListener(socket, "error", done((event) => reject(event?.error || new Error("websocket_open_failed")))));
    cleanup.push(addSocketListener(socket, "close", done((event) => reject(new Error(event?.reason || "websocket_closed_before_open")))));
  });
}

function buildStartSessionPayload(session) {
  return {
    asr: {
      extra: {
        end_smooth_window_ms: 1500,
      },
    },
    tts: {
      audio_config: {
        channel: 1,
        format: "pcm",
        sample_rate: 24000,
      },
    },
    dialog: {
      bot_name: "AgentHub",
      extra: {
        input_mod: "audio",
        model: optionalString(session?.modelId) || "O",
        recv_timeout: 30,
      },
    },
  };
}

function createBlockedSession(callId, session) {
  const summary = createInitialSummary(callId);
  summary.status = "blocked";
  summary.lastError = Array.isArray(session?.missing) && session.missing.length > 0
    ? `missing:${session.missing.join(",")}`
    : "missing:config";

  return {
    getSummary() {
      return cloneSummary(summary);
    },
    async appendAudioChunk() {
      throw new Error("voice_session_not_ready");
    },
    async close() {
      summary.status = "closed";
    },
  };
}

export async function createVolcengineRealtimeSession({
  call,
  session,
  webSocketFactory = defaultSocketFactory,
  connectIdFactory = () => randomUUID(),
} = {}) {
  const callId = requiredString(call?.callId, "call.callId");
  if (!session?.ready) {
    return createBlockedSession(callId, session);
  }

  const appId = requiredString(session?.appId, "session.appId");
  const appKey = requiredString(session?.appKey, "session.appKey");
  const token = requiredString(session?.token, "session.token");
  const resourceId = requiredString(session?.resourceId, "session.resourceId");
  const summary = createInitialSummary(callId);
  const outputAudioChunks = [];
  let nextOutputSequence = 0;
  let diagnostics = null;
  let interactionSink = null;
  let lastUserInteractionText = null;
  let lastAssistantInteractionText = null;
  const socket = webSocketFactory(DIALOGUE_URL, undefined, {
    headers: {
      "X-Api-App-ID": appId,
      "X-Api-App-Key": appKey,
      "X-Api-Access-Key": token,
      "X-Api-Resource-Id": resourceId,
      "X-Api-Connect-Id": connectIdFactory(),
    },
  });

  function emitDiagnostics(event, details = {}) {
    if (!diagnostics?.enabled || typeof diagnostics.logger !== "function") {
      return;
    }

    void diagnostics.logger({
      event,
      callId,
      source: diagnostics.source,
      transport: diagnostics.transport,
      providerId: "volcengine",
      ...details,
    });
  }

  function emitInteraction(kind, text, sourceEvent) {
    const normalizedText = optionalString(text);
    if (!interactionSink || !normalizedText) {
      return;
    }

    if (kind === "user_final" && lastUserInteractionText === normalizedText) {
      return;
    }
    if (kind === "assistant_final" && lastAssistantInteractionText === normalizedText) {
      return;
    }

    if (kind === "user_final") {
      lastUserInteractionText = normalizedText;
    } else if (kind === "assistant_final") {
      lastAssistantInteractionText = normalizedText;
    }

    void interactionSink({
      kind,
      text: normalizedText,
      sourceEvent: Number.isFinite(sourceEvent) ? sourceEvent : null,
    });
  }

  addSocketListener(socket, "message", (event) => {
    try {
      const frame = parseVolcengineFrame(event?.data ?? event);
      summary.eventsReceived += 1;
      if (frame.event != null) {
        summary.lastEvent = frame.event;
      }

      if (frame.kind === "server_ack" && Buffer.isBuffer(frame.payload)) {
        const normalizedAudio = normalizeOutputAudioBuffer(frame.payload);
        summary.outputAudioBytes += normalizedAudio.length;
        summary.status = "streaming";
        outputAudioChunks.push({
          sequence: nextOutputSequence++,
          audioBase64: normalizedAudio.toString("base64"),
          mimeType: "audio/pcm",
          sampleRateHz: 24000,
          channels: 1,
          durationMs: null,
        });
        if (outputAudioChunks.length > 256) {
          outputAudioChunks.splice(0, outputAudioChunks.length - 256);
        }
        if (nextOutputSequence === 1 || nextOutputSequence % 25 === 0) {
          emitDiagnostics("provider:output-audio", {
            outputChunks: nextOutputSequence,
            outputAudioBytes: summary.outputAudioBytes,
          });
        }
        return;
      }

      if (frame.kind === "server_error_response") {
        summary.status = "error";
        summary.lastError =
          typeof frame.payload === "string"
            ? frame.payload
            : JSON.stringify(frame.payload);
        emitDiagnostics("provider:error", {
          lastError: summary.lastError,
          eventCode: frame.event,
        });
        return;
      }

      if (frame.kind === "server_full_response") {
        const { userTranscript, assistantText } = extractEventTexts(frame.payload);
        if (userTranscript) {
          summary.userTranscript = userTranscript;
          emitInteraction("user_final", userTranscript, frame.event);
          emitDiagnostics("provider:user-transcript", {
            transcriptPreview: userTranscript.slice(0, 120),
          });
        }
        if (assistantText) {
          summary.assistantText = assistantText;
          emitInteraction("assistant_final", assistantText, frame.event);
          emitDiagnostics("provider:assistant-text", {
            assistantPreview: assistantText.slice(0, 120),
          });
        }
        if (frame.event === 152 || frame.event === 153) {
          summary.status = "finished";
        } else {
          summary.status = "streaming";
        }
      }
    } catch (error) {
      summary.status = "error";
      summary.lastError = error instanceof Error ? error.message : String(error);
    }
  });

  addSocketListener(socket, "error", (event) => {
    summary.status = "error";
    summary.lastError = event?.message || event?.error?.message || "websocket_error";
    emitDiagnostics("provider:websocket-error", {
      lastError: summary.lastError,
    });
  });

  addSocketListener(socket, "close", (event) => {
    if (summary.status !== "finished" && summary.status !== "closed") {
      summary.status = "closed";
    }
    if (event?.reason) {
      summary.lastError ||= event.reason;
    }
    emitDiagnostics("provider:websocket-close", {
      status: summary.status,
      lastError: summary.lastError,
    });
  });

  await waitForSocketOpen(socket);
  emitDiagnostics("provider:websocket-open", {
    modelId: optionalString(session?.modelId) || "O",
  });
  socket.send(buildVolcengineControlRequest({ event: 1, payload: {} }));
  socket.send(
    buildVolcengineControlRequest({
      event: 100,
      sessionId: callId,
      payload: buildStartSessionPayload(session),
    }),
  );

  return {
    configureInteractionSink(sink) {
      interactionSink = typeof sink === "function" ? sink : null;
    },
    configureDiagnostics(context = {}) {
      diagnostics = context?.enabled
        ? {
            enabled: true,
            source: optionalString(context.source) || "ios-app",
            transport: optionalString(context.transport) || "direct-bridge",
            logger: context.logger,
          }
        : null;
      emitDiagnostics("provider:diagnostics-enabled", {
        status: summary.status,
        eventsReceived: summary.eventsReceived,
        inputAudioChunks: summary.inputAudioChunks,
        outputAudioBytes: summary.outputAudioBytes,
      });
    },
    getSummary() {
      return cloneSummary(summary);
    },
    consumeOutputAudio({ afterSequence = -1, limit = 12 } = {}) {
      const normalizedAfterSequence = Number.isFinite(afterSequence) ? afterSequence : -1;
      const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 64) : 12;
      return outputAudioChunks
        .filter((chunk) => chunk.sequence > normalizedAfterSequence)
        .slice(0, normalizedLimit)
        .map((chunk) => ({ ...chunk }));
    },
    async appendAudioChunk({ buffer }) {
      const audioBuffer = toBuffer(buffer);
      socket.send(
        buildVolcengineAudioRequest({
          sessionId: callId,
          payload: audioBuffer,
        }),
      );
      summary.inputAudioChunks += 1;
      summary.inputAudioBytes += audioBuffer.length;
      summary.status = "streaming";
      if (summary.inputAudioChunks === 1 || summary.inputAudioChunks % 25 === 0) {
        emitDiagnostics("provider:append-input", {
          inputAudioChunks: summary.inputAudioChunks,
          inputAudioBytes: summary.inputAudioBytes,
        });
      }
    },
    async close({ reason = "ended" } = {}) {
      summary.status = "closed";
      emitDiagnostics("provider:close", { reason });
      try {
        socket.send(
          buildVolcengineControlRequest({
            event: 102,
            sessionId: callId,
            payload: {},
          }),
        );
      } catch {}
      try {
        socket.send(buildVolcengineControlRequest({ event: 2, payload: { reason } }));
      } catch {}
      socket.close(1000, reason);
    },
  };
}
