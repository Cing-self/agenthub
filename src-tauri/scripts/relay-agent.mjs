import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

const projectRoot =
  process.env.AGENTHUB_PROJECT_ROOT ||
  path.resolve(import.meta.dirname, "..", "..");
const statePath =
  process.env.AGENTHUB_RELAY_AGENT_STATE_PATH ||
  path.join(os.homedir(), ".agenthub", "runtime", "relay-agent.json");
const logPath = process.env.AGENTHUB_RELAY_AGENT_LOG_PATH || "";
const relayBaseUrl = process.env.AGENTHUB_RELAY_BASE_URL || "";
const hostId =
  process.env.AGENTHUB_RELAY_HOST_ID || `host_${process.pid}_${Date.now()}`;
const hostDisplayName =
  process.env.AGENTHUB_RELAY_HOST_DISPLAY_NAME || os.hostname();
const runtimeVersion = "0.1.0";

async function readHubConfig() {
  const hubPath = path.join(os.homedir(), ".agenthub", "hub.json");
  try {
    const raw = await fs.readFile(hubPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      collaboration: {
        threads: [],
      },
    };
  }
}

async function writeState(partial = {}) {
  const hub = await readHubConfig();
  const snapshot = buildSessionSnapshotPayload({ hostId, hub });
  const next = {
    running: true,
    pid: process.pid,
    status: "running",
    relayBaseUrl,
    hostId,
    hostDisplayName,
    sessionCount: snapshot.sessions.length,
    startedAt: partial.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncAt: new Date().toISOString(),
    connectedAt: partial.connectedAt || new Date().toISOString(),
    lastError: null,
    logPath: partial.logPath || logPath,
    ...partial,
  };

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function markStopped() {
  await writeState({
    running: false,
    pid: null,
    status: "stopped",
    connectedAt: null,
  });
}

export async function runRelayAgent() {
  const registration = buildHostRegistrationPayload({
    hostId,
    displayName: hostDisplayName,
    platform: process.platform,
    runtimeVersion,
    capabilities: ["turns", "streaming", "session-list"],
  });

  console.log("[relay-agent] starting", registration);
  await writeState({
    startedAt: new Date().toISOString(),
    connectedAt: new Date().toISOString(),
  });

  const timer = setInterval(() => {
    void writeState().catch((error) => {
      console.error("[relay-agent] failed to persist state", error);
    });
  }, 5000);

  const shutdown = async () => {
    clearInterval(timer);
    await markStopped().catch(() => {});
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  void runRelayAgent().catch(async (error) => {
    console.error("[relay-agent] fatal", error);
    await writeState({
      running: false,
      status: "error",
      lastError: String(error?.message || error),
      connectedAt: null,
    }).catch(() => {});
    process.exit(1);
  });
}
