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

export function buildRelayApiUrl(relayBaseUrl, pathName) {
  const normalizedBaseUrl = requiredString(relayBaseUrl, "relayBaseUrl")
    .replace(/\/+$/, "");
  const apiBase = normalizedBaseUrl.endsWith("/api")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/api`;
  const normalizedPath = String(pathName || "").startsWith("/")
    ? String(pathName || "")
    : `/${String(pathName || "")}`;

  return `${apiBase}${normalizedPath}`;
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

export function buildHostSyncRequest({ relayBaseUrl, host, snapshot }) {
  const registration = buildHostRegistrationPayload(host);
  const normalizedSnapshot = {
    hostId: requiredString(snapshot?.hostId, "snapshot.hostId"),
    sessions: Array.isArray(snapshot?.sessions) ? snapshot.sessions : [],
  };

  return {
    url: buildRelayApiUrl(relayBaseUrl, "/hosts/sync"),
    body: {
      hostId: normalizedSnapshot.hostId,
      host: {
        ...registration,
        lastSeenAt: registration.connectedAt,
      },
      sessions: normalizedSnapshot.sessions,
    },
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

async function writeState(partial = {}, snapshot = null) {
  const nextSnapshot = snapshot || buildSessionSnapshotPayload({ hostId, hub: await readHubConfig() });
  const next = {
    running: true,
    pid: process.pid,
    status: "running",
    relayBaseUrl,
    hostId,
    hostDisplayName,
    sessionCount: nextSnapshot.sessions.length,
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

  async function syncOnce() {
    const hub = await readHubConfig();
    const snapshot = buildSessionSnapshotPayload({ hostId, hub });

    if (relayBaseUrl) {
      const request = buildHostSyncRequest({
        relayBaseUrl,
        host: {
          ...registration,
          connectedAt: registration.connectedAt,
        },
        snapshot,
      });
      const response = await fetch(request.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(request.body),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`relay sync failed: HTTP ${response.status} ${body.trim()}`);
      }
    }

    await writeState({
      startedAt: registration.connectedAt,
      connectedAt: registration.connectedAt,
      lastError: null,
    }, snapshot);
  }

  await syncOnce();

  const timer = setInterval(() => {
    void syncOnce().catch(async (error) => {
      console.error("[relay-agent] failed to sync", error);
      await writeState({
        lastError: String(error?.message || error),
      }).catch(() => {});
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
