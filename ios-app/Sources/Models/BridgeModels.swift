import Foundation

struct BridgeHealth: Decodable {
    let ok: Bool
    let threads: Int
}

struct ThreadSummary: Decodable, Identifiable, Hashable {
    let id: String
    let title: String?
    let goal: String?
    let primaryAgentId: String?
    let latestMessagePreview: String?
    let updatedAt: String?
}

struct ThreadEnvelope: Decodable {
    let thread: ThreadSummary
    let messages: [BridgeMessage]
}

struct BridgeMessage: Decodable, Identifiable, Hashable {
    let id: String
    let role: String
    let content: String
    let timestamp: String?
    let agentId: String?

    var isAssistant: Bool {
        role == "assistant"
    }
}

struct ThreadsResponse: Decodable {
    let threads: [ThreadSummary]
}

struct TurnResponse: Decodable {
    let ok: Bool?
    let threadId: String
}

struct BridgeConfig: Codable, Equatable {
    var baseURL: String
    var token: String

    static let `default` = BridgeConfig(
        baseURL: "https://control.nanobanani.app/api",
        token: ""
    )
}
