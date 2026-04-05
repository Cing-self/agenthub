# AgentHub Local Voice WebSocket And Call Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the iPhone-to-Host HTTP audio polling path with one authenticated local WebSocket channel and persist final realtime call transcript/reply into the bound AgentHub thread.

**Architecture:** Keep Cloudflare Relay as the pairing, discovery, and call-control plane. Add a local `/calls/:callId/realtime` WebSocket on the desktop bridge so iOS can stream input audio and receive output audio plus transcript/reply events on one connection. Extend the gateway voice session manager to normalize provider transcript/reply events and let the local bridge write final user/assistant events into the existing `hub.collaboration.events` thread model.

**Tech Stack:** Node.js `http` + WebSocket upgrade handling, existing `ws` runtime dependency for provider sessions, Swift `URLSessionWebSocketTask`, existing AgentHub collaboration event storage, existing iOS voice streamer.

### Task 1: Add normalized voice interaction events and thread persistence hooks

**Files:**
- Create: `src-tauri/scripts/voice-thread-memory.mjs`
- Modify: `src-tauri/scripts/gateway-voice-session.mjs`
- Modify: `src-tauri/scripts/volcengine-realtime-session.mjs`
- Test: `src-tauri/scripts/__tests__/gateway-voice-session.test.mjs`
- Test: `src-tauri/scripts/__tests__/voice-thread-memory.test.mjs`

**Step 1: Write the failing tests**

Add tests proving:
- the gateway voice session manager emits a normalized `user_final` event when provider transcript changes
- the gateway voice session manager emits a normalized `assistant_final` event when provider reply text changes and the provider marks the turn complete
- the thread memory helper writes those final events into `hub.collaboration.events` as one `user_message` and one `assistant_message` under the bound thread/session

**Step 2: Run tests to verify they fail**

Run:

```bash
node --test src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs
```

Expected:
- FAIL because no interaction callback / thread memory helper exists yet

**Step 3: Write the minimal implementation**

Implement:
- a small `voice-thread-memory.mjs` module that:
  - binds `callId -> threadId/sessionId/agentId`
  - appends final `user_message` / `assistant_message` events using the same collaboration event model as gateway turns
- provider-session event normalization in `gateway-voice-session.mjs`
- provider raw-event forwarding in `volcengine-realtime-session.mjs`

**Step 4: Run tests to verify they pass**

Run:

```bash
node --test src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add src-tauri/scripts/voice-thread-memory.mjs src-tauri/scripts/gateway-voice-session.mjs src-tauri/scripts/volcengine-realtime-session.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs
git commit -m "feat: persist realtime voice turns into thread memory"
```

### Task 2: Add the local realtime voice WebSocket on the desktop bridge

**Files:**
- Create: `src-tauri/scripts/voice-bridge-realtime.mjs`
- Modify: `src-tauri/scripts/remote-bridge-worker.mjs`
- Test: `src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs`

**Step 1: Write the failing tests**

Add tests proving:
- the realtime bridge protocol accepts `audio.input` frames and forwards them to the voice session manager
- the realtime bridge protocol streams `audio.output` frames back to the client
- the realtime bridge protocol can push `transcript.final`, `assistant.final`, and `session.state` frames
- unauthorized or unknown calls are rejected

**Step 2: Run tests to verify they fail**

Run:

```bash
node --test src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs
```

Expected:
- FAIL because the realtime bridge protocol module does not exist yet

**Step 3: Write the minimal implementation**

Implement:
- a focused protocol helper for the local voice WebSocket
- a `/calls/:callId/realtime` WebSocket upgrade path in `remote-bridge-worker.mjs`
- call binding so the active relay call’s `sessionId` becomes the thread target for persisted voice memory events
- fallback compatibility: keep the existing HTTP `audio-chunks` / `audio-output` routes untouched

**Step 4: Run tests to verify they pass**

Run:

```bash
node --test src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add src-tauri/scripts/voice-bridge-realtime.mjs src-tauri/scripts/remote-bridge-worker.mjs src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs
git commit -m "feat: add local realtime voice websocket bridge"
```

### Task 3: Switch iOS voice streaming to the local realtime WebSocket

**Files:**
- Create: `ios-app/Sources/Services/RelayCallRealtimeSocket.swift`
- Modify: `ios-app/Sources/Services/VoiceCallBridgeClient.swift`
- Modify: `ios-app/Sources/Services/RelayCallAudioStreamer.swift`
- Modify: `ios-app/Tests/RelayModelsTests.swift`

**Step 1: Write the failing tests**

