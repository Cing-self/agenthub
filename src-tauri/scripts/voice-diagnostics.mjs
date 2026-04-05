import fs from "node:fs/promises";

export const VOICE_DIAGNOSTICS_HEADER = "x-agenthub-voice-diagnostics";

function sanitizeValue(value) {
  if (value == null) {
    return null;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .map(([key, nested]) => [key, sanitizeValue(nested)]),
    );
  }
  return value;
}

function readHeader(headers, name) {
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) {
      return value;
    }
  }
  return null;
}

export function requestEnablesVoiceDiagnostics(headers) {
  const raw = String(readHeader(headers, VOICE_DIAGNOSTICS_HEADER) || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function normalizeVoiceDiagnosticsContext(diagnostics, { callId = null } = {}) {
  if (!diagnostics || diagnostics.enabled !== true) {
    return null;
  }

  return {
    enabled: true,
    source:
      typeof diagnostics.source === "string" && diagnostics.source.trim().length > 0
        ? diagnostics.source.trim()
        : null,
    transport:
      typeof diagnostics.transport === "string" && diagnostics.transport.trim().length > 0
        ? diagnostics.transport.trim()
        : null,
    callId:
      typeof diagnostics.callId === "string" && diagnostics.callId.trim().length > 0
        ? diagnostics.callId.trim()
        : callId,
  };
}

export function createVoiceDiagnosticsWriter({
  logPath = "",
  now = () => new Date().toISOString(),
  appendFile = fs.appendFile,
} = {}) {
  return async function writeVoiceDiagnostics(entry) {
    if (!logPath || !entry || typeof entry !== "object") {
      return;
    }

    const serialized = {
      timestamp: now(),
      ...sanitizeValue(entry),
    };
    await appendFile(logPath, `${JSON.stringify(serialized)}\n`, "utf8");
  };
}
