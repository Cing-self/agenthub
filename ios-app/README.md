# LobsterMobile iOS

Current direction:

- Native SwiftUI app, not a wrapped web view
- Default onboarding is `pairing + cloud relay`, not manual `Base URL + token`
- Mobile-first chat surface with a left history drawer
- Relay is the control plane, while the current audio media path still reuses the paired desktop's local bridge

## What is included

- `project.yml` for generating an Xcode project with XcodeGen
- SwiftUI app shell and feature structure
- Relay client for:
  - pairing invite claim
  - paired host list
  - host session list
  - relay text turns with polling-based progress updates
- Voice call controls backed by relay call state and a local realtime WebSocket
- Direct bridge client kept as `Advanced` mode for local debugging and the current voice media ingress path
- Local storage for relay pairing state and optional direct bridge config

## Open and run

1. Open `ios-app/LobsterMobile.xcodeproj` in Xcode
2. Select the `LobsterMobile` scheme
3. Choose an iPhone simulator or a real device
4. Press Run

CLI build for simulator:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild \
  -project LobsterMobile.xcodeproj \
  -scheme LobsterMobile \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  build
```

## Pairing flow

On first launch, the app opens the connection sheet and expects a desktop pairing link:

1. Start AgentHub desktop from the same worktree branch
2. In `Remote Hosts`, configure the relay URL and start `Remote Mode`
3. Generate a pairing invite
4. Paste the pairing link into the iOS app
5. The app claims the host and stores relay identity plus any direct bridge hint carried by the pairing payload
6. The app will load `Hosts -> Sessions -> Chat`

`Advanced` mode still exposes direct bridge fields for local debugging on the same Mac.

## Voice call operator flow

The current voice slice is:

`iPhone mic -> local /calls/:callId/realtime websocket -> desktop gateway voice session -> Volcengine realtime`

Relay still owns pairing, host discovery, session selection, and call signaling. Audio ingress is not fully relay-native yet, so the phone still needs a reachable direct bridge base URL and token for the selected desktop.

### Required desktop setup

1. In AgentHub desktop `Models`, configure the Volcengine provider audio fields:
   - `realtimeVoiceModel`
   - `realtimeAppId`
   - `realtimeAppKey`
   - `realtimeToken`
   - `realtimeResourceId`
2. In the same page, set `Hub media -> Voice -> realtimeProviderId` and `realtimeModelId`.
3. In `Remote Hosts`, start `Remote Mode` and verify the host is online before pairing.

### Starting a voice call

1. Pair the phone from `Remote Hosts`.
2. If the pairing payload did not fill the direct bridge base URL or token automatically, open `Advanced` in the iOS connection sheet and enter them manually.
3. Optionally enable `Voice diagnostics` in `Advanced` before connecting.
4. Open a host and session, then start a voice call from chat.
5. On the desktop, `Remote Hosts` should show an active call plus a `Realtime Voice Session` card with chunk counters, provider state, transcript, and assistant text.
6. After the provider emits final transcript and final reply text, the bound AgentHub thread should receive one user transcript message and one assistant reply message.

### Troubleshooting

- If `Realtime Voice Session` shows `missing config`, fill the missing provider fields in `Models`.
- If the iPhone cannot reach the audio ingress path, replace the direct bridge URL in `Advanced` with a LAN-reachable address for the same desktop bridge.
- If the app falls back away from realtime WebSocket transport, enable `Voice diagnostics` and inspect the desktop `Remote Hosts -> Recent Logs` panel.
- The default desktop bridge log file is `~/.agenthub/logs/remote-bridge.log`.

## Run on a real iPhone

For local device testing, you do not need App Store packaging yet. You only need a signed development build:

1. Connect the iPhone to your Mac
2. In Xcode, select your device as the run destination
3. Open `Signing & Capabilities`
4. Pick your Apple team or Personal Team
5. If the bundle id conflicts, change it to a unique value such as `com.<yourname>.lobstermobile.dev`
6. On the iPhone, enable Developer Mode if prompted
7. Press Run and let Xcode install the app

CLI build for a physical device:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild \
  -project LobsterMobile.xcodeproj \
  -scheme LobsterMobile \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  build
```

If you need a signed archive later, do that from Xcode Organizer after the development install path is stable.

## Rename later

`LobsterMobile` is only a working app name. It can be renamed after the product name is finalized.
