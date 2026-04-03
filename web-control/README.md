# Web Control

This folder is the first web entry for the local bridge.

It intentionally lives in the same repository as the desktop app, but stays
separate from the main Tauri frontend:

- `src/` and `src-tauri/` remain the desktop product
- `web-control/` is a thin remote client that talks to the local bridge
- the local bridge remains the single adapter to the local runtime

That split keeps the product model clean:

- one codebase
- multiple entry surfaces
- one shared local runtime and bridge protocol

## Why It Stays In This Repo

This web client needs to stay close to the desktop app because it shares:

- the bridge contract
- thread and agent semantics
- future authentication and remote-control behavior
- the same product language and interaction model

If it moved to a separate repository too early, even small bridge changes would
require cross-repo coordination for every iteration.

## Suggested Architecture

For the current phase, the simplest path is:

```text
Web client -> Cloudflare Tunnel -> local remote bridge -> local runtime
```

That means:

- the web UI can be deployed separately later
- the bridge still owns all local-agent logic
- we avoid rebuilding local runtime access in a second stack

When the product grows into a fuller control plane, this can evolve into:

```text
Web client -> Cloudflare Worker/DO -> local remote bridge -> local runtime
```

But that is a later upgrade, not a requirement for the first usable version.

## Current Scope

The current web client is intentionally small:

- connect to a bridge URL with a token
- load thread list
- open a thread
- send a remote turn
- poll for updates

## Local Development

You can open `index.html` directly for quick UI iteration, but the safer way is
to serve this folder as a static site:

```bash
cd /Users/dolphin/Desktop/Dolphin/agenthub/web-control
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

Use the local bridge values from `Remote Hosts`:

- bridge URL, for example `http://127.0.0.1:18921`
- bridge token

## Next Step

The right next move is not creating a second repository.

The right next move is:

1. keep the web client in this repo
2. stabilize the bridge contract
3. then deploy this folder as a separate web surface

That gives us one platform with multiple entry points instead of multiple
products drifting apart.
