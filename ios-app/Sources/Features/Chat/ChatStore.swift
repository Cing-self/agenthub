import Foundation
import Combine

@MainActor
final class ChatStore {
    enum MicrophonePermissionPrompt: Equatable {
        case needsRequest
        case denied

        var title: String {
            switch self {
            case .needsRequest:
                return "语音通话需要麦克风"
            case .denied:
                return "麦克风权限未开启"
            }
        }

        var message: String {
            switch self {
            case .needsRequest:
                return "先授权麦克风，手机才能把你的语音实时发给桌面端 Host。"
            case .denied:
                return "AgentHub 现在没有麦克风权限。点一下跳到系统设置，打开后再回来拨号。"
            }
        }

        var actionTitle: String {
            switch self {
            case .needsRequest:
                return "启用麦克风"
            case .denied:
                return "打开设置"
            }
        }
    }

    struct PendingDirectMessage: Equatable {
        let bucketId: String
        let message: BridgeMessage
    }

    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
    }

    @Published var connectionConfig: MobileConnectionConfig
    @Published var relayWorkspace: RelayWorkspaceState?
    @Published var connectionState: ConnectionState = .disconnected
    @Published var connectionStage: ConnectionProgressStage?
    @Published var threads: [ThreadSummary] = []
    @Published var selectedThread: ThreadEnvelope?
    @Published var selectedThreadID: String?
    @Published var relayMessagesBySession: [String: [BridgeMessage]] = [:]
    @Published var activeRelayTurnsBySession: [String: RelayTurn] = [:]
    @Published var pendingDirectMessage: PendingDirectMessage?
    @Published var pendingRelayMessagesBySession: [String: BridgeMessage] = [:]
    @Published var draft = ""
    @Published var isSending = false
    @Published var isShowingHistory = false
    @Published var isShowingConnectionSheet = false
    @Published var microphonePermissionPrompt: MicrophonePermissionPrompt?

    private let configStore = BridgeConfigStore()
    private let relayCallAudioStreamer: RelayCallAudioStreaming
    private let callConnectedCuePlayer: CallConnectedCuePlaying
    private let debugAutoRelayMessageKey = "lobster-mobile.debug-auto-relay-message"
    private let draftThreadBucketId = "__draft__"
    private var connectionAttemptGate = ConnectionAttemptGate()
    private var relayCallWatchTask: Task<Void, Never>?
    private var activeRelayAudioCallId: String?

    init(
        relayCallAudioStreamer: RelayCallAudioStreaming = LiveRelayCallAudioStreamer(),
        callConnectedCuePlayer: CallConnectedCuePlaying = LiveCallConnectedCuePlayer()
    ) {
        self.relayCallAudioStreamer = relayCallAudioStreamer
        self.callConnectedCuePlayer = callConnectedCuePlayer
        let storedConfig = configStore.load()
        storeVoiceDiagnosticsEnabled(storedConfig.voiceDiagnostics.enabled)
        self.connectionConfig = storedConfig
        if let relay = storedConfig.relay {
            self.relayWorkspace = RelayWorkspaceState(
                relayBaseURL: relay.relayBaseURL,
                clientId: relay.clientId,
                selectedHostId: relay.selectedHostId,
                selectedSessionId: relay.selectedSessionId
            )
        } else {
            self.relayWorkspace = nil
        }

        self.isShowingConnectionSheet = storedConfig.relay == nil && storedConfig.directBridge.token.isEmpty
        self.microphonePermissionPrompt = ChatStore.permissionPrompt(for: currentVoiceMicrophonePermissionState())
        appendVoiceDebugLog(
            "chatstore:init voice-permission=\(voiceMicrophonePermissionStateDebugName(currentVoiceMicrophonePermissionState()))"
        )
    }

    var isRelayMode: Bool {
        connectionConfig.preferredMode == .relay && relayWorkspace != nil
    }

    var selectedHost: RelayHost? {
        relayWorkspace?.selectedHost
    }

    var relayHosts: [RelayHost] {
        relayWorkspace?.hosts ?? []
    }

    var relaySessions: [RelaySession] {
        relayWorkspace?.sessions ?? []
    }

    var selectedRelaySession: RelaySession? {
        relayWorkspace?.selectedSession
    }

    var currentRelayCall: RelayCallSummary? {
        relayWorkspace?.selectedHost?.activeCall
    }

    var selectedRelayMessages: [BridgeMessage] {
        guard let sessionId = relayWorkspace?.selectedSessionId else {
            return []
        }
        return mergeVisibleMessages(
            existing: relayMessagesBySession[sessionId] ?? [],
            pending: pendingRelayMessagesBySession[sessionId]
        )
    }

    var selectedRelayHasAssistantPreview: Bool {
        guard let sessionId = relayWorkspace?.selectedSessionId else {
            return false
        }
        return activeRelayTurnsBySession[sessionId]?.assistantMessage != nil
    }

    var selectedDirectMessages: [BridgeMessage] {
        mergeVisibleMessages(
            existing: selectedThread?.messages ?? [],
            pending: pendingDirectMessage?.bucketId == currentDirectBucketId ? pendingDirectMessage?.message : nil
        )
    }

    func connect() async {
        refreshMicrophonePermissionPrompt()
        switch connectionConfig.preferredMode {
        case .relay:
            await connectRelay()
        case .direct:
            await connectDirect()
        }
    }

    func refreshMicrophonePermissionPrompt() {
        let state = currentVoiceMicrophonePermissionState()
        appendVoiceDebugLog("chatstore:refresh-voice-permission state=\(voiceMicrophonePermissionStateDebugName(state))")
        microphonePermissionPrompt = ChatStore.permissionPrompt(for: state)
    }

    func primeMicrophonePermissionPromptIfNeeded() async {
        let state = currentVoiceMicrophonePermissionState()
        appendVoiceDebugLog("chatstore:prime-voice-permission state=\(voiceMicrophonePermissionStateDebugName(state))")
        guard shouldAutoRequestVoiceMicrophonePermission(for: state) else {
            microphonePermissionPrompt = ChatStore.permissionPrompt(for: state)
            return
        }

        let resolved = await requestVoiceMicrophonePermission()
        appendVoiceDebugLog("chatstore:prime-voice-permission resolved=\(voiceMicrophonePermissionStateDebugName(resolved))")
        microphonePermissionPrompt = ChatStore.permissionPrompt(for: resolved)
    }

    func resolveMicrophonePermissionPromptAction() async {
        switch microphonePermissionPrompt {
        case .needsRequest:
            let state = await requestVoiceMicrophonePermission()
            microphonePermissionPrompt = ChatStore.permissionPrompt(for: state)
            if state == .denied {
                connectionState = .failed("请在 iPhone 设置里允许 AgentHub 使用麦克风。")
            }
        case .denied:
            openVoiceMicrophoneSettings()
        case .none:
            break
        }
    }

    func connectDirect() async {
        guard !connectionConfig.directBridge.token.isEmpty else {
            connectionState = .failed("请先填写 Direct Bridge 的地址和 Token。")
            isShowingConnectionSheet = true
            return
        }

        let attempt = beginConnection(stage: .checkingDirectHealth)

        do {
            _ = try await directClient.health()
            guard connectionAttemptGate.isCurrent(attempt) else {
                return
            }
            persistConnectionConfig(preferredMode: .direct)
            connectionStage = nil
            connectionState = .connected
            isShowingConnectionSheet = false
            try await refreshThreads()
        } catch {
            guard connectionAttemptGate.isCurrent(attempt) else {
                return
            }
            connectionStage = nil
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func completePairing(from input: String) async {
        let attempt = beginConnection(stage: .claimingPairing)

        do {
            let payload = try RelayPairingPayload.parse(from: input)
            stageDirectBridgeFallback(from: payload)
            let clientId = connectionConfig.relay?.clientId ?? "ios-\(UUID().uuidString.lowercased())"
            let claimedAt = ISO8601DateFormatter().string(from: Date())
            let client = RelayClient(relayBaseURL: payload.relayBaseURL)

            let pairing = try await client.claimInvite(
                code: payload.code,
                clientId: clientId,
                claimedAt: claimedAt
            )
            stageDirectBridgeFallback(from: pairing)
            guard connectionAttemptGate.isCurrent(attempt) else {
                return
            }

            relayWorkspace = RelayWorkspaceState(
                relayBaseURL: payload.relayBaseURL,
                clientId: clientId,
                selectedHostId: payload.hostId
            )

            persistConnectionConfig(preferredMode: .relay)
            await connectRelay(preferredHostId: payload.hostId, attempt: attempt)
        } catch {
            guard connectionAttemptGate.isCurrent(attempt) else {
                return
            }
            if await attemptDirectBridgeFallback(after: error) {
                return
            }
            connectionStage = nil
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func handleIncomingPairingURL(_ url: URL) async {
        isShowingConnectionSheet = false
        await completePairing(from: url.absoluteString)
    }

    func connectRelay(preferredHostId: String? = nil, attempt: Int? = nil) async {
        guard var workspace = relayWorkspace else {
            connectionState = .failed("请先完成配对。")
            isShowingConnectionSheet = true
            return
        }

        let activeAttempt = attempt ?? beginConnection(stage: .loadingHosts)
        connectionStage = .loadingHosts

        do {
            let client = RelayClient(relayBaseURL: workspace.relayBaseURL)
            let hosts = try await client.listHosts(clientId: workspace.clientId)
            guard connectionAttemptGate.isCurrent(activeAttempt) else {
                return
            }
            workspace.applyHosts(hosts)

            if let preferredHostId {
                workspace.selectHost(preferredHostId)
            }

            guard !hosts.isEmpty else {
                throw BridgeClientError.server("配对已完成，但暂时没拿到这台 Mac 的主机列表。请确认桌面端 Remote Mode 正在运行后再重试。")
            }

            if let hostId = workspace.selectedHostId {
                connectionStage = .loadingSessions
                let sessions = try await client.listSessions(hostId: hostId)
                guard connectionAttemptGate.isCurrent(activeAttempt) else {
                    return
                }
                workspace.applySessions(sessions, for: hostId)
            }

            guard connectionAttemptGate.isCurrent(activeAttempt) else {
                return
            }
            relayWorkspace = workspace
            persistConnectionConfig(preferredMode: .relay)
            connectionStage = nil
            connectionState = .connected
            isShowingConnectionSheet = false

            if let existingCall = workspace.selectedHost?.activeCall {
                watchRelayCall(existingCall)
            }

            if
                let autoMessage = consumeDebugAutoRelayMessage(),
                let sessionId = workspace.selectedSessionId,
                (relayMessagesBySession[sessionId] ?? []).isEmpty
            {
                draft = autoMessage
                await sendCurrentDraft()
            }
        } catch {
            guard connectionAttemptGate.isCurrent(activeAttempt) else {
                return
            }
            if await attemptDirectBridgeFallback(after: error) {
                return
            }
            connectionStage = nil
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func selectRelayHost(_ hostId: String) async {
        guard var workspace = relayWorkspace else {
            return
        }

        relayCallWatchTask?.cancel()
        relayCallWatchTask = nil
        await stopRelayCallAudioStreaming()
        workspace.selectHost(hostId)
        relayWorkspace = workspace
        persistConnectionConfig(preferredMode: .relay)

        guard let selectedHostId = relayWorkspace?.selectedHostId else {
            return
        }

        do {
            let sessions = try await RelayClient(relayBaseURL: workspace.relayBaseURL)
                .listSessions(hostId: selectedHostId)
            workspace.applySessions(sessions, for: selectedHostId)
            relayWorkspace = workspace
            persistConnectionConfig(preferredMode: .relay)
            if let existingCall = workspace.selectedHost?.activeCall {
                watchRelayCall(existingCall)
            }
        } catch {
            connectionState = .failed(error.localizedDescription)
        }
    }

    func selectRelaySession(_ sessionId: String) {
        guard var workspace = relayWorkspace else {
            return
        }
        workspace.selectSession(sessionId)
        relayWorkspace = workspace
        persistConnectionConfig(preferredMode: .relay)
    }

    func startRelayAudioCall() async {
        guard let workspace = relayWorkspace else {
            return
        }
        refreshMicrophonePermissionPrompt()
        guard await prepareMicrophonePermissionForVoiceCall() else {
            return
        }
        appendVoiceDebugLog("chatstore:start-call requested selectedHost=\(workspace.selectedHostId ?? "nil") selectedSession=\(workspace.selectedSessionId ?? "nil")")
        guard currentRelayCall == nil else {
            appendVoiceDebugLog("chatstore:start-call skipped reason=existing-call")
            return
        }
        guard let hostId = workspace.selectedHostId, let sessionId = workspace.selectedSessionId else {
            connectionState = .failed("请先选择一台 Host 和一个会话。")
            appendVoiceDebugLog("chatstore:start-call failed reason=missing-selection")
            return
        }

        do {
            let call = try await CallClient(relayBaseURL: workspace.relayBaseURL).createCall(
                callId: "call_\(UUID().uuidString.lowercased())",
                clientId: workspace.clientId,
                hostId: hostId,
                sessionId: sessionId,
                mode: .audio,
                createdAt: ISO8601DateFormatter().string(from: Date())
            )
            applyRelayCall(call)
            watchRelayCall(call)
        } catch {
            appendVoiceDebugLog("chatstore:start-call error=\(error.localizedDescription)")
            connectionState = .failed(error.localizedDescription)
        }
    }

    func endCurrentRelayCall() async {
        guard let workspace = relayWorkspace, let call = currentRelayCall else {
            return
        }

        do {
            let ended = try await CallClient(relayBaseURL: workspace.relayBaseURL).endCall(
                clientId: workspace.clientId,
                callId: call.callId,
                updatedAt: ISO8601DateFormatter().string(from: Date())
            )
            applyRelayCall(ended)
            if ended.state == .ended || ended.state == .failed {
                relayCallWatchTask?.cancel()
                relayCallWatchTask = nil
                await stopRelayCallAudioStreaming()
            }
        } catch {
            connectionState = .failed(error.localizedDescription)
        }
    }

    func refreshThreads() async throws {
        let loadedThreads = try await directClient.listThreads()
        threads = loadedThreads

        if let selectedThreadID,
           loadedThreads.contains(where: { $0.id == selectedThreadID }) {
            try await loadThread(id: selectedThreadID)
            return
        }

        if let first = loadedThreads.first {
            try await loadThread(id: first.id)
            return
        }

        selectedThreadID = nil
        selectedThread = nil
    }

    func loadThread(id: String) async throws {
        let detail = try await directClient.threadDetail(id: id)
        selectedThreadID = id
        selectedThread = detail
        isShowingHistory = false
    }

    func startNewConversation() {
        guard !isRelayMode else {
            return
        }

        selectedThreadID = nil
        selectedThread = nil
        draft = ""
        isShowingHistory = false
    }

    func sendCurrentDraft() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else {
            return
        }

        let originalDraft = draft
        isSending = true
        defer { isSending = false }

        do {
            if isRelayMode {
                try await sendRelayTurn(message: text)
                return
            }

            let directBucketId = currentDirectBucketId
            pendingDirectMessage = PendingDirectMessage(
                bucketId: directBucketId,
                message: BridgeMessage.optimisticUserMessage(content: text)
            )
            draft = ""

            let result = try await directClient.sendTurn(threadId: selectedThreadID, message: text)
            try await refreshThreads()
            try await loadThread(id: result.threadId)
            pendingDirectMessage = nil
        } catch {
            draft = originalDraft
            pendingDirectMessage = nil
            connectionState = .failed(error.localizedDescription)
        }
    }

    func applyDirectConfig(baseURL: String, token: String) {
        connectionConfig.directBridge.baseURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        connectionConfig.directBridge.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        persistConnectionConfig(preferredMode: .direct)
    }

    func setVoiceDiagnosticsEnabled(_ enabled: Bool) {
        if enabled {
            storeVoiceDiagnosticsEnabled(true)
            connectionConfig.voiceDiagnostics.enabled = true
            appendVoiceDebugLog("chatstore:voice-diagnostics enabled=true")
        } else {
            appendVoiceDebugLog("chatstore:voice-diagnostics enabled=false")
            connectionConfig.voiceDiagnostics.enabled = false
            storeVoiceDiagnosticsEnabled(false)
        }
        configStore.save(connectionConfig)
    }

    private func stageDirectBridgeFallback(from payload: RelayPairingPayload) {
        stageDirectBridgeFallback(configs: payload.directBridgeConfigs)
    }

    private func stageDirectBridgeFallback(from pairing: RelayPairingClaim) {
        stageDirectBridgeFallback(configs: pairing.directBridgeConfigs)
    }

    private func stageDirectBridgeFallback(configs: [BridgeConfig]) {
        guard let preferred = configs.first else {
            return
        }
        connectionConfig.directBridge.baseURL = preferred.baseURL
        connectionConfig.directBridge.token = preferred.token
        configStore.save(connectionConfig)
    }

    private func attemptDirectBridgeFallback(after error: Error) async -> Bool {
        guard shouldFallbackToDirectBridge(error) else {
            return false
        }

        guard !connectionConfig.directBridge.token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        await connectDirect()
        if case .connected = connectionState {
            return true
        }
        return false
    }

    private var directClient: BridgeClient {
        BridgeClient(config: connectionConfig.directBridge)
    }

    private func prepareMicrophonePermissionForVoiceCall() async -> Bool {
        let state = await requestVoiceMicrophonePermission()
        microphonePermissionPrompt = ChatStore.permissionPrompt(for: state)
        guard state == .granted else {
            connectionState = .failed("请先开启麦克风权限，再发起语音通话。")
            return false
        }
        return true
    }

    private func consumeDebugAutoRelayMessage() -> String? {
        if let storedValue = UserDefaults.standard.string(forKey: debugAutoRelayMessageKey) {
            UserDefaults.standard.removeObject(forKey: debugAutoRelayMessageKey)
            let trimmed = storedValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }

        let value = ProcessInfo.processInfo.environment["LOBSTER_AUTO_SEND_RELAY_MESSAGE"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else {
            return nil
        }
        return value
    }

    private func sendRelayTurn(message: String) async throws {
        guard let workspace = relayWorkspace else {
            throw BridgeClientError.server("请先完成 Relay 配对。")
        }

        guard let hostId = workspace.selectedHostId else {
            throw BridgeClientError.server("请先选择一台 Host。")
        }

        guard let sessionId = workspace.selectedSessionId else {
            throw BridgeClientError.server("请先选择一个 Session。")
        }

        do {
            let createdAt = ISO8601DateFormatter().string(from: Date())
            let client = RelayClient(relayBaseURL: workspace.relayBaseURL)
            pendingRelayMessagesBySession[sessionId] = BridgeMessage.optimisticUserMessage(
                content: message,
                createdAt: Date(),
                agentId: nil
            )
            draft = ""

            let submittedTurn = try await client.submitTurn(
                clientId: workspace.clientId,
                hostId: hostId,
                sessionId: sessionId,
                message: message,
                createdAt: createdAt
            )
            activeRelayTurnsBySession[sessionId] = submittedTurn

            let completedTurn = try await client.waitForTurn(
                clientId: workspace.clientId,
                turnId: submittedTurn.turnId,
                onUpdate: { [weak self] turn in
                    await MainActor.run {
                        guard let self else { return }
                        self.activeRelayTurnsBySession[sessionId] = turn
                        self.mergeRelayTurn(turn)
                        if turn.userMessage != nil {
                            self.pendingRelayMessagesBySession.removeValue(forKey: sessionId)
                        }
                    }
                }
            )

            activeRelayTurnsBySession.removeValue(forKey: sessionId)
            pendingRelayMessagesBySession.removeValue(forKey: sessionId)
            mergeRelayTurn(completedTurn)

            if completedTurn.status == "failed" {
                throw BridgeClientError.server(completedTurn.error ?? "Relay turn 执行失败。")
            }

            connectionState = .connected
        } catch {
            activeRelayTurnsBySession.removeValue(forKey: sessionId)
            pendingRelayMessagesBySession.removeValue(forKey: sessionId)
            throw error
        }
    }

    private func mergeRelayTurn(_ turn: RelayTurn) {
        let existing = relayMessagesBySession[turn.sessionId] ?? []
        relayMessagesBySession[turn.sessionId] = mergeRelayMessages(existing: existing, turn: turn)
    }

    private func persistConnectionConfig(preferredMode: ConnectionMode) {
        connectionConfig.preferredMode = preferredMode

        if let workspace = relayWorkspace {
            connectionConfig.relay = RelayClientConfig(
                relayBaseURL: workspace.relayBaseURL,
                clientId: workspace.clientId,
                selectedHostId: workspace.selectedHostId,
                selectedSessionId: workspace.selectedSessionId
            )
        }

        storeVoiceDiagnosticsEnabled(connectionConfig.voiceDiagnostics.enabled)
        configStore.save(connectionConfig)
    }

    private func applyRelayCall(_ call: RelayCallSummary?) {
        guard var workspace = relayWorkspace else {
            return
        }
        appendVoiceDebugLog("chatstore:apply-call callId=\(call?.callId ?? "nil") state=\(call?.state.rawValue ?? "nil") mode=\(call?.mode.rawValue ?? "nil")")
        let previousCall = workspace.selectedHost?.activeCall
        workspace.applyActiveCall(call)
        relayWorkspace = workspace
        persistConnectionConfig(preferredMode: .relay)
        if shouldPlayCallConnectedCue(previous: previousCall, next: call) {
            callConnectedCuePlayer.play()
        }
    }

    private func watchRelayCall(_ call: RelayCallSummary) {
        relayCallWatchTask?.cancel()
        guard let workspace = relayWorkspace else {
            return
        }
        appendVoiceDebugLog("chatstore:watch-call callId=\(call.callId) state=\(call.state.rawValue)")

        Task {
            await syncRelayCallAudioStreaming(for: call)
        }

        relayCallWatchTask = Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await CallClient(relayBaseURL: workspace.relayBaseURL).waitForCall(
                    clientId: workspace.clientId,
                    callId: call.callId,
                    onUpdate: { [weak self] update in
                        await MainActor.run {
                            self?.applyRelayCall(update)
                        }
                        appendVoiceDebugLog("chatstore:call-update callId=\(update.callId) state=\(update.state.rawValue)")
                        await self?.syncRelayCallAudioStreaming(for: update)
                    }
                )
            } catch is CancellationError {
                return
            } catch {
                appendVoiceDebugLog("chatstore:watch-call error=\(error.localizedDescription)")
                await MainActor.run {
                    self.connectionState = .failed(error.localizedDescription)
                }
            }
        }
    }

    private func syncRelayCallAudioStreaming(for call: RelayCallSummary?) async {
        appendVoiceDebugLog("chatstore:sync-audio callId=\(call?.callId ?? "nil") state=\(call?.state.rawValue ?? "nil") mode=\(call?.mode.rawValue ?? "nil") active=\(activeRelayAudioCallId ?? "nil")")
        guard let call else {
            await stopRelayCallAudioStreaming()
            return
        }

        guard call.mode == .audio, call.state == .live else {
            if activeRelayAudioCallId == call.callId {
                await stopRelayCallAudioStreaming()
            }
            return
        }

        if activeRelayAudioCallId == call.callId {
            return
        }

        do {
            let bridgeConfig = try resolveRelayCallAudioIngress(connectionConfig)
            appendVoiceDebugLog("chatstore:sync-audio resolved-baseURL=\(bridgeConfig.baseURL)")
            _ = try await relayCallAudioStreamer.start(callId: call.callId, bridgeConfig: bridgeConfig)
            activeRelayAudioCallId = call.callId
            appendVoiceDebugLog("chatstore:sync-audio started callId=\(call.callId)")
        } catch {
            activeRelayAudioCallId = nil
            appendVoiceDebugLog("chatstore:sync-audio error=\(error.localizedDescription)")
            connectionState = .failed(error.localizedDescription)
        }
    }

    private func stopRelayCallAudioStreaming() async {
        activeRelayAudioCallId = nil
        await relayCallAudioStreamer.stop()
        appendVoiceDebugLog("chatstore:sync-audio stopped")
    }

    private var currentDirectBucketId: String {
        selectedThreadID ?? draftThreadBucketId
    }

    private func beginConnection(stage: ConnectionProgressStage) -> Int {
        let attempt = connectionAttemptGate.begin()
        connectionStage = stage
        connectionState = .connecting
        return attempt
    }

    private static func permissionPrompt(for state: VoiceMicrophonePermissionState) -> MicrophonePermissionPrompt? {
        switch state {
        case .granted:
            return nil
        case .needsRequest:
            return .needsRequest
        case .denied:
            return .denied
        }
    }
}

extension ChatStore: ObservableObject {}
