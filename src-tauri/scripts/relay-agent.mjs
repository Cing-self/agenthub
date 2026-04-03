function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildHostRegistrationPayload(input) {
  return {
    hostId: requiredString(input.hostId, "hostId"),
    displayName: requiredString(input.displayName, "displayName"),
    platform: requiredString(input.platform, "platform"),
    runtimeVersion: requiredString(input.runtimeVersion, "runtimeVersion"),
    status: "online",
    connectedAt:
      typeof input.connectedAt === "string" && input.connectedAt.trim().length > 0
        ? input.connectedAt
        : new Date().toISOString(),
    capabilities: normalizeCapabilities(input.capabilities),
  };
}

export function buildSessionSnapshotPayload({ hostId, hub }) {
  const normalizedHostId = requiredString(hostId, "hostId");
  const collaboration = hub?.collaboration || {};
  const threads = Array.isArray(collaboration.threads)
    ? [...collaboration.threads]
    : [];

  threads.sort((left, right) =>
    String(right.updated_at || "").localeCompare(String(left.updated_at || "")),
  );

  return {
    hostId: normalizedHostId,
    sessions: threads.map((thread) => ({
      sessionId: requiredString(thread.id, "thread.id"),
      hostId: normalizedHostId,
      title: String(thread.title || "").trim() || "Untitled session",
      summary: String(thread.goal || "").trim(),
      updatedAt:
        typeof thread.updated_at === "string" && thread.updated_at.trim().length > 0
          ? thread.updated_at
          : new Date().toISOString(),
      primaryAgentId:
        typeof thread.primary_agent_id === "string" && thread.primary_agent_id.trim().length > 0
          ? thread.primary_agent_id.trim()
          : null,
      state:
        typeof thread.status === "string" && thread.status.trim().length > 0
          ? thread.status.trim()
          : "active",
    })),
  };
}
