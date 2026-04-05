import Foundation

private func assert(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("Assertion failed: \(message)\n", stderr)
        exit(1)
    }
}

private func testParsesDesktopPairingURL() throws {
    let payload = """
    {
      "v": 1,
      "relayBaseUrl": "https://relay.example.workers.dev/api",
      "hostId": "host_alpha",
      "inviteId": "invite_123",
      "code": "PAIR-123456",
      "expiresAt": "2026-04-03T12:05:00.000Z"
    }
    """
    let encoded = Data(payload.utf8).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    let url = "https://relay.example.workers.dev/pair#pairing=\(encoded)"

    let pairing = try RelayPairingPayload.parse(from: url)

    assert(pairing.relayBaseURL == "https://relay.example.workers.dev/api", "relayBaseURL should decode from pairing link")
    assert(pairing.hostId == "host_alpha", "hostId should decode from pairing link")
    assert(pairing.code == "PAIR-123456", "pairing code should decode from pairing link")
}

private func testParsesCustomSchemePairingURL() throws {
    let payload = """
    {
      "v": 1,
      "relayBaseUrl": "https://relay.example.workers.dev/api",
      "hostId": "host_alpha",
      "inviteId": "invite_123",
      "code": "PAIR-123456",
      "expiresAt": "2026-04-03T12:05:00.000Z"
    }
    """
    let encoded = Data(payload.utf8).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    let url = "lobster://pair?pairing=\(encoded)"

    let pairing = try RelayPairingPayload.parse(from: url)

    assert(pairing.relayBaseURL == "https://relay.example.workers.dev/api", "relayBaseURL should decode from custom scheme link")
    assert(pairing.hostId == "host_alpha", "hostId should decode from custom scheme link")
    assert(pairing.code == "PAIR-123456", "pairing code should decode from custom scheme link")
}

private func testParsesPairingURLWithDirectBridgeFallback() throws {
    let payload = """
    {
      "v": 1,
      "relayBaseUrl": "https://relay.example.workers.dev/api",
      "hostId": "host_alpha",
      "inviteId": "invite_123",
      "code": "PAIR-123456",
      "expiresAt": "2026-04-03T12:05:00.000Z",
      "directBridge": {
        "urls": [
          "http://127.0.0.1:18921",
          "http://192.168.3.80:18921"
        ],
        "token": "ahb_test_123"
      }
    }
    """
    let encoded = Data(payload.utf8).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
    let url = "lobster://pair?pairing=\(encoded)"

    let pairing = try RelayPairingPayload.parse(from: url)

    assert(pairing.directBridge?.token == "ahb_test_123", "direct bridge token should decode from pairing link")
    assert(pairing.directBridge?.urls.count == 2, "direct bridge urls should decode from pairing link")
    assert(pairing.directBridgeConfigs.first?.baseURL == "http://192.168.3.80:18921", "direct bridge fallback should prioritize LAN urls before loopback")
}

private func testClaimResponseDecodesDirectBridgeFallback() throws {
    let json = """
    {
      "ok": true,
      "pairing": {
        "hostId": "host_alpha",
        "clientId": "client_ios",
        "claimedAt": "2026-04-03T12:01:00.000Z",
        "directBridge": {
          "urls": [
            "http://127.0.0.1:18921",
            "http://192.168.3.80:18921"
          ],
          "token": "ahb_test_123"
        }
      }
    }
    """

    let response = try JSONDecoder().decode(RelayPairingClaimResponse.self, from: Data(json.utf8))

    assert(response.pairing.directBridge?.token == "ahb_test_123", "claim response should decode direct bridge token")
    assert(response.pairing.directBridgeConfigs.first?.baseURL == "http://192.168.3.80:18921", "claim response should prioritize LAN direct bridge urls")
}

private func testOnlyFallsBackToDirectBridgeForRelayTransportFailures() {
    assert(
        shouldFallbackToDirectBridge(
            BridgeClientError.server("Relay 请求超时，请确认桌面端在线后重试。")
        ),
        "relay timeout should trigger direct bridge fallback"
    )
    assert(
        shouldFallbackToDirectBridge(
            BridgeClientError.server("Relay 地址无法连接，请检查入口地址。")
        ),
        "relay address errors should trigger direct bridge fallback"
    )
    assert(
        !shouldFallbackToDirectBridge(
            BridgeClientError.server("Pairing invite expired")
        ),
        "semantic relay errors should not trigger direct bridge fallback"
    )
}

private func testSelectsFirstHostAndSessionAfterRefresh() {
    let hostA = RelayHost(
        hostId: "host_alpha",
        displayName: "Work MacBook",
        status: "online",
        lastSeenAt: "2026-04-03T12:00:00.000Z",
        capabilities: ["chat"]
    )
    let hostB = RelayHost(
        hostId: "host_beta",
        displayName: "Home Mac mini",
        status: "online",
        lastSeenAt: "2026-04-03T12:01:00.000Z",
        capabilities: ["chat"]
    )
    let sessionA1 = RelaySession(
        sessionId: "session_alpha_1",
        hostId: "host_alpha",
        title: "Plan relay v1",
        summary: "Design and implementation work",
        updatedAt: "2026-04-03T12:02:00.000Z",
        primaryAgentId: "Claude Code",
        state: "active"
    )
    let sessionA2 = RelaySession(
        sessionId: "session_alpha_2",
        hostId: "host_alpha",
        title: "Fix iOS pairing",
        summary: "SwiftUI migration",
        updatedAt: "2026-04-03T12:03:00.000Z",
        primaryAgentId: "Codex CLI",
        state: "active"
    )
    let sessionB1 = RelaySession(
        sessionId: "session_beta_1",
        hostId: "host_beta",
        title: "Review roadmap",
        summary: "Relay follow-up",
        updatedAt: "2026-04-03T12:04:00.000Z",
        primaryAgentId: "OpenClaw",
        state: "active"
    )

    var workspace = RelayWorkspaceState(
        relayBaseURL: "https://relay.example.workers.dev/api",
        clientId: "client_ios"
    )

    workspace.applyHosts([hostA, hostB])
    assert(workspace.selectedHostId == "host_alpha", "first host should be selected by default")

    workspace.applySessions([sessionA1, sessionA2], for: "host_alpha")
    assert(workspace.selectedSessionId == "session_alpha_1", "first session should be selected when host sessions load")

    workspace.selectHost("host_beta")
    workspace.applySessions([sessionB1], for: "host_beta")
    assert(workspace.selectedHostId == "host_beta", "manual host switch should stick")
    assert(workspace.selectedSessionId == "session_beta_1", "selected session should switch with selected host")
}

