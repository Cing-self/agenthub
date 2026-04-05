import { WebSocketServer } from "ws";

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

function parseAuthorizationToken(request) {
  const raw = String(request?.headers?.authorization || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return raw.slice(7).trim();
}

function writeUpgradeError(socket, statusCode, message) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
}

function frameTypeForInteraction(kind) {
  switch (kind) {
    case "user_final":
      return "transcript.final";
    case "assistant_final":
      return "assistant.final";
    default:
      return null;
  }
}

export function createVoiceBridgeRealtimeServer({
  token,
  voiceSessionManager,
  outputPollIntervalMs = 100,
  logDiagnostics = async () => {},
} = {}) {
  const requiredToken = requiredString(token, "token");
  if (!voiceSessionManager || typeof voiceSessionManager !== "object") {
    throw new TypeError("voiceSessionManager is required");
  }

  const wss = new WebSocketServer({ noServer: true });
  const clientsByCall = new Map();

  function addClient(callId, entry) {
    const existing = clientsByCall.get(callId) || new Set();
    existing.add(entry);
    clientsByCall.set(callId, existing);
  }

  function removeClient(entry) {
    const existing = clientsByCall.get(entry.callId);
    if (!existing) {
      return;
    }
    existing.delete(entry);
    if (existing.size === 0) {
      clientsByCall.delete(entry.callId);
    }
  }

  function emitDiagnostics(event, details = {}) {
    void logDiagnostics({
      event,
      transport: "direct-bridge-ws",
      ...details,
    });
  }

  function publishSessionState(entry, session) {
    if (!session) {
      return;
    }
    sendJson(entry.socket, {
      type: "session.state",
      session,
    });
  }

  function publishOutputChunks(entry, output) {
    if (!output || !Array.isArray(output.chunks) || output.chunks.length === 0) {
      return;
    }

    for (const chunk of output.chunks) {
      entry.afterSequence = Math.max(entry.afterSequence, Number(chunk.sequence) || -1);
      sendJson(entry.socket, {
        type: "audio.output",
        chunk,
      });
    }
  }

  function publishError(entry, error) {
    sendJson(entry.socket, {
      type: "error",
      error: String(error?.message || error || "unknown_error"),
    });
  }

  async function pumpOutput(entry) {
    try {
      const output = voiceSessionManager.getOutputAudio({
        callId: entry.callId,
        afterSequence: entry.afterSequence,
        limit: 8,
        diagnostics: entry.diagnostics,
      });
      publishOutputChunks(entry, output);
    } catch (error) {
      emitDiagnostics("bridge:ws:output-error", {
        callId: entry.callId,
        error: String(error?.message || error),
      });
      publishError(entry, error);
    }
  }

  function ensureOutputPolling(entry) {
    if (entry.pollTimer) {
      return;
    }
    entry.pollTimer = setInterval(() => {
      void pumpOutput(entry);
    }, Math.max(10, outputPollIntervalMs));
  }

  function closeEntry(entry) {
    if (entry.pollTimer) {
      clearInterval(entry.pollTimer);
      entry.pollTimer = null;
    }
    removeClient(entry);
  }

  async function handleSocketMessage(entry, data) {
    let parsed;
    try {
      parsed = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
    } catch {
      publishError(entry, "invalid_json");
      return;
    }

    switch (parsed?.type) {
      case "hello": {
        const session = voiceSessionManager.getSession(entry.callId, entry.diagnostics);
        publishSessionState(entry, session);
        return;
      }
      case "ping":
        sendJson(entry.socket, { type: "pong" });
        return;
      case "audio.input": {
        try {
          const session = await voiceSessionManager.appendAudioChunk({
            callId: entry.callId,
            audioBase64: parsed?.chunk?.audioBase64,
            mimeType: parsed?.chunk?.mimeType,
            sequence: parsed?.chunk?.sequence,
            sampleRateHz: parsed?.chunk?.sampleRateHz,
            channels: parsed?.chunk?.channels,
            durationMs: parsed?.chunk?.durationMs,
            diagnostics: entry.diagnostics,
          });
          publishSessionState(entry, session);
          ensureOutputPolling(entry);
          await pumpOutput(entry);
        } catch (error) {
          emitDiagnostics("bridge:ws:input-error", {
            callId: entry.callId,
            error: String(error?.message || error),
          });
          publishError(entry, error);
        }
        return;
      }
      default:
        publishError(entry, "unsupported_message_type");
    }
  }

  function handleUpgrade(request, socket, head) {
    const requestToken = parseAuthorizationToken(request);
    if (requestToken !== requiredToken) {
      writeUpgradeError(socket, 401, "Unauthorized");
      return;
    }

    const url = new URL(request.url || "/", "http://127.0.0.1");
    const match = url.pathname.match(/^\/calls\/([^/]+)\/realtime$/);
    if (!match) {
      writeUpgradeError(socket, 404, "Not Found");
      return;
    }

    const callId = decodeURIComponent(match[1]);
    const session = voiceSessionManager.getSession(callId);
    if (!session) {
      writeUpgradeError(socket, 404, "Not Found");
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      const diagnostics = {
        enabled:
          String(request.headers["x-agenthub-voice-diagnostics"] || "")
            .trim()
            .toLowerCase() === "1",
        source: "ios-app",
        transport: "direct-bridge-ws",
        callId,
      };
      const entry = {
        callId,
        socket: ws,
        afterSequence: -1,
        pollTimer: null,
        diagnostics,
      };

      addClient(callId, entry);
      emitDiagnostics("bridge:ws:connected", { callId });

      ws.on("message", (data) => {
        void handleSocketMessage(entry, data);
      });
      ws.on("close", () => {
        emitDiagnostics("bridge:ws:closed", { callId });
        closeEntry(entry);
      });
      ws.on("error", (error) => {
        emitDiagnostics("bridge:ws:error", {
          callId,
          error: String(error?.message || error),
        });
        closeEntry(entry);
      });
    });
  }

  function publishInteraction(interaction) {
    const callId = optionalString(interaction?.callId);
    if (!callId) {
      return;
    }
    const frameType = frameTypeForInteraction(optionalString(interaction?.kind));
    if (!frameType) {
      return;
    }

    for (const entry of clientsByCall.get(callId) || []) {
      sendJson(entry.socket, {
        type: frameType,
        interaction: {
          callId,
          kind: optionalString(interaction?.kind),
          text: optionalString(interaction?.text),
          providerId: optionalString(interaction?.providerId),
          modelId: optionalString(interaction?.modelId),
        },
      });
    }
  }

  function closeCall(callId) {
    const normalizedCallId = optionalString(callId);
    if (!normalizedCallId) {
      return;
    }

    for (const entry of clientsByCall.get(normalizedCallId) || []) {
      closeEntry(entry);
      try {
        entry.socket.close(1000, "call-ended");
      } catch {}
    }
  }

  function close() {
    for (const entries of clientsByCall.values()) {
      for (const entry of entries) {
        closeEntry(entry);
        try {
          entry.socket.close(1000, "server-shutdown");
        } catch {}
      }
    }
    clientsByCall.clear();
    wss.close();
  }

  return {
    handleUpgrade,
    publishInteraction,
    closeCall,
    close,
  };
}
