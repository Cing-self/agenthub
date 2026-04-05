# AgentHub Volcengine Realtime Voice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the desktop gateway voice session to a real Volcengine realtime voice WebSocket session so iOS audio chunks can reach the configured provider without changing the relay call schema again.

**Architecture:** Keep relay and local gateway responsibilities unchanged: relay handles pairing and call signaling, the desktop gateway owns the realtime provider session, and iOS continues uploading PCM chunks to the host. Add a Volcengine-specific realtime session adapter that translates gateway audio chunk ingress into provider events and folds provider responses back into the existing relay diagnostics state.

**Tech Stack:** Node.js local gateway scripts, built-in WebSocket client, existing relay call controller/state files, Node built-in test runner, Vite build, Tauri relay status parsing

### Task 1: Add failing tests for provider session lifecycle

**Files:**
- Create: `src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs`
- Modify: `src-tauri/scripts/__tests__/gateway-voice-session.test.mjs`
- Modify: `src-tauri/scripts/gateway-voice-session.mjs`

**Step 1: Write the failing test**

Add tests that expect:
- a Volcengine realtime session sends the initial `session.update` event after the WebSocket opens
- appending a PCM audio chunk sends `input_audio_buffer.append`
- provider events update a compact summary with audio/text output deltas and terminal status
- the gateway voice session manager exposes provider event state in its returned summaries

**Step 2: Run test to verify it fails**

Run:

```bash
node --test src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs
```

Expected: FAIL because there is no provider session adapter or summary wiring yet

**Step 3: Write minimal implementation**

Implement:
- a Volcengine realtime session helper with injectable WebSocket factory
- a provider event summary shape for transcript/audio/status
- gateway voice session manager integration that merges provider summary into the relay-visible session summary

**Step 4: Run test to verify it passes**

Run the same command.

Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-04-05-agenthub-volcengine-realtime-voice.md src-tauri/scripts/gateway-voice-session.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs
git commit -m "feat: add volcengine realtime voice gateway session"
```

### Task 2: Surface realtime provider output in relay state and diagnostics

**Files:**
- Modify: `src-tauri/scripts/remote-bridge-worker.mjs`
- Modify: `src-tauri/src/commands/relay.rs`
- Modify: `src/pages/RemoteHostsPage.tsx`
- Modify: `src-tauri/scripts/__tests__/gateway-call-controller.test.mjs`
- Optional modify: `ios-app/Sources/Models/RelayModels.swift`

**Step 1: Write the failing test**

Add tests that expect:
- relay state keeps the current provider session summary when audio chunks stream in
- Rust relay status parsing keeps provider output fields
- Remote Hosts diagnostics can render current transcript/audio output state without assuming all fields exist

**Step 2: Run test to verify it fails**

Run:

```bash
node --test src-tauri/scripts/__tests__/gateway-call-controller.test.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs
~/.cargo/bin/cargo test relay_status_parses_active_call_summary --manifest-path src-tauri/Cargo.toml
npm run build
```

Expected: FAIL because relay-visible state does not include provider output details yet

**Step 3: Write minimal implementation**

Implement:
- relay state persistence for provider summary fields
- Rust parsing fields for transcript/audio output status
- Remote Hosts UI rows for realtime transcript/audio event diagnostics

**Step 4: Run test to verify it passes**

Run the same commands.

Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/scripts/remote-bridge-worker.mjs src-tauri/src/commands/relay.rs src/pages/RemoteHostsPage.tsx src-tauri/scripts/__tests__/gateway-call-controller.test.mjs
git commit -m "feat: show realtime voice provider diagnostics"
```

### Task 3: Verify the vertical slice and document operator setup

**Files:**
- Modify: `ios-app/README.md`
- Modify: `docs/plans/2026-04-04-agenthub-voice-video-mvp.md`
- Optional modify: `docs/plans/2026-04-04-agenthub-volcengine-doubao-asr.md`

**Step 1: Write the checklist**

Document:
- required Volcengine provider fields already exposed in AgentHub
- current audio ingress path: `iOS mic -> host bridge -> gateway voice session -> Volcengine realtime`
- current missing piece if no direct bridge base URL is configured on iOS
- smoke test sequence for starting an audio call and watching provider status change

**Step 2: Verify the slice**

Run:

```bash
node --test src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/gateway-call-controller.test.mjs
~/.cargo/bin/cargo test relay_status_parses_active_call_summary --manifest-path src-tauri/Cargo.toml
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios-app/LobsterMobile.xcodeproj -scheme LobsterMobile -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Expected: PASS

**Step 3: Commit**

```bash
git add ios-app/README.md docs/plans/2026-04-04-agenthub-voice-video-mvp.md docs/plans/2026-04-05-agenthub-volcengine-realtime-voice.md
git commit -m "docs: record realtime voice operator workflow"
```

## Operator Setup Checklist (April 5, 2026)

### Required Volcengine fields in AgentHub

The desktop `Models` page must expose and fill:

- provider `apiKey`
- provider `audio.realtimeVoiceModel`
- provider `audio.realtimeAppId`
- provider `audio.realtimeAppKey`
- provider `audio.realtimeToken`
- provider `audio.realtimeResourceId`
- hub media defaults `voice.realtimeProviderId`
- hub media defaults `voice.realtimeModelId`

When these values are missing, the desktop gateway reports a blocked realtime session and `Remote Hosts` shows the missing keys directly in the diagnostics card.

### Current audio ingress path

`iPhone mic -> host bridge -> gateway voice session -> Volcengine realtime`

Relay stays responsible for pairing, discovery, and call signaling. The media path is still anchored on the paired host's local bridge.

### Current missing piece when iOS lacks direct bridge config

If the iPhone does not have a reachable direct bridge base URL and token, relay signaling can still create the call, but audio ingress cannot start. Pairing should carry a direct bridge hint when available; otherwise the user must fill the `Advanced` direct bridge form manually on iOS.

### Smoke test sequence

1. Start `Remote Mode` on the desktop and verify the host is online.
2. Pair the iPhone and confirm the host/session list loads.
3. Start a voice call from the selected session.
4. Watch `Remote Hosts` for:
   - an active call summary
   - a `Realtime Voice Session` card
   - provider transcript/output fields changing as speech flows
5. End the turn and confirm the selected desktop thread receives the final transcript and assistant reply.

## Verification Status (April 5, 2026)

The vertical slice was re-verified with:

```bash
node --test src-tauri/scripts/__tests__/volcengine-realtime-session.test.mjs src-tauri/scripts/__tests__/gateway-voice-session.test.mjs src-tauri/scripts/__tests__/gateway-call-controller.test.mjs
~/.cargo/bin/cargo test relay_status_parses_active_call_summary --manifest-path src-tauri/Cargo.toml
npm run build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project ios-app/LobsterMobile.xcodeproj -scheme LobsterMobile -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Result: all checks passed on April 5, 2026.