private func testDecodesHostWithActiveAudioCall() throws {
    let json = """
    {
      "hostId": "host_alpha",
      "displayName": "Work MacBook",
      "status": "online",
      "lastSeenAt": "2026-04-04T01:00:00.000Z",
      "capabilities": ["chat", "voice"],
      "mediaDefaults": {
        "voice": {
          "providerId": "volcengine",
          "modelId": "doubao-realtime-asr"
        },
        "video": {
          "providerId": "googleapis",
          "modelId": "gemini-2.5-flash"
        }
      },
      "activeCall": {
        "callId": "call_voice_1",
        "hostId": "host_alpha",
        "sessionId": "session_alpha_1",
        "clientId": "client_ios",
        "mode": "audio",
        "state": "live",
        "createdAt": "2026-04-04T01:00:02.000Z",
        "updatedAt": "2026-04-04T01:00:10.000Z",
        "mediaConfig": {
          "voice": {
            "providerId": "volcengine",
            "modelId": "doubao-realtime-asr"
          }
        }
      }
    }
    """

    let host = try JSONDecoder().decode(RelayHost.self, from: Data(json.utf8))

    assert(host.activeCall?.callId == "call_voice_1", "host should decode active call metadata")
    assert(host.activeCall?.mode == .audio, "voice call should decode as audio mode")
    assert(host.activeCall?.state == .live, "voice call should decode as live state")
    assert(host.mediaDefaults?.voice?.providerId == "volcengine", "host should decode default voice provider")
    assert(host.activeCall?.mediaConfig?.voice?.modelId == "doubao-realtime-asr", "call should decode voice model override")
}

private func testCallMediaConfigPrefersExplicitOverride() {
    let defaultMedia = RelayMediaConfig(
        voice: RelayModelSelection(providerId: "volcengine", modelId: "doubao-realtime-asr"),
        video: RelayModelSelection(providerId: "googleapis", modelId: "gemini-2.5-flash")
    )
    let overrideMedia = RelayMediaConfig(
        voice: RelayModelSelection(providerId: "bigmodel", modelId: "glm-asr-2512"),
        video: nil
    )
    let host = RelayHost(
        hostId: "host_alpha",
        displayName: "Work MacBook",
        status: "online",
        lastSeenAt: "2026-04-04T03:40:00.000Z",
        capabilities: ["chat", "voice", "video"],
        mediaDefaults: defaultMedia
    )
    let call = RelayCallSummary(
        callId: "call_voice_1",
        hostId: "host_alpha",
        sessionId: "session_alpha_1",
        clientId: "client_ios",
        mode: .audio,
        state: .live,
        createdAt: "2026-04-04T03:40:01.000Z",
        updatedAt: "2026-04-04T03:40:05.000Z",
        mediaConfig: overrideMedia
    )

    assert(call.effectiveMediaConfig(defaults: host.mediaDefaults)?.voice?.providerId == "bigmodel", "explicit call override should win over host default for voice")
    assert(call.effectiveMediaConfig(defaults: host.mediaDefaults)?.video?.modelId == "gemini-2.5-flash", "host default should fill missing video override")
}

private func testRelayCallAudioOutputRequestUsesSequenceCursor() throws {
    let request = try buildRelayCallAudioOutputRequest(
        config: BridgeConfig(baseURL: "http://192.168.31.10:18921", token: "token_123"),
        callId: "call_voice_1",
        afterSequence: 7,
        limit: 12
    )

    assert(request.url?.absoluteString == "http://192.168.31.10:18921/calls/call_voice_1/audio-output?afterSequence=7&limit=12", "audio output request should include polling cursor")
    assert(request.value(forHTTPHeaderField: "Authorization") == "Bearer token_123", "audio output request should keep bearer token")
    assert(request.httpMethod == "GET", "audio output request should use GET")
}

private func testDecodesRelayCallAudioOutputEnvelope() throws {
    let json = """
    {
      "ok": true,
      "chunks": [
        {
          "sequence": 3,
          "audioBase64": "AQIDBA==",
          "mimeType": "audio/pcm",
          "sampleRateHz": 24000,
          "channels": 1,
          "durationMs": 80
        }
      ],
      "session": {
        "callId": "call_voice_1",
        "status": "streaming",
        "providerId": "volcengine",
        "modelId": "doubao-realtime-voice",
        "ready": true,
        "missing": [],
        "hasAppId": true,
        "hasToken": true,
        "hasResourceId": true,
        "startedAt": "2026-04-05T02:10:00.000Z",
        "lastChunkAt": "2026-04-05T02:10:01.000Z",
        "endedAt": null,
        "receivedChunks": 12,
        "receivedBytes": 16000,
        "sampleRateHz": 16000,
        "channels": 1
      }
    }
    """

    let envelope = try JSONDecoder().decode(RelayCallAudioOutputEnvelope.self, from: Data(json.utf8))

    assert(envelope.ok, "audio output envelope should decode ok flag")
    assert(envelope.chunks.count == 1, "audio output envelope should decode chunks")
    assert(envelope.chunks.first?.sequence == 3, "audio output chunk should decode sequence")
    assert(envelope.chunks.first?.audioData == Data([1, 2, 3, 4]), "audio output chunk should decode base64 payload")
    assert(envelope.session.callId == "call_voice_1", "audio output envelope should decode session payload")
}

