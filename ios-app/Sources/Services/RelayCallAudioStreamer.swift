import Foundation

#if os(iOS)
import AVFoundation
import UIKit
#endif

enum VoiceMicrophonePermissionState: Equatable {
    case granted
    case needsRequest
    case denied
}

func voiceMicrophonePermissionStateDebugName(_ state: VoiceMicrophonePermissionState) -> String {
    switch state {
    case .granted:
        return "granted"
    case .needsRequest:
        return "needsRequest"
    case .denied:
        return "denied"
    }
}

func shouldAutoRequestVoiceMicrophonePermission(for state: VoiceMicrophonePermissionState) -> Bool {
    state == .needsRequest
}

#if os(iOS)
@available(iOS 17.0, *)
private func voicePermissionState(
    from permission: AVAudioApplication.recordPermission
) -> VoiceMicrophonePermissionState {
    switch permission {
    case .granted:
        return .granted
    case .undetermined:
        return .needsRequest
    case .denied:
        return .denied
    @unknown default:
        return .denied
    }
}

private func voicePermissionState(
    from permission: AVAudioSession.RecordPermission
) -> VoiceMicrophonePermissionState {
    switch permission {
    case .granted:
        return .granted
    case .undetermined:
        return .needsRequest
    case .denied:
        return .denied
    @unknown default:
        return .denied
    }
}

func currentVoiceMicrophonePermissionState() -> VoiceMicrophonePermissionState {
    if #available(iOS 17.0, *) {
        return voicePermissionState(from: AVAudioApplication.shared.recordPermission)
    }
    return voicePermissionState(from: AVAudioSession.sharedInstance().recordPermission)
}

func requestVoiceMicrophonePermission() async -> VoiceMicrophonePermissionState {
    let currentState = currentVoiceMicrophonePermissionState()
    appendVoiceDebugLog("voice-permission:current state=\(voiceMicrophonePermissionStateDebugName(currentState))")

    switch currentState {
    case .granted:
        return .granted
    case .denied:
        return .denied
    case .needsRequest:
        appendVoiceDebugLog("voice-permission:requesting")
        let granted = await withCheckedContinuation { continuation in
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission { allowed in
                    continuation.resume(returning: allowed)
                }
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                    continuation.resume(returning: allowed)
                }
            }
        }
        let resolvedState: VoiceMicrophonePermissionState = granted ? .granted : .denied
        appendVoiceDebugLog("voice-permission:request-result state=\(voiceMicrophonePermissionStateDebugName(resolvedState))")
        return resolvedState
    }
}

func openVoiceMicrophoneSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else {
        return
    }
    Task { @MainActor in
        UIApplication.shared.open(url)
    }
}
#else
func currentVoiceMicrophonePermissionState() -> VoiceMicrophonePermissionState {
    .granted
}

func requestVoiceMicrophonePermission() async -> VoiceMicrophonePermissionState {
    .granted
}

func openVoiceMicrophoneSettings() {}
#endif

private func voiceDebugLogURL() -> URL? {
    let roots = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
    return roots.first?.appendingPathComponent("lobster-voice-debug.log")
}

private let voiceDiagnosticsDefaultsKey = "lobster-mobile.voice-diagnostics.enabled"

func currentVoiceDiagnosticsEnabled(userDefaults: UserDefaults = .standard) -> Bool {
    if userDefaults.object(forKey: voiceDiagnosticsDefaultsKey) != nil {
        return userDefaults.bool(forKey: voiceDiagnosticsDefaultsKey)
    }
    return VoiceDiagnosticsConfig.default.enabled
}

func storeVoiceDiagnosticsEnabled(_ enabled: Bool, userDefaults: UserDefaults = .standard) {
    userDefaults.set(enabled, forKey: voiceDiagnosticsDefaultsKey)
}

func voiceDebugConsoleLine(_ message: String) -> String {
    "LOBSTER_VOICE_DEBUG \(message)"
}

