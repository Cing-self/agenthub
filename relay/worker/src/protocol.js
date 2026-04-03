function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Missing required ${fieldName}`);
  }
  return value.trim();
}

function optionalString(value) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new TypeError("Expected string");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ensurePayload(value) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid payload");
  }
  return value;
}

export function createEnvelope(input) {
  return parseEnvelope(input);
}

export function parseEnvelope(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Envelope must be an object");
  }

  return {
    messageId: requiredString(input.messageId, "messageId"),
    hostId: requiredString(input.hostId, "hostId"),
    sessionId: optionalString(input.sessionId),
    type: requiredString(input.type, "type"),
    seq:
      typeof input.seq === "number" && Number.isFinite(input.seq) && input.seq >= 0
        ? input.seq
        : 0,
    sentAt:
      typeof input.sentAt === "string" && input.sentAt.trim().length > 0
        ? input.sentAt
        : new Date().toISOString(),
    payload: ensurePayload(input.payload),
  };
}
