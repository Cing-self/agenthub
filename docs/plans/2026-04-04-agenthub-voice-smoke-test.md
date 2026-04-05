# AgentHub Voice Smoke Test Checklist

Verified on April 5, 2026.

## Goal

Validate the current voice MVP end to end:

`iPhone mic -> paired desktop bridge -> gateway voice session -> provider realtime session -> AgentHub thread memory`

## Prerequisites

- Desktop AgentHub can start `Remote Mode`
- A relay URL is configured and the host can generate pairing invites
- The selected provider has realtime voice credentials configured in `Models`
- The iPhone has a reachable direct bridge base URL and token, either from pairing or the `Advanced` form

## Desktop Setup

1. Open `Models` and fill the realtime voice provider fields:
   - provider API key
   - realtime voice model
   - realtime app id
   - realtime app key
   - realtime token
   - realtime resource id
2. Set `Hub media -> Voice -> realtimeProviderId` and `realtimeModelId`.
3. Open `Remote Hosts`, start `Remote Mode`, and confirm the host is online.

## iPhone Pairing

1. Generate a pairing invite from `Remote Hosts`.
2. Pair the iPhone and confirm the app loads `Hosts -> Sessions -> Chat`.
3. If the pairing payload did not fill the direct bridge config, open `Advanced` and enter the same desktop bridge base URL and token manually.
4. Enable `Voice diagnostics` if you want verbose transport logs during the test.

## Smoke Test

1. Select a concrete host/session in the iPhone app.
2. Start a voice call.
3. Speak a short sentence and wait for the assistant reply.
4. Confirm these desktop signals:
   - `Remote Hosts` shows an active call summary
   - `Remote Hosts` shows a `Realtime Voice Session` card
   - chunk counters and provider transcript/reply fields move while the turn is active
5. Confirm these mobile signals:
   - the transport log contains `mode=realtime-ws`
   - there is no immediate `voice-streamer:realtime-fallback`
6. After the turn completes, open the same desktop thread and confirm:
   - one user transcript message was appended
   - one assistant reply message was appended

## Recovery Checks

- If the desktop shows `missing config`, fill the missing provider fields in `Models`.
- If the phone can signal the call but cannot stream audio, re-check the direct bridge base URL and token.
- If realtime transport falls back to HTTP, inspect `Remote Hosts -> Recent Logs` and the bridge log file at `~/.agenthub/logs/remote-bridge.log`.
- If the desktop thread does not update, confirm the call was started against a selected session and that the host remained bound to that session while the call was live.
