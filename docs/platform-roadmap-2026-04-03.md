# Platform Roadmap

Last updated: `2026-04-03`

This document is the current product and engineering plan for the local-first agent platform that is being built in this repository.

It captures:

- what the platform is trying to become
- what has already been built
- what is partially complete
- what is intentionally deferred
- what the next implementation order should be

The current repository name and desktop display name are still transitional. The product direction is moving away from a simple "AgentHub" desktop app toward a broader local-first platform with gateway, native mobile, voice, and remote control capabilities.

## 1. Product Direction

### 1.1 Core idea

The long-term product is not "just a desktop chat app".

It is a local-first agent platform where:

- the `agent` is the stable identity
- channels such as Feishu, web, voice, and future mobile entry points are only `entrances`
- the local machine remains the main `runtime host`
- remote access is added later as a `bridge/control plane`, not as a replacement for the local runtime

### 1.2 Product principles

1. One agent, many entrances  
   The same agent should be reachable from different surfaces such as desktop chat, Feishu, mobile app, or voice.

2. Local-first execution  
   Code, files, local context, local tooling, and sensitive workflows should continue to run on the local machine whenever possible.

3. Reuse before reinvention  
   Memory, session, and runtime state should reuse Claude/Claude Code capabilities where possible instead of rebuilding parallel systems inside the app.

4. Gateway and remote control are different layers  
   `Gateway` solves "how external users find and talk to the agent".  
   `Remote control` solves "how the owner remotely drives the local runtime from another device".

5. Native where it matters  
   Mobile voice, device permissions, location, calendar, and future video/call experiences should live in a native iOS app rather than only in a mobile web view.

## 2. Target Architecture

### 2.1 Major layers

#### Agent Identity

The stable "person" that users interact with.

This layer owns:

- persona / prompt
- tool capability profile
- runtime selection
- session ownership
- future memory ownership

#### Runtime Host

The environment where the agent actually runs.

Current focus:

- local machine runtime
- Claude / Claude Code based runtimes
- local CLI-backed execution

#### Gateway

The transport and routing layer for external entrances.

Current and future entrances:

- desktop chat
- Feishu
- web remote chat
- native iOS
- native voice
- future Discord / Telegram / QQ / others

The gateway layer should own:

- message ingress/egress
- mention / group policy
- thread session policy
- transport-specific streaming behavior
- mapping from external conversation to runtime session

#### Remote Bridge / Control Plane

The layer that exposes the local runtime to another device.

This is not the same thing as a channel gateway.

It should own:

- remote thread listing
- remote thread detail
- remote turn submission
- local runtime health
- future task control
- future permission prompts
- future logs and activity stream

#### Native Mobile App

The future primary consumer app for:

- chat
- voice entry
- remote control
- device-native capabilities such as calendar and location

## 3. Current Implementation Status

### 3.1 Desktop shell and local work surface

Status: `usable`

Implemented:

- Tauri desktop shell
- React/Vite work surface
- thread-based chat
- config surface for runtimes, models, secrets, memory, MCP, skills, and remote hosts
- improved desktop chrome and sidebar layout

Relevant areas:

- [README.md](/Users/dolphin/Desktop/Dolphin/agenthub/README.md)
- [src/App.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/App.tsx)
- [src/components/layout/Sidebar.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/components/layout/Sidebar.tsx)
- [src/pages/work/ChatPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx)

### 3.2 Feishu gateway

Status: `first end-to-end version complete`

Implemented:

- Feishu connection flow in `Channels`
- credential validation
- configurable smart agent binding
- mention / group response behavior
- card capability detection
- long-running gateway worker process
- message receive -> route -> local runtime -> reply path
- fallback behavior when streaming card capability is unavailable

Important note:

The current focus is not to make Feishu "perfect" in every edge case right now. It is the first fully working channel and the reference implementation for the future gateway abstraction.

Relevant areas:

