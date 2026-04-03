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

    @Published var config: BridgeConfig
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
        self.config = configStore.load()
        self.isShowingConnectionSheet = config.token.isEmpty
    }

    private var client: BridgeClient {
        BridgeClient(config: config)
    }

    func connect() async {
        guard !config.token.isEmpty else {
            connectionState = .failed("请先填写连接码。")
            isShowingConnectionSheet = true
            return
        }

        connectionState = .connecting

        do {
            _ = try await client.health()
            configStore.save(config)
            connectionState = .connected
            isShowingConnectionSheet = false
            try await refreshThreads()
        } catch {
            connectionState = .failed(error.localizedDescription)
            isShowingConnectionSheet = true
        }
    }

    func refreshThreads() async throws {
        let loadedThreads = try await client.listThreads()
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
        let detail = try await client.threadDetail(id: id)
        selectedThreadID = id
        selectedThread = detail
        isShowingHistory = false
    }

    func startNewConversation() {
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

        isSending = true
        defer { isSending = false }

        do {
            let result = try await client.sendTurn(threadId: selectedThreadID, message: text)
            draft = ""
            try await refreshThreads()
            try await loadThread(id: result.threadId)
        } catch {
            connectionState = .failed(error.localizedDescription)
        }
    }

    func applyConfig(baseURL: String, token: String) {
        config.baseURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        config.token = token.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension ChatStore: ObservableObject {}
