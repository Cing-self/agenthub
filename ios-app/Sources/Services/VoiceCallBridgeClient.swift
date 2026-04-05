import Foundation

let voiceDiagnosticsHeaderName = "X-AgentHub-Voice-Diagnostics"

struct RelayCallAudioChunk: Encodable, Equatable {
    let audioBase64: String
    let mimeType: String
    let sequence: Int
    let sampleRateHz: Int
    let channels: Int
    let durationMs: Int
}

struct RelayCallVoiceSessionStatus: Decodable, Equatable {
    let callId: String
    let status: String
    let providerId: String?
    let modelId: String?
    let ready: Bool
    let missing: [String]
    let hasAppId: Bool
    let hasToken: Bool
    let hasResourceId: Bool
    let startedAt: String?
    let lastChunkAt: String?
    let endedAt: String?
    let receivedChunks: Int
    let receivedBytes: Int
    let sampleRateHz: Int?
    let channels: Int?
}

struct RelayCallOutputAudioChunk: Decodable, Equatable {
    let sequence: Int
    let audioBase64: String
    let mimeType: String
    let sampleRateHz: Int?
    let channels: Int?
    let durationMs: Int?

    var audioData: Data {
        Data(base64Encoded: audioBase64) ?? Data()
    }
}

private struct RelayCallVoiceSessionEnvelope: Decodable {
    let ok: Bool
    let session: RelayCallVoiceSessionStatus
}

struct RelayCallAudioOutputEnvelope: Decodable, Equatable {
    let ok: Bool
    let chunks: [RelayCallOutputAudioChunk]
    let session: RelayCallVoiceSessionStatus
}

func resolveRelayCallAudioIngress(_ config: MobileConnectionConfig) throws -> BridgeConfig {
    let normalizedBaseURL = config.directBridge.baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedToken = config.directBridge.token.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !normalizedBaseURL.isEmpty else {
        throw BridgeClientError.server("请先填写 Direct Bridge 地址，用于语音媒体直连。")
    }

    guard !normalizedToken.isEmpty else {
        throw BridgeClientError.server("请先填写 Direct Bridge Token，用于语音媒体直连。")
    }

    return BridgeConfig(baseURL: normalizedBaseURL, token: normalizedToken)
}

func buildRelayCallAudioChunkUploadRequest(
    config: BridgeConfig,
    callId: String,
    chunk: RelayCallAudioChunk,
    diagnosticsEnabled: Bool = currentVoiceDiagnosticsEnabled()
) throws -> URLRequest {
    guard
        let encodedCallId = callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
        let url = URL(string: config.baseURL + "/calls/\(encodedCallId)/audio-chunks")
    else {
        throw BridgeClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.timeoutInterval = RelayTransportDefaults.requestTimeoutSeconds
    applyVoiceDiagnosticsHeaders(&request, enabled: diagnosticsEnabled)
    request.httpBody = try JSONEncoder().encode(chunk)
    return request
}

func buildRelayCallAudioOutputRequest(
    config: BridgeConfig,
    callId: String,
    afterSequence: Int,
    limit: Int,
    diagnosticsEnabled: Bool = currentVoiceDiagnosticsEnabled()
) throws -> URLRequest {
    guard
        let encodedCallId = callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
        var components = URLComponents(string: config.baseURL + "/calls/\(encodedCallId)/audio-output")
    else {
        throw BridgeClientError.invalidURL
    }

    components.queryItems = [
        URLQueryItem(name: "afterSequence", value: String(afterSequence)),
        URLQueryItem(name: "limit", value: String(limit))
    ]

    guard let url = components.url else {
        throw BridgeClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    request.timeoutInterval = RelayTransportDefaults.requestTimeoutSeconds
    applyVoiceDiagnosticsHeaders(&request, enabled: diagnosticsEnabled)
    return request
}

func applyVoiceDiagnosticsHeaders(_ request: inout URLRequest, enabled: Bool) {
    if enabled {
        request.setValue("1", forHTTPHeaderField: voiceDiagnosticsHeaderName)
    } else {
        request.setValue(nil, forHTTPHeaderField: voiceDiagnosticsHeaderName)
    }
}

struct VoiceCallBridgeClient {
    let config: BridgeConfig

    func voiceSession(callId: String) async throws -> RelayCallVoiceSessionStatus {
        try await send(
            path: "/calls/\(callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? callId)/voice-session",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func uploadAudioChunk(callId: String, chunk: RelayCallAudioChunk) async throws -> RelayCallVoiceSessionStatus {
        let request = try buildRelayCallAudioChunkUploadRequest(
            config: config,
            callId: callId,
            chunk: chunk
        )
        let (data, response) = try await performTransportRequest(request, serviceName: "Voice bridge")
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
            let envelope = try JSONDecoder().decode(RelayCallVoiceSessionEnvelope.self, from: data)
            return envelope.session
        } catch {
            throw BridgeClientError.invalidResponse
        }
    }

    func outputAudio(callId: String, afterSequence: Int, limit: Int = 12) async throws -> RelayCallAudioOutputEnvelope {
        let request = try buildRelayCallAudioOutputRequest(
            config: config,
            callId: callId,
            afterSequence: afterSequence,
            limit: limit
        )
        let (data, response) = try await performTransportRequest(request, serviceName: "Voice bridge")
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
            return try JSONDecoder().decode(RelayCallAudioOutputEnvelope.self, from: data)
        } catch {
            throw BridgeClientError.invalidResponse
        }
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
        request.timeoutInterval = RelayTransportDefaults.requestTimeoutSeconds
        applyVoiceDiagnosticsHeaders(&request, enabled: currentVoiceDiagnosticsEnabled())

        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await performTransportRequest(request, serviceName: "Voice bridge")
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
            if Response.self == RelayCallVoiceSessionStatus.self {
                let envelope = try JSONDecoder().decode(RelayCallVoiceSessionEnvelope.self, from: data)
                return envelope.session as! Response
            }
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw BridgeClientError.invalidResponse
        }
    }
}