func appendVoiceDebugLog(_ message: String) {
    guard currentVoiceDiagnosticsEnabled() else {
        return
    }

    guard let url = voiceDebugLogURL() else {
        return
    }

    let formatter = ISO8601DateFormatter()
    let line = "[\(formatter.string(from: Date()))] \(message)\n"
    let data = Data(line.utf8)
    NSLog("%@", voiceDebugConsoleLine(message))

    if FileManager.default.fileExists(atPath: url.path) {
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
        }
    } else {
        try? data.write(to: url, options: .atomic)
    }
}

protocol RelayCallAudioStreaming: AnyObject {
    func start(callId: String, bridgeConfig: BridgeConfig) async throws -> RelayCallVoiceSessionStatus
    func stop() async
}

protocol CallConnectedCuePlaying: AnyObject {
    func play()
}

func callConnectedAnnouncementText() -> String {
    "已连接，请开始说话"
}

func makeCallConnectedCuePCM16Mono(
    sampleRateHz: Int = 24_000,
    durationMs: Int = 160,
    frequencyHz: Double = 1_120
) -> Data {
    let safeSampleRate = max(sampleRateHz, 8_000)
    let frameCount = max(safeSampleRate * max(durationMs, 1) / 1_000, 1)
    let fadeFrameCount = max(min(frameCount / 5, safeSampleRate / 80), 1)
    let amplitude = 0.22

    var data = Data(capacity: frameCount * MemoryLayout<Int16>.size)
    for frameIndex in 0 ..< frameCount {
        let envelope: Double
        if frameIndex < fadeFrameCount {
            envelope = Double(frameIndex) / Double(fadeFrameCount)
        } else if frameIndex >= frameCount - fadeFrameCount {
            envelope = Double(frameCount - frameIndex - 1) / Double(fadeFrameCount)
        } else {
            envelope = 1
        }

        let phase = 2.0 * Double.pi * frequencyHz * Double(frameIndex) / Double(safeSampleRate)
        let sample = sin(phase) * amplitude * max(envelope, 0)
        let intSample = Int16(max(-1, min(1, sample)) * Double(Int16.max))
        var littleEndian = intSample.littleEndian
        data.append(Data(bytes: &littleEndian, count: MemoryLayout<Int16>.size))
    }

    return data
}

func resamplePCM16Mono(
    audioData: Data,
    fromSampleRateHz: Int,
    toSampleRateHz: Int
) -> Data {
    let sourceRate = max(fromSampleRateHz, 8_000)
    let targetRate = max(toSampleRateHz, 8_000)

    guard !audioData.isEmpty else {
        return Data()
    }
    guard sourceRate != targetRate else {
        return audioData
    }

    let sourceSampleCount = audioData.count / MemoryLayout<Int16>.size
    guard sourceSampleCount > 1 else {
        return audioData
    }

    let sourceSamples: [Int16] = audioData.withUnsafeBytes { rawBuffer in
        let sampleBuffer = rawBuffer.bindMemory(to: Int16.self)
        return Array(sampleBuffer)
    }

    let targetSampleCount = max(
        1,
        Int((Double(sourceSampleCount) * Double(targetRate) / Double(sourceRate)).rounded())
    )
    var output = Data(capacity: targetSampleCount * MemoryLayout<Int16>.size)

    let scale = Double(sourceRate) / Double(targetRate)
    for targetIndex in 0 ..< targetSampleCount {
        let sourcePosition = Double(targetIndex) * scale
        let lowerIndex = min(Int(sourcePosition), sourceSampleCount - 1)
        let upperIndex = min(lowerIndex + 1, sourceSampleCount - 1)
        let fraction = sourcePosition - Double(lowerIndex)
        let lowerValue = Double(sourceSamples[lowerIndex])
        let upperValue = Double(sourceSamples[upperIndex])
        let interpolated = lowerValue + (upperValue - lowerValue) * fraction
        let clamped = max(Double(Int16.min), min(Double(Int16.max), interpolated.rounded()))
        var littleEndian = Int16(clamped).littleEndian
        output.append(Data(bytes: &littleEndian, count: MemoryLayout<Int16>.size))
    }

    return output
}

