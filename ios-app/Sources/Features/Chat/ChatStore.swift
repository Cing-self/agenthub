import Foundation
import Combine

@MainActor
final class ChatStore {
    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
    }

    @Published var connectionConfig: MobileConnectionConfig
    @Published var relayWorkspace: RelayWorkspaceState?
    @Published var connectionState: ConnectionState = .disconnected
    @Published var threads: [ThreadSummary] = []
    @Published var selectedThread: ThreadEnvelope?
    @Published var selectedThreadID: String?
    @Published var draft = ""
    @Published var isSending = false
    @Published var isShowingHistory = false
    @Published var isShowingConnectionSheet = false

    private let configStore = BridgeConfigStore()

    init() {
        let storedConfig = configStore.load()
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

    func connect() async {
        switch connectionConfig.preferredMode {
        case .relay:
            await connectRelay()
        case .direct:
            await connectDirect()
        }
    }

    func connectDirect() async {
        guard !connectionConfig.directBridge.token.isEmpty else {
            connectionState = .failed("请先填写 Direct Bridge 的地址和 Token。")
            isShowingConnectionSheet = true
            return
        }

        connectionState = .connecting

        do {
            _ = try await directClient.health()
            persistConnectionConfig(preferredMode: .direct)
            connectionState = .connected
            isShowingConnectionSheet = false
            try await refreshThreads()
        } catch {
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func completePairing(from input: String) async {
        connectionState = .connecting

        do {
            let payload = try RelayPairingPayload.parse(from: input)
            let clientId = connectionConfig.relay?.clientId ?? "ios-\(UUID().uuidString.lowercased())"
            let claimedAt = ISO8601DateFormatter().string(from: Date())
            let client = RelayClient(relayBaseURL: payload.relayBaseURL)

            _ = try await client.claimInvite(
                code: payload.code,
                clientId: clientId,
                claimedAt: claimedAt
            )

            relayWorkspace = RelayWorkspaceState(
                relayBaseURL: payload.relayBaseURL,
                clientId: clientId,
                selectedHostId: payload.hostId
            )

            persistConnectionConfig(preferredMode: .relay)
            await connectRelay(preferredHostId: payload.hostId)
        } catch {
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func connectRelay(preferredHostId: String? = nil) async {
        guard var workspace = relayWorkspace else {
            connectionState = .failed("请先完成配对。")
            isShowingConnectionSheet = true
            return
        }

        connectionState = .connecting

        do {
            let client = RelayClient(relayBaseURL: workspace.relayBaseURL)
            let hosts = try await client.listHosts(clientId: workspace.clientId)
            workspace.applyHosts(hosts)

            if let preferredHostId {
                workspace.selectHost(preferredHostId)
            }

            if let hostId = workspace.selectedHostId {
                let sessions = try await client.listSessions(hostId: hostId)
                workspace.applySessions(sessions, for: hostId)
            }

            relayWorkspace = workspace
            persistConnectionConfig(preferredMode: .relay)
            connectionState = .connected
            isShowingConnectionSheet = false
        } catch {
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func selectRelayHost(_ hostId: String) async {
        guard var workspace = relayWorkspace else {
            return
        }

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

        guard !isRelayMode else {
            connectionState = .failed("Relay 文本流还在接入中，先用 Direct Bridge 调试聊天。")
            return
        }

        isSending = true
        defer { isSending = false }

        do {
            let result = try await directClient.sendTurn(threadId: selectedThreadID, message: text)
            draft = ""
            try await refreshThreads()
            try await loadThread(id: result.threadId)
        } catch {
            connectionState = .failed(error.localizedDescription)
        }
    }

    func applyDirectConfig(baseURL: String, token: String) {
        connectionConfig.directBridge.baseURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        connectionConfig.directBridge.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        persistConnectionConfig(preferredMode: .direct)
    }

    private var directClient: BridgeClient {
        BridgeClient(config: connectionConfig.directBridge)
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

        configStore.save(connectionConfig)
    }
}

extension ChatStore: ObservableObject {}