private func testRelayCallStateOnlyAllowsKnownValues() throws {
    let live = try JSONDecoder().decode(
        RelayCallState.self,
        from: Data(#""live""#.utf8)
    )
    assert(live == .live, "known call state should decode")

    do {
        _ = try JSONDecoder().decode(
            RelayCallState.self,
            from: Data(#""processing""#.utf8)
        )
        assert(false, "unknown call state should fail decoding")
    } catch {
        assert(true, "unknown call state should fail decoding")
    }
}

private func testWorkspaceUpdatesActiveCallForSelectedHost() {
    let host = RelayHost(
        hostId: "host_alpha",
        displayName: "Work MacBook",
        status: "online",
        lastSeenAt: "2026-04-04T03:40:00.000Z",
        capabilities: ["chat", "voice"]
    )
    var workspace = RelayWorkspaceState(
        relayBaseURL: "https://relay.example.workers.dev/api",
        clientId: "client_ios"
    )
    workspace.applyHosts([host])

    workspace.applyActiveCall(
        RelayCallSummary(
            callId: "call_voice_1",
            hostId: "host_alpha",
            sessionId: "session_alpha_1",
            clientId: "client_ios",
            mode: .audio,
            state: .live,
            createdAt: "2026-04-04T03:40:01.000Z",
            updatedAt: "2026-04-04T03:40:05.000Z"
        )
    )

    assert(workspace.selectedHost?.activeCall?.callId == "call_voice_1", "workspace should surface the active call on the selected host")
    assert(workspace.selectedHost?.activeCall?.state == .live, "workspace should refresh active call state")
}

private func testWorkspaceClearsEndedActiveCall() {
    let liveCall = RelayCallSummary(
        callId: "call_voice_1",
        hostId: "host_alpha",
        sessionId: "session_alpha_1",
        clientId: "client_ios",
        mode: .audio,
        state: .live,
        createdAt: "2026-04-04T03:40:01.000Z",
        updatedAt: "2026-04-04T03:40:05.000Z"
    )
    let host = RelayHost(
        hostId: "host_alpha",
        displayName: "Work MacBook",
        status: "online",
        lastSeenAt: "2026-04-04T03:40:00.000Z",
        capabilities: ["chat", "voice"],
        activeCall: liveCall
    )
    var workspace = RelayWorkspaceState(
        relayBaseURL: "https://relay.example.workers.dev/api",
        clientId: "client_ios",
        hosts: [host],
        selectedHostId: "host_alpha"
    )

    workspace.applyActiveCall(
        RelayCallSummary(
            callId: "call_voice_1",
            hostId: "host_alpha",
            sessionId: "session_alpha_1",
            clientId: "client_ios",
            mode: .audio,
            state: .ended,
            createdAt: "2026-04-04T03:40:01.000Z",
            updatedAt: "2026-04-04T03:40:20.000Z"
        )
    )

    assert(workspace.selectedHost?.activeCall == nil, "ended call should clear the active call on the host")
}

private func testCallConnectedCueOnlyTriggersOnTransitionIntoLive() {
    let dialing = RelayCallSummary(
        callId: "call_voice_1",
        hostId: "host_alpha",
        sessionId: "session_alpha_1",
        clientId: "client_ios",
        mode: .audio,
        state: .dialing,
        createdAt: "2026-04-04T03:40:01.000Z",
        updatedAt: "2026-04-04T03:40:02.000Z"
    )
    let live = RelayCallSummary(
        callId: "call_voice_1",
        hostId: "host_alpha",
        sessionId: "session_alpha_1",
        clientId: "client_ios",
        mode: .audio,
        state: .live,
        createdAt: "2026-04-04T03:40:01.000Z",
        updatedAt: "2026-04-04T03:40:04.000Z"
    )
    let liveRefresh = RelayCallSummary(
        callId: "call_voice_1",
        hostId: "host_alpha",
        sessionId: "session_alpha_1",
        clientId: "client_ios",
        mode: .audio,
        state: .live,
        createdAt: "2026-04-04T03:40:01.000Z",
        updatedAt: "2026-04-04T03:40:06.000Z"
    )

    assert(
        shouldPlayCallConnectedCue(previous: dialing, next: live),
        "call connected cue should trigger when a call first becomes live"
    )
    assert(
        shouldPlayCallConnectedCue(previous: nil, next: live),
        "call connected cue should trigger when a live call is first observed"
    )
    assert(
        !shouldPlayCallConnectedCue(previous: live, next: liveRefresh),
        "call connected cue should not retrigger for repeated live updates"
    )
    assert(
        !shouldPlayCallConnectedCue(previous: dialing, next: dialing),
        "call connected cue should not trigger before the call is live"
    )
}

private func testMergesRelayTurnMessagesWithoutDuplicates() {
    let existing = [
        BridgeMessage(
            id: "msg_user_1",
            role: "user",
            content: "hello",
            timestamp: "2026-04-03T12:00:00.000Z",
            agentId: "dolphin"
        )
    ]

    let turn = RelayTurn(
        turnId: "turn_1",
        hostId: "host_alpha",
        clientId: "client_ios",
        sessionId: "session_alpha_1",
        message: "hello",
        status: "completed",
        createdAt: "2026-04-03T12:00:00.000Z",
        claimedAt: "2026-04-03T12:00:01.000Z",
        completedAt: "2026-04-03T12:00:02.000Z",
        runtimeSessionId: "runtime_1",
        agentId: "dolphin",
        userMessage: BridgeMessage(
            id: "msg_user_1",
            role: "user",
            content: "hello",
            timestamp: "2026-04-03T12:00:00.000Z",
            agentId: "dolphin"
        ),
        assistantMessage: BridgeMessage(
            id: "msg_assistant_1",
            role: "assistant",
            content: "relay reply",
            timestamp: "2026-04-03T12:00:02.000Z",
            agentId: "dolphin"
        ),
        error: nil
    )

    let merged = mergeRelayMessages(existing: existing, turn: turn)

    assert(merged.count == 2, "relay turn merge should dedupe existing user message and append assistant reply")
    assert(merged[0].id == "msg_user_1", "existing user message should stay first")
    assert(merged[1].id == "msg_assistant_1", "assistant reply should append after user message")
}

private func testMergeRelayTurnReplacesInProgressAssistantPreview() {
    let existing = [
        BridgeMessage(
            id: "msg_user_1",
            role: "user",
            content: "hello",
            timestamp: "2026-04-03T12:00:00.000Z",
            agentId: nil
        ),
        BridgeMessage(
            id: "msg_assistant_preview",
            role: "assistant",
            content: "hello wor",
            timestamp: "2026-04-03T12:00:04.000Z",
            agentId: "dolphin"
        ),
    ]

    let turn = RelayTurn(
        turnId: "turn_preview",
        hostId: "host_alpha",
        clientId: "client_ios",
        sessionId: "session_alpha_1",
        message: "hello",
        status: "processing",
        createdAt: "2026-04-03T12:00:00.000Z",
        claimedAt: "2026-04-03T12:00:01.000Z",
        completedAt: nil,
        runtimeSessionId: "runtime_1",
        agentId: "dolphin",
        userMessage: nil,
        assistantMessage: BridgeMessage(
            id: "msg_assistant_preview",
            role: "assistant",
            content: "hello world from gateway",
            timestamp: "2026-04-03T12:00:05.000Z",
            agentId: "dolphin"
        ),
        error: nil
    )

    let merged = mergeRelayMessages(existing: existing, turn: turn)

    assert(merged.count == 2, "relay preview merge should update the assistant preview in place")
    assert(merged[1].id == "msg_assistant_preview", "assistant preview should keep the same id")
    assert(merged[1].content == "hello world from gateway", "assistant preview should refresh with latest streamed content")
}

private func testFormatsRelayMessageTimestampWithoutMilliseconds() {
    let timestamp = MessagePresentation.formattedTimestamp(
        "2026-04-03T13:04:43.288Z",
        referenceDate: Date(timeIntervalSince1970: 1_775_222_683),
        timeZone: TimeZone(secondsFromGMT: 8 * 3600) ?? .current,
        locale: Locale(identifier: "zh_CN")
    )

    assert(timestamp == "21:04", "timestamp should render as concise local time without milliseconds")
}

private func testHidesUserSenderLabelButKeepsAssistantLabel() {
    let user = BridgeMessage(
        id: "msg_user",
        role: "user",
        content: "hello",
        timestamp: "2026-04-03T13:04:43.288Z",
        agentId: "dolphin"
    )
    let assistant = BridgeMessage(
        id: "msg_assistant",
        role: "assistant",
        content: "hello back",
        timestamp: "2026-04-03T13:04:43.288Z",
        agentId: "dolphin"
    )

    assert(MessagePresentation.senderLabel(for: user) == nil, "user sender label should be hidden")
    assert(MessagePresentation.senderLabel(for: assistant) == "dolphin", "assistant sender label should remain visible")
}

private func testDetectsMarkdownPreview() {
    let preview = MessagePresentation.preview(for: """
    # Heading

    Here is **bold** text and a [link](https://example.com).
    """)

    assert(preview.kind == .markdown, "markdown content should be detected")
    assert(preview.renderedText.contains("Heading"), "markdown preview should preserve readable text")
    assert(preview.renderedText.contains("bold"), "markdown preview should include emphasis text")
}

private func testDetectsHTMLPreview() {
    let preview = MessagePresentation.preview(for: """
    <p>Hello <strong>relay</strong> <a href="https://example.com">preview</a></p>
    """)

    assert(preview.kind == .html, "html content should be detected")
    assert(preview.renderedText.contains("Hello"), "html preview should expose readable text")
    assert(preview.renderedText.contains("relay"), "html preview should preserve inner text")
}

private func testOptimisticPendingMessageAppearsInVisibleTimeline() {
    let committed = [
        BridgeMessage(
            id: "msg_assistant_1",
            role: "assistant",
            content: "Earlier reply",
            timestamp: "2026-04-03T13:03:00.000Z",
            agentId: "dolphin"
        )
    ]
    let pending = BridgeMessage.optimisticUserMessage(
        content: "hello from phone",
        createdAt: Date(timeIntervalSince1970: 1_775_222_700),
        agentId: nil
    )

    let visible = mergeVisibleMessages(existing: committed, pending: pending)

    assert(visible.count == 2, "visible timeline should append pending message")
    assert(visible[1].id == pending.id, "pending user message should appear at the end of the visible timeline")
    assert(visible[1].role == "user", "pending message should preserve the user role")
}

private func testComposerUsesCompactLayoutMetrics() {
    assert(ComposerPresentation.buttonDiameter == 38, "composer send button should stay compact")
    assert(ComposerPresentation.verticalPadding == 10, "composer container should use tighter vertical padding")
    assert(ComposerPresentation.maxLineCount == 4, "composer should stop expanding too tall")
}

private func testChatChromeUsesReadableContrastMetrics() {
    let light = ChatChromePresentation.palette(for: .light)
    let dark = ChatChromePresentation.palette(for: .dark)

    assert(!light.isDarkBackground, "light mode should keep a bright page background")
    assert(!light.usesLightForeground, "light mode should render with dark foreground text")
    assert(!light.showsAssistantBubble, "assistant replies should render inline in light mode")
    assert(light.composerUsesElevatedSurface, "light mode composer should still sit on a muted surface")

    assert(dark.isDarkBackground, "dark mode should use a true dark page background")
    assert(dark.usesLightForeground, "dark mode should switch to light foreground text")
    assert(!dark.showsAssistantBubble, "assistant replies should render inline in dark mode too")
    assert(dark.composerUsesElevatedSurface, "dark mode composer should remain readable against the black canvas")
}

private func testFocusedComposerCanDismissFromBackgroundTap() {
    assert(
        ChatInteractionPresentation.shouldDismissComposerOnBackgroundTap(isComposerFocused: true),
        "focused composer should dismiss when the timeline background is tapped"
    )
    assert(
        !ChatInteractionPresentation.shouldDismissComposerOnBackgroundTap(isComposerFocused: false),
        "background taps should do nothing when the composer is already unfocused"
    )
}

private func testConnectionProgressStagesUseFriendlyProductCopy() {
    assert(
        ConnectionProgressStage.claimingPairing.title == "正在连接这台 Mac",
        "pairing claim stage should use product-facing copy"
    )
    assert(
        ConnectionProgressStage.loadingHosts.detail.contains("主机"),
        "loading hosts stage should explain the current relay step"
    )
    assert(
        ConnectionProgressStage.loadingSessions.detail.contains("会话"),
        "loading sessions stage should explain the current relay step"
    )
}

private func testConnectionAttemptGateInvalidatesOlderAttempts() {
    var gate = ConnectionAttemptGate()
    let first = gate.begin()
    let second = gate.begin()

    assert(first != second, "new attempts should advance the connection generation")
    assert(!gate.isCurrent(first), "older attempts should become stale once a new attempt starts")
    assert(gate.isCurrent(second), "latest attempt should remain authoritative")
}

private func testRelayTransportUsesBoundedTimeout() {
    assert(
        RelayTransportDefaults.requestTimeoutSeconds <= 15,
        "relay requests should fail fast enough to avoid indefinite spinner states on device"
    )
    assert(
        RelayTransportDefaults.requestTimeoutSeconds >= 8,
        "relay requests still need enough time for cold starts and mobile networks"
    )
    assert(
        RelayTransportDefaults.maxRetryCount >= 2,
        "relay transport should retry transient mobile network failures"
    )
}

private func testRelayTransportRetriesTransientTimeouts() {
    let timeout = URLError(.timedOut)
    let reset = URLError(.networkConnectionLost)
    let badResponse = BridgeClientError.invalidResponse

    assert(
        shouldRetryTransportError(timeout),
        "timed out transport requests should be retryable"
    )
    assert(
        shouldRetryTransportError(reset),
        "network reset transport requests should be retryable"
    )
    assert(
        !shouldRetryTransportError(badResponse),
        "decoded server responses should not be retried blindly"
    )
}

private func testRelayCallAudioIngressRequiresDirectBridgeConfig() {
    let validConfig = MobileConnectionConfig(
        preferredMode: .relay,
        directBridge: BridgeConfig(
            baseURL: "http://192.168.1.22:18921",
            token: "ahb_test_123"
        ),
        relay: RelayClientConfig(
            relayBaseURL: "https://relay.example.workers.dev/api",
            clientId: "client_ios",
            selectedHostId: "host_alpha",
            selectedSessionId: "session_alpha_1"
        )
    )

    let resolved = try? resolveRelayCallAudioIngress(validConfig)
    assert(resolved?.baseURL == "http://192.168.1.22:18921", "relay audio ingress should reuse direct bridge base URL")
    assert(resolved?.token == "ahb_test_123", "relay audio ingress should reuse direct bridge token")

    let missingToken = MobileConnectionConfig(
        preferredMode: .relay,
        directBridge: BridgeConfig(
            baseURL: "http://192.168.1.22:18921",
            token: ""
        ),
        relay: validConfig.relay
    )

    do {
        _ = try resolveRelayCallAudioIngress(missingToken)
        assert(false, "missing direct bridge token should block audio ingress")
    } catch {
        assert(true, "missing direct bridge token should fail")
    }
}

private func testBuildsRelayCallAudioChunkUploadRequest() throws {
    let request = try buildRelayCallAudioChunkUploadRequest(
        config: BridgeConfig(
            baseURL: "http://192.168.1.22:18921",
            token: "ahb_test_123"
        ),
        callId: "call_voice_1",
        chunk: RelayCallAudioChunk(
            audioBase64: Data([0x01, 0x02, 0x03]).base64EncodedString(),
            mimeType: "audio/pcm",
            sequence: 3,
            sampleRateHz: 16000,
            channels: 1,
            durationMs: 120
        )
    )

    assert(request.httpMethod == "POST", "audio chunk upload should use POST")
    assert(request.url?.absoluteString == "http://192.168.1.22:18921/calls/call_voice_1/audio-chunks", "audio chunk upload should target the direct bridge call ingress endpoint")
    assert(request.value(forHTTPHeaderField: "Authorization") == "Bearer ahb_test_123", "audio chunk upload should forward bearer auth")
    assert(request.value(forHTTPHeaderField: "Content-Type") == "application/json", "audio chunk upload should use JSON")

    let body = try JSONSerialization.jsonObject(
        with: request.httpBody ?? Data()
    ) as? [String: Any]
    assert(body?["audioBase64"] as? String == Data([0x01, 0x02, 0x03]).base64EncodedString(), "audio chunk upload should include base64 payload")
    assert(body?["mimeType"] as? String == "audio/pcm", "audio chunk upload should include mime type")
    assert(body?["sequence"] as? Int == 3, "audio chunk upload should include sequence")
    assert(body?["sampleRateHz"] as? Int == 16000, "audio chunk upload should include sample rate")
    assert(body?["channels"] as? Int == 1, "audio chunk upload should include channel count")
    assert(body?["durationMs"] as? Int == 120, "audio chunk upload should include chunk duration")
}

private func testBuildsNonSilentCallConnectedCuePCM() {
    let cue = makeCallConnectedCuePCM16Mono(
        sampleRateHz: 24_000,
        durationMs: 160,
        frequencyHz: 1_120
    )

    assert(cue.count == 24_000 * 160 / 1000 * MemoryLayout<Int16>.size, "connected cue should generate the expected pcm length")
    assert(cue.contains(where: { $0 != 0 }), "connected cue should contain audible waveform samples")
}

private func testCallConnectedAnnouncementTextUsesStableProductCopy() {
    assert(
        callConnectedAnnouncementText() == "已连接，请开始说话",
        "connected announcement should stay stable so the first-call confirmation copy is predictable"
    )
}

private func testResamplesPCM16MonoFrom48kTo24k() {
    let samples: [Int16] = [0, 1000, -1000, 2000, -2000, 3000, -3000, 4000]
    let input = samples.withUnsafeBufferPointer { Data(buffer: $0) }
    let output = resamplePCM16Mono(
        audioData: input,
        fromSampleRateHz: 48_000,
        toSampleRateHz: 24_000
    )

    assert(
        output.count == 4 * MemoryLayout<Int16>.size,
        "48k mono pcm should downsample to half as many samples at 24k"
    )
    assert(
        output != input,
        "resampling should not return the original 48k payload when target rate changes"
    )
}

private func testPlaybackEdgeFadeSoftensChunkBoundaries() {
    let samples: [Int16] = [12_000, 12_000, 12_000, 12_000, 12_000, 12_000]
    let input = samples.withUnsafeBufferPointer { Data(buffer: $0) }
    let faded = applyPCM16MonoEdgeFade(audioData: input, fadeFrameCount: 2)
    let outputSamples: [Int16] = faded.withUnsafeBytes { rawBuffer in
        Array(rawBuffer.bindMemory(to: Int16.self))
    }

    assert(
        outputSamples.first == 0,
        "edge fade should ramp the first sample down to avoid chunk-start pops"
    )
    assert(
        outputSamples.last == 0,
        "edge fade should ramp the last sample down to avoid chunk-end pops"
    )
    assert(
        outputSamples[2] != 0 && outputSamples[3] != 0,
        "edge fade should preserve the middle of the chunk so speech stays audible"
    )
}

private func testInfersPCM16MonoDurationFromAudioPayload() {
    let samples = Array(repeating: Int16(512), count: 2_400)
    let payload = samples.withUnsafeBufferPointer { Data(buffer: $0) }
    let durationMs = inferredPCM16MonoDurationMs(
        audioData: payload,
        sampleRateHz: 24_000,
        channels: 1
    )

    assert(
        durationMs == 100,
        "24k mono pcm payloads should infer duration from frame count"
    )
}

private func testVoiceUploadSuppressionHelpersGatePlaybackEchoWindows() {
    let now = Date(timeIntervalSince1970: 100)
    let firstWindow = voiceUploadSuppressionWindow(
        now: now,
        queuedPlaybackEndsAt: nil,
        playbackDurationMs: 600,
        safetyPaddingMs: 200
    )

    assert(
        !shouldUploadVoiceInput(
            now: now.addingTimeInterval(0.4),
            suppressUntil: firstWindow.suppressUntil
        ),
        "microphone uploads should stay muted while assistant playback is still active"
    )
    assert(
        shouldUploadVoiceInput(
            now: now.addingTimeInterval(0.9),
            suppressUntil: firstWindow.suppressUntil
        ),
        "microphone uploads should resume after the playback cooldown expires"
    )

    let queuedWindow = voiceUploadSuppressionWindow(
        now: now.addingTimeInterval(0.2),
        queuedPlaybackEndsAt: firstWindow.playbackEndsAt,
        playbackDurationMs: 300,
        safetyPaddingMs: 120
    )
    assert(
        queuedWindow.playbackEndsAt == now.addingTimeInterval(0.9),
        "back-to-back assistant chunks should extend playback coverage by their queued duration"
    )
    assert(
        queuedWindow.suppressUntil == now.addingTimeInterval(1.02),
        "microphone suppression should cover the entire queued playback window plus padding"
    )
}

private func testNormalizedPCM16MonoRMSDistinguishesSilenceFromSpeechLikeAudio() {
    let silence = Data(repeating: 0, count: 2_400 * MemoryLayout<Int16>.size)
    let tone = makeCallConnectedCuePCM16Mono(
        sampleRateHz: 24_000,
        durationMs: 160,
        frequencyHz: 1_120
    )

    assert(
        normalizedPCM16MonoRMS(audioData: silence) == 0,
        "pure silence should have zero rms"
    )
    assert(
        normalizedPCM16MonoRMS(audioData: tone) > 0.01,
        "speech-like pcm should produce a measurable rms level"
    )
}

private func testDuplexCoordinatorInvalidatesStaleUploadRevisions() async {
    let coordinator = RelayCallDuplexCoordinator(callId: "call_voice_1")

    let initialRevision = await coordinator.currentUploadRevision()
    let initialIsCurrent = await coordinator.isUploadRevisionCurrent(initialRevision)
    assert(
        initialIsCurrent,
        "fresh upload revisions should start valid"
    )

    await coordinator.suppressMicrophoneCapture(
        playbackDurationMs: 320,
        reason: "assistant-playback"
    )

    let initialIsStillCurrent = await coordinator.isUploadRevisionCurrent(initialRevision)
    assert(
        !initialIsStillCurrent,
        "starting assistant playback should invalidate previously queued upload revisions"
    )

    let currentRevision = await coordinator.currentUploadRevision()
    let currentIsCurrent = await coordinator.isUploadRevisionCurrent(currentRevision)
    assert(
        currentIsCurrent,
        "new uploads should use the latest duplex revision after suppression starts"
    )
}

private func testSpeechActivityGateRequiresVoiceEnergyBeforeTransmit() async {
    let gate = RelayCallSpeechActivityGate(
        callId: "call_voice_1",
        activationThreshold: 0.013,
        holdDurationMs: 400
    )
    let silence = Data(repeating: 0, count: 2_400 * MemoryLayout<Int16>.size)
    let tone = makeCallConnectedCuePCM16Mono(
        sampleRateHz: 24_000,
        durationMs: 160,
        frequencyHz: 1_120
    )

    let start = Date(timeIntervalSince1970: 100)
    let firstSilentResult = await gate.shouldTransmit(audioData: silence, now: start)
    assert(
        !firstSilentResult,
        "the speech gate should keep silent chunks out of the upload path"
    )

    let detectedVoice = await gate.shouldTransmit(audioData: tone, now: start.addingTimeInterval(0.1))
    assert(
        detectedVoice,
        "speech-like chunks should open the upload gate"
    )

    let heldAfterVoice = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(0.3))
    assert(
        heldAfterVoice,
        "the gate should keep a short hold window after speech so utterances do not get chopped"
    )

    let idleAfterHold = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(1.0))
    assert(
        !idleAfterHold,
        "once the hold window expires, silent chunks should be dropped again"
    )
}