func inferredPCM16MonoDurationMs(
    audioData: Data,
    sampleRateHz: Int,
    channels: Int
) -> Int {
    let clampedChannels = max(channels, 1)
    let frameCount = audioData.count / (MemoryLayout<Int16>.size * clampedChannels)
    guard frameCount > 0 else {
        return 0
    }

    return max(
        Int((Double(frameCount) / Double(max(sampleRateHz, 8_000))) * 1000.0),
        1
    )
}

func normalizedPCM16MonoRMS(audioData: Data) -> Double {
    let sampleCount = audioData.count / MemoryLayout<Int16>.size
    guard sampleCount > 0 else {
        return 0
    }

    let samples: [Int16] = audioData.withUnsafeBytes { rawBuffer in
        Array(rawBuffer.bindMemory(to: Int16.self))
    }

    let sumSquares = samples.reduce(0.0) { partialResult, sample in
        let normalized = Double(sample) / Double(Int16.max)
        return partialResult + (normalized * normalized)
    }
    return sqrt(sumSquares / Double(sampleCount))
}

func applyPCM16MonoEdgeFade(
    audioData: Data,
    fadeFrameCount: Int
) -> Data {
    let sampleCount = audioData.count / MemoryLayout<Int16>.size
    guard sampleCount > 2 else {
        return audioData
    }

    let clampedFadeCount = max(0, min(fadeFrameCount, sampleCount / 2))
    guard clampedFadeCount > 0 else {
        return audioData
    }

    var samples: [Int16] = audioData.withUnsafeBytes { rawBuffer in
        Array(rawBuffer.bindMemory(to: Int16.self))
    }

    for index in 0 ..< clampedFadeCount {
        let gain = Float(index) / Float(clampedFadeCount)
        let tailIndex = sampleCount - index - 1

        samples[index] = Int16(Float(samples[index]) * gain)
        samples[tailIndex] = Int16(Float(samples[tailIndex]) * gain)
    }

    return samples.withUnsafeBufferPointer { Data(buffer: $0) }
}

struct VoiceUploadSuppressionWindow: Equatable {
    let playbackEndsAt: Date
    let suppressUntil: Date
}

func voiceUploadSuppressionWindow(
    now: Date,
    queuedPlaybackEndsAt: Date?,
    playbackDurationMs: Int,
    safetyPaddingMs: Int = 180
) -> VoiceUploadSuppressionWindow {
    let playbackStart = max(now, queuedPlaybackEndsAt ?? now)
    let playbackEndsAt = playbackStart.addingTimeInterval(Double(max(playbackDurationMs, 1)) / 1000.0)
    let suppressUntil = playbackEndsAt.addingTimeInterval(Double(max(safetyPaddingMs, 1)) / 1000.0)
    return VoiceUploadSuppressionWindow(
        playbackEndsAt: playbackEndsAt,
        suppressUntil: suppressUntil
    )
}

func shouldUploadVoiceInput(
    now: Date,
    suppressUntil: Date?
) -> Bool {
    guard let suppressUntil else {
        return true
    }
    return now >= suppressUntil
}

