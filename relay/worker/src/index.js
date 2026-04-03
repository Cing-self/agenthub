import { HostRoom } from "./objects/host-room.js";
import {
  createMemoryRelayStorage,
  createPairingInvite,
  claimPairingInvite,
  listPairedHosts,
  upsertHostMetadata,
} from "./storage.js";

export { HostRoom };

let fallbackStorage = null;

function getStorage(env) {
  if (env?.RELAY_STORAGE) {
    return env.RELAY_STORAGE;
  }
  if (!fallbackStorage) {
    fallbackStorage = createMemoryRelayStorage();
  }
  return fallbackStorage;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const storage = getStorage(env);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "agenthub-relay",
      });
    }

    if (request.method === "POST" && url.pathname === "/api/pairing/invites") {
      const body = await readJson(request);
      if (body.host) {
        await upsertHostMetadata(storage, body.host);
      }

      const invite = await createPairingInvite(storage, {
        inviteId: body.inviteId,
        hostId: body.host?.hostId || body.hostId,
        code: body.code,
        createdAt: body.createdAt,
        expiresAt: body.expiresAt,
      });

      return Response.json({ ok: true, invite });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/pairing/invites/claim"
    ) {
      const body = await readJson(request);
      const pairing = await claimPairingInvite(storage, body);
      return Response.json({ ok: true, pairing });
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/clients/") &&
      url.pathname.endsWith("/hosts")
    ) {
      const parts = url.pathname.split("/");
      const clientId = parts[3];
      const hosts = await listPairedHosts(storage, { clientId });
      return Response.json({ ok: true, hosts });
    }

    return new Response("Not found", { status: 404 });
  },
};