private func testSpeechActivityGateAllowsModerateSpeechLevels() async {
    let gate = RelayCallSpeechActivityGate(callId: "call_voice_1")
    let moderateSamples = Array(repeating: Int16(260), count: 2_400)
    let moderateSpeech = moderateSamples.withUnsafeBufferPointer { Data(buffer: $0) }

    let shouldTransmit = await gate.shouldTransmit(
        audioData: moderateSpeech,
        now: Date(timeIntervalSince1970: 200)
    )

    assert(
        shouldTransmit,
        "the speech gate should allow ordinary voice levels instead of requiring near-shout energy"
    )
}

private func testSpeechActivityGateCanFlushShortSilenceTailAfterSpeech() async {
    let gate = RelayCallSpeechActivityGate(
        callId: "call_voice_1",
        activationThreshold: 0.013,
        holdDurationMs: 400,
        idleFlushChunkCount: 3
    )
    let silence = Data(repeating: 0, count: 2_400 * MemoryLayout<Int16>.size)
    let tone = makeCallConnectedCuePCM16Mono(
        sampleRateHz: 24_000,
        durationMs: 160,
        frequencyHz: 1_120
    )
    let start = Date(timeIntervalSince1970: 250)

    let detectedVoice = await gate.shouldTransmit(audioData: tone, now: start)
    assert(
        detectedVoice,
        "speech-like chunks should still open the gate before the silence tail logic runs"
    )

    let firstTailChunk = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(1.0))
    let secondTailChunk = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(1.1))
    let thirdTailChunk = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(1.2))
    let droppedAfterTail = await gate.shouldTransmit(audioData: silence, now: start.addingTimeInterval(1.4))

    assert(
        firstTailChunk,
        "the first post-speech silent chunk should still be forwarded so the provider can detect end-of-turn"
    )
    assert(
        secondTailChunk,
        "the silence tail should be long enough to cover a short provider VAD window"
    )
    assert(
        thirdTailChunk,
        "the configured silence tail length should be honored"
    )
    assert(
        !droppedAfterTail,
        "once the bounded silence tail is exhausted, later silent chunks should stop uploading again"
    )
}