private func makePCM16WaveData(
    audioData: Data,
    sampleRateHz: Int,
    channels: Int
) -> Data {
    let clampedChannels = max(channels, 1)
    let bitsPerSample = 16
    let byteRate = sampleRateHz * clampedChannels * bitsPerSample / 8
    let blockAlign = clampedChannels * bitsPerSample / 8
    let riffChunkSize = 36 + audioData.count

    var data = Data()

    data.append("RIFF".data(using: .ascii)!)
    var riffSize = UInt32(riffChunkSize).littleEndian
    data.append(Data(bytes: &riffSize, count: MemoryLayout<UInt32>.size))
    data.append("WAVE".data(using: .ascii)!)

    data.append("fmt ".data(using: .ascii)!)
    var formatChunkSize = UInt32(16).littleEndian
    data.append(Data(bytes: &formatChunkSize, count: MemoryLayout<UInt32>.size))
    var formatTag = UInt16(1).littleEndian
    data.append(Data(bytes: &formatTag, count: MemoryLayout<UInt16>.size))
    var channelCount = UInt16(clampedChannels).littleEndian
    data.append(Data(bytes: &channelCount, count: MemoryLayout<UInt16>.size))
    var sampleRate = UInt32(sampleRateHz).littleEndian
    data.append(Data(bytes: &sampleRate, count: MemoryLayout<UInt32>.size))
    var bytesPerSecond = UInt32(byteRate).littleEndian
    data.append(Data(bytes: &bytesPerSecond, count: MemoryLayout<UInt32>.size))
    var frameAlignment = UInt16(blockAlign).littleEndian
    data.append(Data(bytes: &frameAlignment, count: MemoryLayout<UInt16>.size))
    var sampleBits = UInt16(bitsPerSample).littleEndian
    data.append(Data(bytes: &sampleBits, count: MemoryLayout<UInt16>.size))

    data.append("data".data(using: .ascii)!)
    var payloadSize = UInt32(audioData.count).littleEndian
    data.append(Data(bytes: &payloadSize, count: MemoryLayout<UInt32>.size))
    data.append(audioData)

    return data
}

actor RelayCallAudioUploadCoordinator {
    private let callId: String
    private let sendChunk: @Sendable (RelayCallAudioChunk) async throws -> Void
    private var nextSequence = 0
    private var hasLoggedFirstChunk = false

    init(
        callId: String,
        sendChunk: @escaping @Sendable (RelayCallAudioChunk) async throws -> Void
    ) {
        self.callId = callId
        self.sendChunk = sendChunk
    }

    func upload(
        data: Data,
        mimeType: String,
        sampleRateHz: Int,
        channels: Int,
        durationMs: Int,
        uploadRevision: Int,
        duplexCoordinator: RelayCallDuplexCoordinator
    ) async {
        guard !data.isEmpty else {
            return
        }

        guard await duplexCoordinator.isUploadRevisionCurrent(uploadRevision) else {
            appendVoiceDebugLog(
                "voice-upload:drop-stale callId=\(callId) revision=\(uploadRevision)"
            )
            return
        }

        let sequence = nextSequence
        nextSequence += 1

        if !hasLoggedFirstChunk {
            hasLoggedFirstChunk = true
            appendVoiceDebugLog(
                "voice-upload:first-chunk callId=\(callId) bytes=\(data.count) sampleRateHz=\(sampleRateHz) channels=\(channels) durationMs=\(durationMs)"
            )
        }

        _ = try? await sendChunk(
            RelayCallAudioChunk(
                audioBase64: data.base64EncodedString(),
                mimeType: mimeType,
                sequence: sequence,
                sampleRateHz: sampleRateHz,
                channels: channels,
                durationMs: max(durationMs, 1)
            )
        )
    }
}

actor RelayCallDuplexCoordinator {
    private let callId: String
    private var suppressUploadsUntil: Date?
    private var queuedPlaybackEndsAt: Date?
    private var suppressedChunkCount = 0
    private var uploadRevision = 0

    init(callId: String) {
        self.callId = callId
    }

    func suppressMicrophoneCapture(
        playbackDurationMs: Int,
        reason: String,
        safetyPaddingMs: Int = 180
    ) {
        uploadRevision += 1
        let window = voiceUploadSuppressionWindow(
            now: Date(),
            queuedPlaybackEndsAt: queuedPlaybackEndsAt,
            playbackDurationMs: playbackDurationMs,
            safetyPaddingMs: safetyPaddingMs
        )
        queuedPlaybackEndsAt = window.playbackEndsAt
        suppressUploadsUntil = window.suppressUntil
        appendVoiceDebugLog(
            "voice-duplex:suppress callId=\(callId) reason=\(reason) playbackEndsAt=\(ISO8601DateFormatter().string(from: window.playbackEndsAt)) until=\(ISO8601DateFormatter().string(from: window.suppressUntil)) durationMs=\(playbackDurationMs)"
        )
    }

    func currentUploadRevision() -> Int {
        uploadRevision
    }

    func isUploadRevisionCurrent(_ revision: Int) -> Bool {
        revision == uploadRevision
    }

    func shouldUploadInputChunk() -> Bool {
        let now = Date()
        guard !shouldUploadVoiceInput(now: now, suppressUntil: suppressUploadsUntil) else {
            if suppressedChunkCount > 0 {
                appendVoiceDebugLog(
                    "voice-duplex:resume callId=\(callId) droppedChunks=\(suppressedChunkCount)"
                )
                suppressedChunkCount = 0
            }
            if let queuedPlaybackEndsAt, now >= queuedPlaybackEndsAt {
                self.queuedPlaybackEndsAt = nil
            }
            if let suppressUploadsUntil, now >= suppressUploadsUntil {
                self.suppressUploadsUntil = nil
            }
            return true
        }

        suppressedChunkCount += 1
        if suppressedChunkCount == 1, let suppressUploadsUntil {
            let remainingMs = Int(max(suppressUploadsUntil.timeIntervalSince(now) * 1000.0, 0))
            appendVoiceDebugLog(
                "voice-duplex:drop-input callId=\(callId) remainingMs=\(remainingMs)"
            )
        }
        return false
    }
}