- [src/pages/ChannelsPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/ChannelsPage.tsx)
- [src/lib/types/channels.ts](/Users/dolphin/Desktop/Dolphin/agenthub/src/lib/types/channels.ts)
- [src-tauri/src/commands/channels.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/channels.rs)
- [src-tauri/scripts/gateway-worker.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/gateway-worker.mjs)

### 3.3 Local speech input in desktop chat

Status: `prototype complete`

Implemented:

- microphone permission request flow
- speech capture and local audio meter
- speech-to-text submission path
- raw audio clip persistence
- audio message bubble support in desktop chat

Current reality:

- this is good enough as a prototype
- it is not the final long-term mobile voice experience
- future voice work should move toward native iOS

Relevant areas:

- [src/hooks/useSpeechTranscription.ts](/Users/dolphin/Desktop/Dolphin/agenthub/src/hooks/useSpeechTranscription.ts)
- [src/pages/work/ChatPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/work/ChatPage.tsx)
- [src-tauri/src/commands/cli.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/cli.rs)

### 3.4 Remote bridge

Status: `first usable version complete`

Implemented:

- local bridge worker
- health endpoint
- thread list endpoint
- thread detail endpoint
- send turn endpoint
- desktop management page
- launchd-backed persistence for tunnel/relay in current environment

Relevant areas:

- [src-tauri/src/commands/remote.rs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/src/commands/remote.rs)
- [src-tauri/scripts/remote-bridge-worker.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/src-tauri/scripts/remote-bridge-worker.mjs)
- [src/pages/RemoteHostsPage.tsx](/Users/dolphin/Desktop/Dolphin/agenthub/src/pages/RemoteHostsPage.tsx)

### 3.5 Mobile web remote chat

Status: `bridge validation path complete, not strategic end-state`

Implemented:

- lightweight remote web client
- simplified mobile-first chat layout
- QR/share flow from desktop
- Cloudflare-based public entry for testing

Strategic note:

This is still useful as a validation tool and fallback control surface.  
It is no longer the primary long-term mobile product direction.

Relevant areas:

- [web-control/index.html](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/index.html)
- [web-control/styles.css](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/styles.css)
- [web-control/app.js](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/app.js)
- [web-control/server.mjs](/Users/dolphin/Desktop/Dolphin/agenthub/web-control/server.mjs)

### 3.6 Native iOS companion app

Status: `MVP shell complete and compiling`

Implemented:

- real Xcode project checked into repo
- SwiftUI native app shell
- native chat surface
- left-side history drawer
- connection sheet for bridge URL + token
- bridge API client
- local config persistence
- iOS Info.plist baseline
- build verified via `xcodebuild`

Current scope:

- first chat shell only
- not yet voice-native
- not yet remote-control-complete
- not yet visually polished to final product quality

Relevant areas:

- [ios-app/LobsterMobile.xcodeproj](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/LobsterMobile.xcodeproj)
- [ios-app/Sources/App/LobsterMobileApp.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/App/LobsterMobileApp.swift)
- [ios-app/Sources/Features/Chat/RootChatView.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/RootChatView.swift)
- [ios-app/Sources/Features/Chat/HistoryDrawerView.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/HistoryDrawerView.swift)
- [ios-app/Sources/Features/Chat/ConnectionSheet.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Features/Chat/ConnectionSheet.swift)
- [ios-app/Sources/Services/BridgeClient.swift](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/Sources/Services/BridgeClient.swift)
- [ios-app/README.md](/Users/dolphin/Desktop/Dolphin/agenthub/ios-app/README.md)

## 4. What Is Explicitly Done

The following items are considered materially complete for the current stage:

### Foundation

- desktop shell and config/work split
- local runtime integration baseline
- thread-based local chat
- remote bridge server
- first public remote web validation path

### First gateway

- Feishu as first working external entrance
- route external message into local runtime
- get external reply back out

### First mobile-native shell

- native iOS chat shell
- native Xcode project in repo
- compile-verified iOS target

## 5. What Is Partially Complete

These are real features, but not yet at final product quality.

### Feishu

- working, but not the final abstraction cleanup
- still needs selective hardening and diagnostics polish

