import Foundation

enum BridgeClientError: LocalizedError {
    case invalidURL
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Bridge 地址无效。"
        case .invalidResponse:
            return "Bridge 返回了无效响应。"
        case .server(let message):
            return message
        }
    }
}

struct BridgeClient {
    var config: BridgeConfig

    func health() async throws -> BridgeHealth {
        try await send(path: "/health", method: "GET", body: Optional<String>.none)
    }

    func listThreads() async throws -> [ThreadSummary] {
        let response: ThreadsResponse = try await send(path: "/threads", method: "GET", body: Optional<String>.none)
        return response.threads
    }

    func threadDetail(id: String) async throws -> ThreadEnvelope {
        try await send(path: "/threads/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)", method: "GET", body: Optional<String>.none)
    }

    func sendTurn(threadId: String?, message: String) async throws -> TurnResponse {
        struct Payload: Encodable {
            let threadId: String?
            let message: String
        }

        return try await send(
            path: "/turn",
            method: "POST",
            body: Payload(threadId: threadId, message: message)
        )
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard let url = URL(string: config.baseURL + path) else {
            throw BridgeClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")

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
