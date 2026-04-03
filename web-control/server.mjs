import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4180);
const ROOT = new URL(".", import.meta.url).pathname;
const BRIDGE_ORIGIN = process.env.AGENTHUB_BRIDGE_ORIGIN || "http://127.0.0.1:18921";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = normalize(join(ROOT, decoded));
  return filePath.startsWith(ROOT) ? filePath : null;
}

async function proxyToBridge(req, res, pathname) {
  const targetUrl = new URL(pathname.replace(/^\/api/, "") || "/", BRIDGE_ORIGIN);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (key.toLowerCase() === "host") continue;
    headers.set(key, Array.isArray(value) ? value.join(",") : value);
  }

  const body =
    req.method && req.method !== "GET" && req.method !== "HEAD"
      ? req
      : undefined;

  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });

  const outgoingHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "content-length") return;
    outgoingHeaders[key] = value;
  });

  res.writeHead(response.status, outgoingHeaders);
  const text = await response.text();
  res.end(text);
}

async function serveStatic(res, pathname) {
  if (pathname === "/client-config.js") {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(
      `window.__AGENTHUB_REMOTE_CONFIG__ = ${JSON.stringify({ baseUrl: "/api" })};\n`,
    );
    return;
  }

  const filePath = safeFilePath(pathname);
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const type = MIME_TYPES[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        service: "web-control-relay",
        bridgeOrigin: BRIDGE_ORIGIN,
      });
      return;
    }

    if (url.pathname.startsWith("/api")) {
      await proxyToBridge(req, res, url.pathname + url.search);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      type: "ready",
      port: PORT,
      localUrl: `http://127.0.0.1:${PORT}`,
      bridgeOrigin: BRIDGE_ORIGIN,
    }),
  );
});