actor RelayCallSpeechActivityGate {
    private let callId: String
    private let activationThreshold: Double
    private let holdDurationMs: Int
    private var activeUntil: Date?
    private var lastStateWasActive = false

    init(
        callId: String,
        activationThreshold: Double = 0.0065,
        holdDurationMs: Int = 520
    ) {
        self.callId = callId
        self.activationThreshold = activationThreshold
        self.holdDurationMs = holdDurationMs
    }

    func reset(reason: String) {
        activeUntil = nil
        if lastStateWasActive {
            appendVoiceDebugLog("voice-activity:reset callId=\(callId) reason=\(reason)")
        }
        lastStateWasActive = false
    }

    func shouldTransmit(audioData: Data, now: Date = Date()) -> Bool {
        let rms = normalizedPCM16MonoRMS(audioData: audioData)
        if rms >= activationThreshold {
            activeUntil = now.addingTimeInterval(Double(holdDurationMs) / 1000.0)
            if !lastStateWasActive {
                appendVoiceDebugLog(
                    "voice-activity:start callId=\(callId) rms=\(String(format: "%.4f", rms))"
                )
            }
            lastStateWasActive = true
            return true
        }

        if let activeUntil, now < activeUntil {
            return true
        }

        if lastStateWasActive {
            appendVoiceDebugLog(
                "voice-activity:idle callId=\(callId) rms=\(String(format: "%.4f", rms))"
            )
        }
        lastStateWasActive = false
        return false
    }
}

#if os(iOS)
final class LiveCallConnectedCuePlayer: NSObject, CallConnectedCuePlaying, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?

    func play() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try? session.setActive(true)

        let pcm = makeCallConnectedCuePCM16Mono(
            sampleRateHz: 24_000,
            durationMs: 160,
            frequencyHz: 1_120
        )
        let wave = makePCM16WaveData(audioData: pcm, sampleRateHz: 24_000, channels: 1)

        do {
            let player = try AVAudioPlayer(data: wave, fileTypeHint: AVFileType.wav.rawValue)
            player.delegate = self
            player.volume = 0.95
            player.prepareToPlay()
            player.play()
            self.player = player
            appendVoiceDebugLog("voice-cue:tone")
        } catch {
            self.player = nil
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        if self.player === player {
            self.player = nil
        }
    }

    func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        if self.player === player {
            self.player = nil
        }
    }
}

final class LiveRelayCallAudioStreamer: RelayCallAudioStreaming {
    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var uploadCoordinator: RelayCallAudioUploadCoordinator?
    private var duplexCoordinator: RelayCallDuplexCoordinator?
    private var speechActivityGate: RelayCallSpeechActivityGate?
    private var playbackTask: Task<Void, Never>?
    private var realtimeSocket: RelayCallRealtimeSocket?
    private var activeCallId: String?