private func testSilentChunksDoNotReachVoiceUploadPath() async {
    let gate = RelayCallSpeechActivityGate(
        callId: "call_voice_1",
        activationThreshold: 0.013,
        holdDurationMs: 400
    )
    let silence = Data(repeating: 0, count: 2_400 * MemoryLayout<Int16>.size)
    let start = Date(timeIntervalSince1970: 300)

    let shouldUploadSilence = await shouldUploadRelayCallInputChunk(
        audioData: silence,
        speechActivityGate: gate,
        now: start
    )
    assert(
        !shouldUploadSilence,
        "silent chunks should be dropped before they enter the upload path"
    )

    let tone = makeCallConnectedCuePCM16Mono(
        sampleRateHz: 24_000,
        durationMs: 160,
        frequencyHz: 1_120
    )
    let shouldUploadSpeech = await shouldUploadRelayCallInputChunk(
        audioData: tone,
        speechActivityGate: gate,
        now: start.addingTimeInterval(0.1)
    )
    assert(
        shouldUploadSpeech,
        "speech-like chunks should still reach the upload path"
    )

    let shouldUploadIdleSilence = await shouldUploadRelayCallInputChunk(
        audioData: silence,
        speechActivityGate: gate,
        now: start.addingTimeInterval(1.0)
    )
    assert(
        !shouldUploadIdleSilence,
        "once the hold window expires, silence should stay out of the upload path"
    )
}

