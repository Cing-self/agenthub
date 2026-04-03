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

enum ConnectionMode: String, Codable, Equatable {
    case relay
    case direct
}

struct BridgeConfig: Codable, Equatable {
    var baseURL: String
    var token: String

    static let `default` = BridgeConfig(
        baseURL: "https://control.nanobanani.app/api",
        token: ""
    )
}

struct RelayClientConfig: Codable, Equatable {
    var relayBaseURL: String
    var clientId: String
    var selectedHostId: String?
    var selectedSessionId: String?
}

struct MobileConnectionConfig: Codable, Equatable {
    var preferredMode: ConnectionMode
    var directBridge: BridgeConfig
    var relay: RelayClientConfig?

    static let `default` = MobileConnectionConfig(
        preferredMode: .relay,
        directBridge: .default,
        relay: nil
    )
}

struct RelayPairingClaim: Decodable, Equatable {
    let hostId: String
    let clientId: String
    let claimedAt: String
}

struct RelayPairingClaimResponse: Decodable {
    let ok: Bool
    let pairing: RelayPairingClaim
}

struct RelayHostsResponse: Decodable {
    let ok: Bool
    let hosts: [RelayHost]
}

struct RelaySessionsResponse: Decodable {
    let ok: Bool
    let sessions: [RelaySession]
}
