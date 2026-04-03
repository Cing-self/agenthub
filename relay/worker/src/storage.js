function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
  return value.trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryRelayStorage() {
  const invites = [];
  const pairings = [];
  const hosts = new Map();
  const hostSessions = new Map();

  return {
    invites,
    pairings,
    hosts,
    hostSessions,
    debug() {
      return {
        invites: invites.map((invite) => clone(invite)),
        pairings: pairings.map((pairing) => clone(pairing)),
        hosts: Array.from(hosts.values()).map((host) => clone(host)),
        hostSessions: Array.from(hostSessions.entries()).map(([hostId, sessions]) => ({
          hostId,
          sessions: clone(sessions),
        })),
      };
    },
  };
}

export async function upsertHostMetadata(storage, host) {
  const record = {
    hostId: requiredString(host.hostId, "hostId"),
    displayName: requiredString(host.displayName, "displayName"),
    status: requiredString(host.status, "status"),
    lastSeenAt: requiredString(host.lastSeenAt, "lastSeenAt"),
    capabilities: Array.isArray(host.capabilities) ? [...host.capabilities] : [],
  };

  storage.hosts.set(record.hostId, record);
  return clone(record);
}

export async function createPairingInvite(storage, invite) {
  const record = {
    inviteId: requiredString(invite.inviteId, "inviteId"),
    hostId: requiredString(invite.hostId, "hostId"),
    code: requiredString(invite.code, "code"),
    createdAt: requiredString(invite.createdAt, "createdAt"),
    expiresAt: requiredString(invite.expiresAt, "expiresAt"),
    claimedAt: null,
    claimedByClientId: null,
  };

  storage.invites.push(record);
  return clone(record);
}

export async function claimPairingInvite(storage, { code, clientId, claimedAt }) {
  const normalizedCode = requiredString(code, "code");
  const normalizedClientId = requiredString(clientId, "clientId");
  const normalizedClaimedAt = requiredString(claimedAt, "claimedAt");

  const invite = storage.invites.find((item) => item.code === normalizedCode);
  if (!invite) {
    throw new Error("Pairing invite not found");
  }
  if (invite.claimedAt) {
    throw new Error("Pairing invite already claimed");
  }
  if (Date.parse(invite.expiresAt) < Date.parse(normalizedClaimedAt)) {
    throw new Error("Pairing invite expired");
  }

  invite.claimedAt = normalizedClaimedAt;
  invite.claimedByClientId = normalizedClientId;

  const pairing = {
    hostId: invite.hostId,
    clientId: normalizedClientId,
    claimedAt: normalizedClaimedAt,
  };
  storage.pairings.push(pairing);
  return clone(pairing);
}

export async function listPairedHosts(storage, { clientId }) {
  const normalizedClientId = requiredString(clientId, "clientId");

  return storage.pairings
    .filter((pairing) => pairing.clientId === normalizedClientId)
    .map((pairing) => storage.hosts.get(pairing.hostId))
    .filter(Boolean)
    .map((host) => clone(host));
}

export async function upsertHostSessions(storage, { hostId, sessions }) {
  const normalizedHostId = requiredString(hostId, "hostId");
  const normalizedSessions = Array.isArray(sessions)
    ? sessions.map((session) => ({
        sessionId: requiredString(session.sessionId, "sessionId"),
        hostId: requiredString(session.hostId, "session.hostId"),
        title: String(session.title || "").trim() || "Untitled session",
        summary: String(session.summary || "").trim(),
        updatedAt: requiredString(session.updatedAt, "updatedAt"),
        primaryAgentId:
          typeof session.primaryAgentId === "string" && session.primaryAgentId.trim().length > 0
            ? session.primaryAgentId.trim()
            : null,
        state: String(session.state || "active").trim() || "active",
      }))
    : [];

  storage.hostSessions.set(normalizedHostId, normalizedSessions);
  return clone(normalizedSessions);
}

export async function listHostSessions(storage, { hostId }) {
  const normalizedHostId = requiredString(hostId, "hostId");
  return clone(storage.hostSessions.get(normalizedHostId) || []);
}