private func testVoicePermissionHelpersUseExpectedStates() {
    assert(
        voiceMicrophonePermissionStateDebugName(.granted) == "granted",
        "debug name should describe granted permission state"
    )
    assert(
        voiceMicrophonePermissionStateDebugName(.needsRequest) == "needsRequest",
        "debug name should describe undetermined permission state"
    )
    assert(
        voiceMicrophonePermissionStateDebugName(.denied) == "denied",
        "debug name should describe denied permission state"
    )
    assert(
        shouldAutoRequestVoiceMicrophonePermission(for: .needsRequest),
        "undetermined permission should trigger an automatic one-time request on startup"
    )
    assert(
        !shouldAutoRequestVoiceMicrophonePermission(for: .granted),
        "granted permission should not trigger another startup request"
    )
    assert(
        !shouldAutoRequestVoiceMicrophonePermission(for: .denied),
        "denied permission should route to the settings prompt instead of re-requesting"
    )
}

private func testVoiceDebugConsoleLineUsesStablePrefix() {
    let line = voiceDebugConsoleLine("chatstore:init")
    assert(
        line == "LOBSTER_VOICE_DEBUG chatstore:init",
        "voice debug console lines should keep a stable searchable prefix for Xcode console filtering"
    )
}

private func testBridgeConfigStorePersistsVoiceDiagnosticsPreference() {
    let suiteName = "relay-models-tests.voice-diagnostics"
    let defaults = UserDefaults(suiteName: suiteName)!
    defaults.removePersistentDomain(forName: suiteName)

    let store = BridgeConfigStore(
        userDefaults: defaults,
        key: "relay-models-tests.bridge-config"
    )

    var config = MobileConnectionConfig.default
    config.voiceDiagnostics.enabled = true
    config.directBridge = BridgeConfig(
        baseURL: "http://192.168.3.80:18921",
        token: "ahb_test_123"
    )

    store.save(config)
    let loaded = store.load()

    assert(
        loaded.voiceDiagnostics.enabled,
        "bridge config storage should persist the voice diagnostics toggle"
    )
    assert(
        loaded.directBridge.token == "ahb_test_123",
        "bridge config storage should preserve the direct bridge token while persisting diagnostics"
    )
}

