import Foundation

struct RelayClient {
    let relayBaseURL: String

    func claimInvite(code: String, clientId: String, claimedAt: String) async throws -> RelayPairingClaim {
        struct Payload: Encodable {
            let code: String
            let clientId: String
            let claimedAt: String
        }

        let response: RelayPairingClaimResponse = try await send(
            path: "/pairing/invites/claim",
            method: "POST",
            body: Payload(code: code, clientId: clientId, claimedAt: claimedAt)
        )
        return response.pairing
    }

    func listHosts(clientId: String) async throws -> [RelayHost] {
        let encodedClientId = clientId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? clientId
        let response: RelayHostsResponse = try await send(
            path: "/clients/\(encodedClientId)/hosts",
            method: "GET",
            body: Optional<String>.none
        )
        return response.hosts
    }

    func listSessions(hostId: String) async throws -> [RelaySession] {
        let encodedHostId = hostId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? hostId
        let response: RelaySessionsResponse = try await send(
            path: "/hosts/\(encodedHostId)/sessions",
            method: "GET",
            body: Optional<String>.none
        )
        return response.sessions
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        let trimmedBaseURL = relayBaseURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBaseURL = trimmedBaseURL.hasSuffix("/api")
            ? String(trimmedBaseURL.dropLast(4))
            : trimmedBaseURL
        guard let url = URL(string: normalizedBaseURL + "/api" + path) else {
            throw BridgeClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw BridgeClientError.invalidResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            if
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let message = json["error"] as? String
            {
                throw BridgeClientError.server(message)
            }
            throw BridgeClientError.server("请求失败：HTTP \(httpResponse.statusCode)")
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw BridgeClientError.invalidResponse
        }
    }
}