### Desktop voice

- prototype works
- not final native voice architecture

### Remote control

- enough to remote chat with the local machine
- not yet a full control plane

### Mobile web

- useful for testing
- not the final mobile product

### Native iOS

- first real app shell exists
- but still needs voice, richer control actions, and product-level polish

## 6. What Is Intentionally Deferred

These are known ideas, but they are not current top priority.

### Additional channels

Examples:

- Discord
- Telegram
- QQ
- WeChat integration beyond current experiments

Reason:

The immediate goal is to make one channel model truly correct and reusable before multiplying adapters.

### Advanced list policies

Examples:

- complex allowlist / denylist UI
- multi-account channel administration
- advanced group routing management

Reason:

These are useful, but not necessary to validate the platform direction.

### Perfect streaming polish in Feishu

Reason:

Enough has been built to validate the gateway concept. The bigger near-term value is voice and native mobile.

### Final naming / branding

Reason:

The product name is still in transition. Engineering should avoid locking the future architecture to the current temporary branding.

## 7. Architectural Decisions Already Made

### 7.1 Gateway vs remote control

This distinction is now explicit:

- `gateway`: how outside users and outside apps talk to the agent
- `remote control`: how the owner remotely drives the local runtime

These should stay separate.

### 7.2 Agent identity is not the same as channel identity

The same agent should be reachable through different entrances.

Channels should not define the agent.  
They should only define transport and policy.

### 7.3 Reuse Claude / runtime session ability where possible

The platform should avoid building a second full memory/session core unless there is a hard reason to do so.

What AgentHub should own:

- mapping external conversations to runtime sessions
- transport and routing policy
- control plane / remote bridge

What the runtime should own when possible:

- core session handling
- model-facing memory behavior
- internal agent execution loop

### 7.4 Native iOS is now the primary mobile direction

Mobile web remains useful, but native iOS is the preferred path for:

- voice
- device permissions
- location
- calendar/reminders
- future call/video experiences

## 8. Remaining Work

### 8.1 Next priority: native iOS voice entry

Goal:

- add native voice capture inside the iOS app
- send either text transcript or audio-backed intent into the same local agent
- keep the same remote bridge / local runtime path

What this likely includes:

- microphone permission flow
- recording UI
- waveform / live level feedback
- first send mode:
  - speech to text -> remote bridge turn
- later mode:
  - raw audio message attachment semantics if runtime path supports it

### 8.2 Then: richer remote control

Goal:

move from "remote chat" to "remote control of the local runtime"

Target capabilities:

- view running thread / current task
- stop current task
- inspect logs
- later approve / reject actions
- later view runtime health and status in a more operational way

### 8.3 Then: iOS-native device capabilities

Likely order:

- notifications
- voice shortcuts / system entry
- calendar
- reminders
- location

Important rule:

high-risk writes should require confirmation

### 8.4 Then: deeper bridge/control plane model

Future questions still open:

- whether a Cloudflare Worker / Durable Object control plane becomes necessary
- whether mobile app and web fallback should both route through a cloud control layer
- how to model remote permissions and secure device registration

This is intentionally after the first native iOS voice and remote-control validation.

## 9. Immediate Execution Order

The next concrete implementation order should be:

1. Native iOS voice input
2. Native iOS message send/receive polish
3. Remote control actions beyond plain chat
4. iOS-native device capability hooks
5. Control-plane hardening if needed
6. Additional channel adapters only after the above is stable

## 10. Acceptance Criteria For The Next Milestone

The next milestone should be considered complete when:

- the iOS app can open and connect to the local bridge
- the iOS app can browse history and send text turns
- the iOS app can capture voice natively
- voice can be sent into the same local agent workflow
- the iOS app can do more than chat: at least one basic remote-control action is available

## 11. Repository Status Summary

If you need the shortest summary:

- The platform foundation is real
- Feishu is the first working gateway
- The remote bridge exists and works
- A mobile web bridge client exists for validation
- A native iOS shell now exists and compiles
- The next real product step is native iOS voice and remote control