private func testBuildsRelayCallAudioChunkUploadRequestWithVoiceDiagnosticsHeader() throws {
    let request = try buildRelayCallAudioChunkUploadRequest(
        config: BridgeConfig(
            baseURL: "http://192.168.3.80:18921",
            token: "ahb_test_123"
        ),
        callId: "call_voice_1",
        chunk: RelayCallAudioChunk(
            audioBase64: Data([0, 1, 2, 3]).base64EncodedString(),
            mimeType: "audio/pcm",
            sequence: 7,
            sampleRateHz: 24_000,
            channels: 1,
            durationMs: 80
        ),
        diagnosticsEnabled: true
    )

    assert(
        request.value(forHTTPHeaderField: "X-AgentHub-Voice-Diagnostics") == "1",
        "voice chunk upload requests should opt into bridge diagnostics when the toggle is enabled"
    )
}

private func testBuildsRelayCallRealtimeRequest() throws {
    let request = try buildRelayCallRealtimeRequest(
        config: BridgeConfig(
            baseURL: "http://192.168.3.80:18921",
            token: "ahb_test_123"
        ),
        callId: "call_voice_1",
        diagnosticsEnabled: true
    )

    assert(
        request.url?.absoluteString == "ws://192.168.3.80:18921/calls/call_voice_1/realtime",
        "realtime voice request should upgrade the direct bridge URL to a websocket path"
    )
    assert(
        request.value(forHTTPHeaderField: "Authorization") == "Bearer ahb_test_123",
        "realtime voice request should keep the bearer token"
    )
    assert(
        request.value(forHTTPHeaderField: "X-AgentHub-Voice-Diagnostics") == "1",
        "realtime voice request should forward the diagnostics header"
    )
}

private func testEncodesRelayCallRealtimeAudioInputMessage() throws {
    let data = try encodeRelayCallRealtimeAudioInputMessage(
        chunk: RelayCallAudioChunk(
            audioBase64: Data([0, 1, 2, 3]).base64EncodedString(),
            mimeType: "audio/pcm",
            sequence: 7,
            sampleRateHz: 24_000,
            channels: 1,
            durationMs: 80
        )
    )

    let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let chunk = decoded?["chunk"] as? [String: Any]

    assert(decoded?["type"] as? String == "audio.input", "realtime input frame should use the audio.input message type")
    assert(chunk?["audioBase64"] as? String == Data([0, 1, 2, 3]).base64EncodedString(), "realtime input frame should include the encoded audio payload")
    assert(chunk?["sequence"] as? Int == 7, "realtime input frame should keep the chunk sequence")
}

