import Foundation

enum RelayPairingPayloadError: LocalizedError {
    case invalidURL
    case missingPayload
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "配对链接无效。"
        case .missingPayload:
            return "配对链接里没有携带连接信息。"
        case .invalidPayload:
            return "配对链接解析失败。"
        }
    }
}

struct RelayPairingPayload: Codable, Equatable {
    let v: Int
    let relayBaseURL: String
    let hostId: String
    let inviteId: String
    let code: String
    let expiresAt: String

    private enum CodingKeys: String, CodingKey {
        case v
        case relayBaseURL = "relayBaseUrl"
        case hostId
        case inviteId
        case code
        case expiresAt
    }

    static func parse(from input: String) throws -> RelayPairingPayload {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let components = URLComponents(string: trimmed) else {
            throw RelayPairingPayloadError.invalidURL
        }

        let fragment = components.fragment ?? ""
        let pairingValue = fragment
            .split(separator: "&")
            .compactMap { item -> String? in
                let parts = item.split(separator: "=", maxSplits: 1).map(String.init)
                guard parts.count == 2, parts[0] == "pairing" else {
                    return nil
                }
                return parts[1]
            }
            .first

        guard let pairingValue, !pairingValue.isEmpty else {
            throw RelayPairingPayloadError.missingPayload
        }

        guard
            let data = Data(base64URLEncoded: pairingValue),
            let payload = try? JSONDecoder().decode(RelayPairingPayload.self, from: data)
        else {
            throw RelayPairingPayloadError.invalidPayload
        }

        return payload
    }
}

struct RelayHost: Codable, Equatable, Hashable, Identifiable {
    let hostId: String
    let displayName: String
    let status: String
    let lastSeenAt: String
    let capabilities: [String]

    var id: String {
        hostId
    }
}

struct RelaySession: Codable, Equatable, Hashable, Identifiable {
    let sessionId: String
    let hostId: String
    let title: String
    let summary: String
    let updatedAt: String
    let primaryAgentId: String?
    let state: String

    var id: String {
        sessionId
    }
}

struct RelayWorkspaceState: Codable, Equatable {
    let relayBaseURL: String
    let clientId: String
    private(set) var hosts: [RelayHost] = []
    private(set) var sessionsByHost: [String: [RelaySession]] = [:]
    private(set) var selectedHostId: String?
    private(set) var selectedSessionId: String?

    init(
        relayBaseURL: String,
        clientId: String,
        hosts: [RelayHost] = [],
        sessionsByHost: [String: [RelaySession]] = [:],
        selectedHostId: String? = nil,
        selectedSessionId: String? = nil
    ) {
        self.relayBaseURL = relayBaseURL
        self.clientId = clientId
        self.hosts = hosts
        self.sessionsByHost = sessionsByHost
        self.selectedHostId = selectedHostId
        self.selectedSessionId = selectedSessionId
    }

    var selectedHost: RelayHost? {
        guard let selectedHostId else {
            return nil
        }
        return hosts.first(where: { $0.hostId == selectedHostId })
    }

    var sessions: [RelaySession] {
        guard let selectedHostId else {
            return []
        }
        return sessionsByHost[selectedHostId] ?? []
    }

    var selectedSession: RelaySession? {
        guard let selectedSessionId else {
            return nil
        }
        return sessions.first(where: { $0.sessionId == selectedSessionId })
    }

    mutating func applyHosts(_ nextHosts: [RelayHost]) {
        hosts = nextHosts

        if let selectedHostId,
           nextHosts.contains(where: { $0.hostId == selectedHostId }) {
            selectHost(selectedHostId)
            return
        }

        selectedHostId = nextHosts.first?.hostId
        selectedSessionId = nil
    }

    mutating func applySessions(_ nextSessions: [RelaySession], for hostId: String) {
        sessionsByHost[hostId] = nextSessions

        guard selectedHostId == hostId else {
            return
        }

        if let selectedSessionId,
           nextSessions.contains(where: { $0.sessionId == selectedSessionId }) {
            return
        }

        selectedSessionId = nextSessions.first?.sessionId
    }

    mutating func selectHost(_ hostId: String) {
        guard hosts.contains(where: { $0.hostId == hostId }) else {
            return
        }

        selectedHostId = hostId
        selectedSessionId = sessionsByHost[hostId]?.first?.sessionId
    }

    mutating func selectSession(_ sessionId: String) {
        guard sessions.contains(where: { $0.sessionId == sessionId }) else {
            return
        }
        selectedSessionId = sessionId
    }
}

private extension Data {
    init?(base64URLEncoded value: String) {
        var normalized = value
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        let remainder = normalized.count % 4
        if remainder > 0 {
            normalized += String(repeating: "=", count: 4 - remainder)
        }

        self.init(base64Encoded: normalized)
    }
}