Add tests proving:
- the iOS client derives the correct `ws://` / `wss://` realtime URL from the bridge base URL
- it encodes `audio.input` frames with the existing chunk metadata
- it decodes `audio.output`, `transcript.final`, and `assistant.final` frames
- the streamer prefers the realtime socket path and only falls back to HTTP when the socket cannot be created

**Step 2: Run tests to verify they fail**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc -parse-as-library ios-app/Tests/RelayModelsTests.swift ios-app/Sources/Models/BridgeModels.swift ios-app/Sources/Models/RelayModels.swift ios-app/Sources/Services/BridgeConfigStore.swift ios-app/Sources/Services/BridgeClient.swift ios-app/Sources/Services/VoiceCallBridgeClient.swift ios-app/Sources/Services/RelayCallAudioStreamer.swift ios-app/Sources/Services/RelayCallRealtimeSocket.swift -o /tmp/relay-models-tests && /tmp/relay-models-tests
```

Expected:
- FAIL because the realtime socket service and its helpers do not exist yet

**Step 3: Write the minimal implementation**

Implement:
- a `URLSessionWebSocketTask`-based realtime socket client
- live receive loop for `audio.output` and transcript/reply events
- streamer integration that sends audio over the socket instead of POST polling when the realtime socket is available

**Step 4: Run tests to verify they pass**

Run:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc -parse-as-library ios-app/Tests/RelayModelsTests.swift ios-app/Sources/Models/BridgeModels.swift ios-app/Sources/Models/RelayModels.swift ios-app/Sources/Services/BridgeConfigStore.swift ios-app/Sources/Services/BridgeClient.swift ios-app/Sources/Services/VoiceCallBridgeClient.swift ios-app/Sources/Services/RelayCallAudioStreamer.swift ios-app/Sources/Services/RelayCallRealtimeSocket.swift -o /tmp/relay-models-tests && /tmp/relay-models-tests
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add ios-app/Sources/Services/RelayCallRealtimeSocket.swift ios-app/Sources/Services/VoiceCallBridgeClient.swift ios-app/Sources/Services/RelayCallAudioStreamer.swift ios-app/Tests/RelayModelsTests.swift
git commit -m "feat: stream local voice calls over websocket"
```

### Task 4: Verify the thread memory and direct-path operator flow

**Files:**
- Modify: `src/pages/RemoteHostsPage.tsx`
- Modify: `ios-app/README.md`
- Modify: `docs/plans/2026-04-05-agenthub-local-voice-ws-memory.md`

**Step 1: Write the verification checklist**

Document:
- how to confirm the media path is local realtime websocket
- how to confirm final transcript/reply landed in the bound AgentHub thread
- how to inspect direct bridge diagnostics logs

**Step 2: Run verification commands**

Run:

```bash
node --test src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios-app/LobsterMobile.xcodeproj -scheme LobsterMobile -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Expected:
- all tests PASS
- web build PASS
- iOS build PASS

**Step 3: Commit**

```bash
git add src/pages/RemoteHostsPage.tsx ios-app/README.md docs/plans/2026-04-05-agenthub-local-voice-ws-memory.md
git commit -m "docs: record local voice websocket operator flow"
```

## Operator Checklist (April 5, 2026)

### Confirm the media path is the local realtime WebSocket

1. Pair the iPhone and start an audio call against a selected host/session.
2. On the iPhone, the expected successful transport log is `voice-streamer:transport ... mode=realtime-ws`.
3. If the phone logs `voice-streamer:realtime-fallback`, the app has dropped back to the legacy HTTP polling path and the direct bridge transport still needs attention.
4. On the desktop, `Remote Hosts` should show a `Realtime Voice Session` card with moving chunk and byte counters while audio is flowing.

### Confirm final transcript and reply land in the bound thread

1. Keep the call bound to a concrete AgentHub session before speaking.
2. After the provider emits final transcript/reply events, open the same desktop thread.
3. The thread should receive one user transcript message and one assistant reply message written through `voice-thread-memory.mjs`.
4. The persisted records land in `hub.collaboration.events` with `source = voice-call` and the active `callId`.

### Inspect direct bridge diagnostics

1. Enable `Voice diagnostics` from the iOS `Advanced` connection panel before connecting.
2. Use `Remote Hosts -> Recent Logs` on the desktop to inspect the latest bridge/provider events.
3. The bridge log path is surfaced in that panel and defaults to `~/.agenthub/logs/remote-bridge.log`.

## Verification Status (April 5, 2026)

The planned verification commands were rerun after the final documentation pass:

```bash
node --test src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/voice-thread-memory.test.mjs src-tauri/scripts/__tests__/voice-bridge-realtime.test.mjs src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios-app/LobsterMobile.xcodeproj -scheme LobsterMobile -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Result: all checks passed on April 5, 2026.