private func testDecodesRelayCallRealtimeServerMessages() throws {
    let sessionStateJSON = """
    {
      "type": "session.state",
      "session": {
        "callId": "call_voice_1",
        "status": "streaming",
        "providerId": "volcengine",
        "modelId": "O",
        "ready": true,
        "missing": [],
        "hasAppId": true,
        "hasToken": true,
        "hasResourceId": true,
        "startedAt": "2026-04-05T02:10:00.000Z",
        "lastChunkAt": "2026-04-05T02:10:01.000Z",
        "endedAt": null,
        "receivedChunks": 12,
        "receivedBytes": 16000,
        "sampleRateHz": 24000,
        "channels": 1
      }
    }
    """

    let outputJSON = """
    {
      "type": "audio.output",
      "chunk": {
        "sequence": 3,
        "audioBase64": "AQIDBA==",
        "mimeType": "audio/pcm",
        "sampleRateHz": 24000,
        "channels": 1,
        "durationMs": 80
      }
    }
    """

    let interactionJSON = """
    {
      "type": "assistant.final",
      "interaction": {
        "callId": "call_voice_1",
        "kind": "assistant_final",
        "text": "好的，我已经记下来了。",
        "providerId": "volcengine",
        "modelId": "O"
      }
    }
    """

    let sessionState = try decodeRelayCallRealtimeInboundMessage(from: Data(sessionStateJSON.utf8))
    let output = try decodeRelayCallRealtimeInboundMessage(from: Data(outputJSON.utf8))
    let interaction = try decodeRelayCallRealtimeInboundMessage(from: Data(interactionJSON.utf8))

    assert(sessionState == .sessionState(
        RelayCallVoiceSessionStatus(
            callId: "call_voice_1",
            status: "streaming",
            providerId: "volcengine",
            modelId: "O",
            ready: true,
            missing: [],
            hasAppId: true,
            hasToken: true,
            hasResourceId: true,
            startedAt: "2026-04-05T02:10:00.000Z",
            lastChunkAt: "2026-04-05T02:10:01.000Z",
            endedAt: nil,
            receivedChunks: 12,
            receivedBytes: 16000,
            sampleRateHz: 24000,
            channels: 1
        )
    ), "realtime decoder should parse session.state frames")

    assert(output == .audioOutput(
        RelayCallOutputAudioChunk(
            sequence: 3,
            audioBase64: "AQIDBA==",
            mimeType: "audio/pcm",
            sampleRateHz: 24000,
            channels: 1,
            durationMs: 80
        )
    ), "realtime decoder should parse audio.output frames")

    assert(interaction == .assistantFinal(
        RelayCallRealtimeInteraction(
            callId: "call_voice_1",
            kind: "assistant_final",
            text: "好的，我已经记下来了。",
            providerId: "volcengine",
            modelId: "O"
        )
    ), "realtime decoder should parse assistant.final frames")
}

private func testDetectsLikelyLocalNetworkHosts() {
    assert(isLikelyLocalNetworkHost("192.168.3.80"), "192.168.* should count as local network")
    assert(isLikelyLocalNetworkHost("10.0.0.12"), "10.* should count as local network")
    assert(isLikelyLocalNetworkHost("172.16.0.5"), "172.16/12 should count as local network")
    assert(isLikelyLocalNetworkHost("172.31.255.1"), "172.31/12 should count as local network")
    assert(isLikelyLocalNetworkHost("169.254.10.2"), "link-local hosts should count as local network")
    assert(isLikelyLocalNetworkHost("localhost"), "localhost should count as local network")
    assert(!isLikelyLocalNetworkHost("8.8.8.8"), "public IPs should not count as local network")
    assert(!isLikelyLocalNetworkHost("api.openai.com"), "public hostnames should not count as local network")
}

private func testMapsLocalBridgeOfflineErrorToLocalNetworkGuidance() {
    let error = mapTransportError(
        URLError(.notConnectedToInternet),
        serviceName: "Voice bridge",
        requestURL: URL(string: "http://192.168.3.80:18921/calls/test/voice-session")
    )

    assert(
        error.errorDescription == "当前无法访问这台 Mac 的本地语音桥。请确认 iPhone 与 Mac 在同一 Wi-Fi，并在系统设置里允许本地网络访问。",
        "local bridge transport failures should point users at same-LAN and local network permissions"
    )
}

@main
struct RelayModelsTestsRunner {
    static func main() async throws {
        try testParsesDesktopPairingURL()
        try testParsesCustomSchemePairingURL()
        try testParsesPairingURLWithDirectBridgeFallback()
        try testClaimResponseDecodesDirectBridgeFallback()
        testOnlyFallsBackToDirectBridgeForRelayTransportFailures()
        testSelectsFirstHostAndSessionAfterRefresh()
    try testDecodesHostWithActiveAudioCall()
    testCallMediaConfigPrefersExplicitOverride()
    try testRelayCallAudioOutputRequestUsesSequenceCursor()
    try testDecodesRelayCallAudioOutputEnvelope()
    try testRelayCallStateOnlyAllowsKnownValues()
        testWorkspaceUpdatesActiveCallForSelectedHost()
        testWorkspaceClearsEndedActiveCall()
        testCallConnectedCueOnlyTriggersOnTransitionIntoLive()
        testMergesRelayTurnMessagesWithoutDuplicates()
        testMergeRelayTurnReplacesInProgressAssistantPreview()
        testFormatsRelayMessageTimestampWithoutMilliseconds()
        testHidesUserSenderLabelButKeepsAssistantLabel()
        testDetectsMarkdownPreview()
        testDetectsHTMLPreview()
        testOptimisticPendingMessageAppearsInVisibleTimeline()
        testComposerUsesCompactLayoutMetrics()
        testChatChromeUsesReadableContrastMetrics()
        testFocusedComposerCanDismissFromBackgroundTap()
        testConnectionProgressStagesUseFriendlyProductCopy()
        testConnectionAttemptGateInvalidatesOlderAttempts()
        testRelayTransportUsesBoundedTimeout()
        testRelayTransportRetriesTransientTimeouts()
        testRelayCallAudioIngressRequiresDirectBridgeConfig()
        try testBuildsRelayCallAudioChunkUploadRequest()
        testBuildsNonSilentCallConnectedCuePCM()
        testCallConnectedAnnouncementTextUsesStableProductCopy()
        testResamplesPCM16MonoFrom48kTo24k()
        testPlaybackEdgeFadeSoftensChunkBoundaries()
        testInfersPCM16MonoDurationFromAudioPayload()
        testVoiceUploadSuppressionHelpersGatePlaybackEchoWindows()
        testNormalizedPCM16MonoRMSDistinguishesSilenceFromSpeechLikeAudio()
        await testDuplexCoordinatorInvalidatesStaleUploadRevisions()
        await testSpeechActivityGateRequiresVoiceEnergyBeforeTransmit()
        await testSpeechActivityGateAllowsModerateSpeechLevels()
        await testSpeechActivityGateCanFlushShortSilenceTailAfterSpeech()
        await testSilentChunksDoNotReachVoiceUploadPath()
        testVoicePermissionHelpersUseExpectedStates()
        testVoiceDebugConsoleLineUsesStablePrefix()
        testBridgeConfigStorePersistsVoiceDiagnosticsPreference()
        try testBuildsRelayCallAudioChunkUploadRequestWithVoiceDiagnosticsHeader()
        try testBuildsRelayCallRealtimeRequest()
        try testEncodesRelayCallRealtimeAudioInputMessage()
        try testDecodesRelayCallRealtimeServerMessages()
        testDetectsLikelyLocalNetworkHosts()
        testMapsLocalBridgeOfflineErrorToLocalNetworkGuidance()
        print("RelayModelsTests passed")
    }
}
