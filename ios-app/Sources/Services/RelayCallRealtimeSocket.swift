import Foundation

struct RelayCallRealtimeInteraction: Codable, Equatable {
    let callId: String
    let kind: String
    let text: String
    let providerId: String?
    let modelId: String?
}

enum RelayCallRealtimeInboundMessage: Equatable {
    case sessionState(RelayCallVoiceSessionStatus)
    case audioOutput(RelayCallOutputAudioChunk)
    case transcriptFinal(RelayCallRealtimeInteraction)
    case assistantFinal(RelayCallRealtimeInteraction)
    case error(String)
    case pong
}

private struct RelayCallRealtimeHelloMessage: Encodable {
    let type = "hello"
}

private struct RelayCallRealtimeAudioInputEnvelope: Encodable {
    let type = "audio.input"
    let chunk: RelayCallAudioChunk
}

private struct RelayCallRealtimeSessionEnvelope: Decodable {
    let type: String
    let session: RelayCallVoiceSessionStatus
}

private struct RelayCallRealtimeAudioOutputEnvelope: Decodable {
    let type: String
    let chunk: RelayCallOutputAudioChunk
}

private struct RelayCallRealtimeInteractionEnvelope: Decodable {
    let type: String
    let interaction: RelayCallRealtimeInteraction
}

private struct RelayCallRealtimeErrorEnvelope: Decodable {
    let type: String
    let error: String
}

private struct RelayCallRealtimePongEnvelope: Decodable {
    let type: String
}

func buildRelayCallRealtimeRequest(
    config: BridgeConfig,
    callId: String,
    diagnosticsEnabled: Bool = currentVoiceDiagnosticsEnabled()
) throws -> URLRequest {
    let normalizedBaseURL = config.baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let normalizedCallId = callId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? callId

    guard var components = URLComponents(string: normalizedBaseURL) else {
        throw BridgeClientError.invalidURL
    }

    switch components.scheme?.lowercased() {
    case "http":
        components.scheme = "ws"
    case "https":
        components.scheme = "wss"
    case "ws", "wss":
        break
    default:
        throw BridgeClientError.invalidURL
    }

    components.path = "\(components.path)/calls/\(normalizedCallId)/realtime"
        .replacingOccurrences(of: "//", with: "/")

    guard let url = components.url else {
        throw BridgeClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.timeoutInterval = RelayTransportDefaults.requestTimeoutSeconds
    request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    applyVoiceDiagnosticsHeaders(&request, enabled: diagnosticsEnabled)
    return request
}

func encodeRelayCallRealtimeAudioInputMessage(chunk: RelayCallAudioChunk) throws -> Data {
    try JSONEncoder().encode(RelayCallRealtimeAudioInputEnvelope(chunk: chunk))
}

private func encodeRelayCallRealtimeHelloMessage() throws -> Data {
    try JSONEncoder().encode(RelayCallRealtimeHelloMessage())
}

func decodeRelayCallRealtimeInboundMessage(from data: Data) throws -> RelayCallRealtimeInboundMessage {
    let decoder = JSONDecoder()
    let typeContainer = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let type = typeContainer?["type"] as? String ?? ""

    switch type {
    case "session.state":
        return .sessionState(try decoder.decode(RelayCallRealtimeSessionEnvelope.self, from: data).session)
    case "audio.output":
        return .audioOutput(try decoder.decode(RelayCallRealtimeAudioOutputEnvelope.self, from: data).chunk)
    case "transcript.final":
        return .transcriptFinal(try decoder.decode(RelayCallRealtimeInteractionEnvelope.self, from: data).interaction)
    case "assistant.final":
        return .assistantFinal(try decoder.decode(RelayCallRealtimeInteractionEnvelope.self, from: data).interaction)
    case "error":
        return .error(try decoder.decode(RelayCallRealtimeErrorEnvelope.self, from: data).error)
    case "pong":
        _ = try decoder.decode(RelayCallRealtimePongEnvelope.self, from: data)
        return .pong
    default:
        throw BridgeClientError.invalidResponse
    }
}

private func decodeRelayCallRealtimeInboundMessage(
    from message: URLSessionWebSocketTask.Message
) throws -> RelayCallRealtimeInboundMessage {
    switch message {
    case .data(let data):
        return try decodeRelayCallRealtimeInboundMessage(from: data)
    case .string(let string):
        return try decodeRelayCallRealtimeInboundMessage(from: Data(string.utf8))
    @unknown default:
        throw BridgeClientError.invalidResponse
    }
}

final class RelayCallRealtimeSocket {
    typealias OutputChunkHandler = @Sendable (RelayCallOutputAudioChunk) async -> Void
    typealias MessageHandler = @Sendable (RelayCallRealtimeInboundMessage) async -> Void

    private let urlSession: URLSession
    private var task: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var outputChunkHandler: OutputChunkHandler?
    private var messageHandler: MessageHandler?

    init(urlSession: URLSession = .shared) {
        self.urlSession = urlSession
    }

    func start(
        callId: String,
        bridgeConfig: BridgeConfig,
        onOutputChunk: @escaping OutputChunkHandler,
        onMessage: @escaping MessageHandler = { _ in }
    ) async throws -> RelayCallVoiceSessionStatus {
        let request = try buildRelayCallRealtimeRequest(
            config: bridgeConfig,
            callId: callId
        )
        let task = urlSession.webSocketTask(with: request)
        task.resume()
        self.task = task
        self.outputChunkHandler = onOutputChunk
        self.messageHandler = onMessage

        try await task.send(.data(try encodeRelayCallRealtimeHelloMessage()))
        let initialMessage = try await task.receive()
        let decoded = try decodeRelayCallRealtimeInboundMessage(from: initialMessage)

        switch decoded {
        case .sessionState(let status):
            beginReceiveLoop(task: task)
            return status
        case .error(let message):
            stop()
            throw BridgeClientError.server(message)
        default:
            stop()
            throw BridgeClientError.invalidResponse
        }
    }

    func sendAudioChunk(_ chunk: RelayCallAudioChunk) async throws {
        guard let task else {
            throw BridgeClientError.server("本地语音通道尚未建立。")
        }

        try await task.send(.data(try encodeRelayCallRealtimeAudioInputMessage(chunk: chunk)))
    }

    func stop() {
        receiveTask?.cancel()
        receiveTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        outputChunkHandler = nil
        messageHandler = nil
    }

    private func beginReceiveLoop(task: URLSessionWebSocketTask) {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self else { return }

            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    let decoded = try decodeRelayCallRealtimeInboundMessage(from: message)
                    switch decoded {
                    case .audioOutput(let chunk):
                        await outputChunkHandler?(chunk)
                    default:
                        await messageHandler?(decoded)
                    }
                } catch is CancellationError {
                    return
                } catch {
                    await messageHandler?(.error(error.localizedDescription))
                    return
                }
            }
        }
    }
}