    func start(callId: String, bridgeConfig: BridgeConfig) async throws -> RelayCallVoiceSessionStatus {
        appendVoiceDebugLog("voice-streamer:start callId=\(callId) baseURL=\(bridgeConfig.baseURL)")
        if activeCallId == callId {
            appendVoiceDebugLog("voice-streamer:reuse-active callId=\(callId)")
            return try await VoiceCallBridgeClient(config: bridgeConfig).voiceSession(callId: callId)
        }

        await stop()

        let client = VoiceCallBridgeClient(config: bridgeConfig)
        try await Self.ensureMicrophonePermission()
        let realtimeSocket = RelayCallRealtimeSocket()
        var status: RelayCallVoiceSessionStatus
        var usingRealtimeSocket = false
        do {
            status = try await realtimeSocket.start(
                callId: callId,
                bridgeConfig: bridgeConfig,
                onOutputChunk: { [weak self] chunk in
                    await self?.schedulePlayback(chunk: chunk)
                },
                onMessage: { message in
                    switch message {
                    case .transcriptFinal(let interaction):
                        appendVoiceDebugLog("voice-realtime:transcript callId=\(interaction.callId) text=\(interaction.text)")
                    case .assistantFinal(let interaction):
                        appendVoiceDebugLog("voice-realtime:assistant callId=\(interaction.callId) text=\(interaction.text)")
                    case .error(let message):
                        appendVoiceDebugLog("voice-realtime:error callId=\(callId) error=\(message)")
                    default:
                        break
                    }
                }
            )
            usingRealtimeSocket = true
            appendVoiceDebugLog("voice-streamer:transport callId=\(callId) mode=realtime-ws")
        } catch {
            appendVoiceDebugLog("voice-streamer:realtime-fallback callId=\(callId) error=\(error.localizedDescription)")
            status = try await client.voiceSession(callId: callId)
        }
        appendVoiceDebugLog(
            "voice-streamer:voice-session callId=\(callId) ready=\(status.ready) missing=\(status.missing.joined(separator: ","))"
        )
        guard status.ready else {
            let missing = status.missing.joined(separator: "、")
            throw BridgeClientError.server(
                missing.isEmpty
                    ? "桌面端语音会话还没准备好。"
                    : "桌面端语音会话尚未就绪，缺少：\(missing)"
            )
        }

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [
            .defaultToSpeaker,
            .allowBluetooth,
            .allowBluetoothA2DP,
        ])
        try? session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let inputNode = engine.inputNode
        let format = inputNode.inputFormat(forBus: 0)
        let uploadCoordinator = RelayCallAudioUploadCoordinator(
            callId: callId,
            sendChunk: { chunk in
                if usingRealtimeSocket {
                    try await realtimeSocket.sendAudioChunk(chunk)
                } else {
                    _ = try await client.uploadAudioChunk(
                        callId: callId,
                        chunk: chunk
                    )
                }
            }
        )
        let duplexCoordinator = RelayCallDuplexCoordinator(callId: callId)
        let speechActivityGate = RelayCallSpeechActivityGate(callId: callId)
        let playbackFormat = Self.makePlaybackFormat(sampleRateHz: 24_000, channels: 1)

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playbackFormat)

        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            let sourceSampleRateHz = Int(format.sampleRate.rounded())
            let targetSampleRateHz = 24_000
            let encoded = Self.encodePCM16Mono(buffer: buffer)
            let normalized = resamplePCM16Mono(
                audioData: encoded,
                fromSampleRateHz: sourceSampleRateHz,
                toSampleRateHz: targetSampleRateHz
            )
            let durationMs = Int((Double(normalized.count / MemoryLayout<Int16>.size) / Double(targetSampleRateHz)) * 1000.0)
            Task {
                let uploadRevision = await duplexCoordinator.currentUploadRevision()
                guard await duplexCoordinator.shouldUploadInputChunk() else {
                    return
                }
                _ = await speechActivityGate.shouldTransmit(audioData: normalized)
                await self.uploadCoordinator?.upload(
                    data: normalized,
                    mimeType: "audio/pcm",
                    sampleRateHz: targetSampleRateHz,
                    channels: 1,
                    durationMs: durationMs,
                    uploadRevision: uploadRevision,
                    duplexCoordinator: duplexCoordinator
                )
            }
        }

        engine.prepare()
        try engine.start()
        player.play()
        appendVoiceDebugLog("voice-streamer:engine-started callId=\(callId) sampleRateHz=\(Int(format.sampleRate.rounded()))")
        await speechActivityGate.reset(reason: "connect-cue")
        await duplexCoordinator.suppressMicrophoneCapture(
            playbackDurationMs: 600,
            reason: "connect-cue",
            safetyPaddingMs: 420
        )

        self.audioEngine = engine
        self.playerNode = player
        self.uploadCoordinator = uploadCoordinator
        self.duplexCoordinator = duplexCoordinator
        self.speechActivityGate = speechActivityGate
        self.realtimeSocket = usingRealtimeSocket ? realtimeSocket : nil
        self.activeCallId = callId
        if !usingRealtimeSocket {
            self.playbackTask = Task { [weak self] in
                await self?.runPlaybackLoop(callId: callId, client: client)
            }
        }
        return status
    }

    func stop() async {
        playbackTask?.cancel()
        playbackTask = nil
        audioEngine?.inputNode.removeTap(onBus: 0)
        playerNode?.stop()
        playerNode?.reset()
        playerNode = nil
        audioEngine?.stop()
        audioEngine = nil
        uploadCoordinator = nil
        duplexCoordinator = nil
        speechActivityGate = nil
        realtimeSocket?.stop()
        realtimeSocket = nil
        activeCallId = nil

        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        appendVoiceDebugLog("voice-streamer:stopped")
    }

    private func runPlaybackLoop(callId: String, client: VoiceCallBridgeClient) async {
        var nextSequence = -1

        while !Task.isCancelled {
            guard activeCallId == callId else {
                return
            }

            do {
                let envelope = try await client.outputAudio(callId: callId, afterSequence: nextSequence, limit: 12)
                if !envelope.chunks.isEmpty {
                    appendVoiceDebugLog(
                        "voice-playback:chunks callId=\(callId) count=\(envelope.chunks.count) nextSequence=\(envelope.chunks.last?.sequence ?? nextSequence)"
                    )
                }
                for chunk in envelope.chunks {
                    if chunk.sequence > nextSequence {
                        nextSequence = chunk.sequence
                    }
                    await schedulePlayback(chunk: chunk)
                }
                try? await Task.sleep(nanoseconds: envelope.chunks.isEmpty ? 180_000_000 : 25_000_000)
            } catch is CancellationError {
                return
            } catch {
                appendVoiceDebugLog("voice-playback:error callId=\(callId) error=\(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 350_000_000)
            }
        }
    }

    @MainActor
    private func schedulePlayback(chunk: RelayCallOutputAudioChunk) async {
        guard
            let playerNode,
            let buffer = Self.makePlaybackBuffer(from: chunk)
        else {
            return
        }

        let durationMs = chunk.durationMs ?? inferredPCM16MonoDurationMs(
            audioData: chunk.audioData,
            sampleRateHz: max(chunk.sampleRateHz ?? 24_000, 8_000),
            channels: max(chunk.channels ?? 1, 1)
        )
        await speechActivityGate?.reset(reason: "assistant-playback")
        await duplexCoordinator?.suppressMicrophoneCapture(
            playbackDurationMs: durationMs,
            reason: "assistant-playback",
            safetyPaddingMs: 1_600
        )

        playerNode.scheduleBuffer(buffer, completionHandler: nil)
        if !playerNode.isPlaying {
            playerNode.play()
        }
    }

    private static func encodePCM16Mono(buffer: AVAudioPCMBuffer) -> Data {
        let frameCount = Int(buffer.frameLength)
        guard frameCount > 0 else {
            return Data()
        }

        if let int16Channels = buffer.int16ChannelData {
            let channelCount = Int(buffer.format.channelCount)
            var data = Data(capacity: frameCount * MemoryLayout<Int16>.size)

            for frameIndex in 0 ..< frameCount {
                var mixedSample = Int32(0)
                for channelIndex in 0 ..< channelCount {
                    mixedSample += Int32(int16Channels[channelIndex][frameIndex])
                }
                let averaged = Int16(mixedSample / Int32(max(channelCount, 1)))
                var littleEndian = averaged.littleEndian
                data.append(Data(bytes: &littleEndian, count: MemoryLayout<Int16>.size))
            }

            return data
        }

        if let floatChannels = buffer.floatChannelData {
            let channelCount = Int(buffer.format.channelCount)
            var data = Data(capacity: frameCount * MemoryLayout<Int16>.size)

            for frameIndex in 0 ..< frameCount {
                var mixedSample: Float = 0
                for channelIndex in 0 ..< channelCount {
                    mixedSample += floatChannels[channelIndex][frameIndex]
                }
                mixedSample /= Float(max(channelCount, 1))
                let clamped = max(-1.0, min(1.0, mixedSample))
                let sample = Int16(clamped * Float(Int16.max))
                var littleEndian = sample.littleEndian
                data.append(Data(bytes: &littleEndian, count: MemoryLayout<Int16>.size))
            }

            return data
        }

        return Data()
    }

    private static func makePlaybackFormat(sampleRateHz: Int, channels: Int) -> AVAudioFormat {
        AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Double(sampleRateHz),
            channels: AVAudioChannelCount(max(channels, 1)),
            interleaved: false
        )!
    }

    private static func makePlaybackBuffer(from chunk: RelayCallOutputAudioChunk) -> AVAudioPCMBuffer? {
        makePlaybackBuffer(
            audioData: chunk.audioData,
            sampleRateHz: max(chunk.sampleRateHz ?? 24_000, 8_000),
            channels: max(chunk.channels ?? 1, 1)
        )
    }

    private static func makePlaybackBuffer(
        audioData: Data,
        sampleRateHz: Int,
        channels: Int
    ) -> AVAudioPCMBuffer? {
        guard !audioData.isEmpty else {
            return nil
        }

        guard channels == 1 else {
            return nil
        }

        let frameCount = audioData.count / MemoryLayout<Int16>.size
        guard frameCount > 0 else {
            return nil
        }

        let softenedAudioData = applyPCM16MonoEdgeFade(
            audioData: audioData,
            fadeFrameCount: min(max(frameCount / 24, 24), 160)
        )

        let format = makePlaybackFormat(sampleRateHz: sampleRateHz, channels: channels)
        guard
            let buffer = AVAudioPCMBuffer(
                pcmFormat: format,
                frameCapacity: AVAudioFrameCount(frameCount)
            ),
            let channelData = buffer.int16ChannelData
        else {
            return nil
        }

        buffer.frameLength = AVAudioFrameCount(frameCount)
        softenedAudioData.withUnsafeBytes { rawBuffer in
            let sampleBuffer = rawBuffer.bindMemory(to: Int16.self)
            guard let baseAddress = sampleBuffer.baseAddress else {
                return
            }
            channelData[0].update(from: baseAddress, count: frameCount)
        }
        return buffer
    }

    private static func ensureMicrophonePermission() async throws {
        switch await requestVoiceMicrophonePermission() {
        case .granted:
            return
        case .denied:
            throw BridgeClientError.server("请在 iPhone 设置里允许 AgentHub 使用麦克风。")
        case .needsRequest:
            throw BridgeClientError.server("无法确认麦克风权限，请重新尝试。")
        }
    }
}
#else
final class LiveCallConnectedCuePlayer: CallConnectedCuePlaying {
    func play() {}
}

final class LiveRelayCallAudioStreamer: RelayCallAudioStreaming {
    func start(callId: String, bridgeConfig: BridgeConfig) async throws -> RelayCallVoiceSessionStatus {
        throw BridgeClientError.server("当前平台暂不支持实时语音采集。")
    }

    func stop() async {}
}
#endif
