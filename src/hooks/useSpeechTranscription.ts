import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type AudioContextConstructor = new () => AudioContext;

declare global {
  interface Window {
    webkitAudioContext?: AudioContextConstructor;
  }
}

interface UseSpeechTranscriptionOptions {
  providerId?: string;
  onFinalSegment?: (segment: string) => void;
}

interface AudioTranscriptionResult {
  text: string;
  providerId: string;
  providerName: string;
  model: string;
}

interface SavedAudioClipResult {
  filePath: string;
  mimeType: string;
  byteLength: number;
}

export interface VoiceCaptureResult {
  transcript: string;
  audioClip: {
    filePath: string;
    mimeType: string;
    durationMs: number;
    byteLength: number;
  };
}

export type SpeechTranscriptionErrorCode =
  | "aborted"
  | "audio-capture"
  | "network"
  | "not-allowed"
  | "no-speech"
  | "service-not-allowed"
  | "transcription-failed"
  | "unsupported"
  | "unknown";

const AUDIO_BAND_COUNT = 5;
const DEFAULT_AUDIO_BANDS = Array.from({ length: AUDIO_BAND_COUNT }, () => 0);

function getAudioContextConstructor() {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

function getPreferredRecorderMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;

  const preferred = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  return preferred.find((mimeType) => MediaRecorder.isTypeSupported?.(mimeType)) ?? null;
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

export function useSpeechTranscription(options: UseSpeechTranscriptionOptions = {}) {
  const { providerId = "bigmodel", onFinalSegment } = options;
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioBandsRef = useRef<number[]>(DEFAULT_AUDIO_BANDS);
  const chunksRef = useRef<Blob[]>([]);
  const recordedMimeTypeRef = useRef("audio/webm");
  const recordingStartedAtRef = useRef<number | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBands, setAudioBands] = useState<number[]>(DEFAULT_AUDIO_BANDS);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<SpeechTranscriptionErrorCode | null>(null);

  const supported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      window.navigator.mediaDevices &&
        typeof window.navigator.mediaDevices.getUserMedia === "function" &&
        typeof MediaRecorder !== "undefined",
    );
  }, []);

  const clearError = useCallback(() => {
    setLastError(null);
    setLastErrorCode(null);
  }, []);

  const cleanupAudioMeter = useCallback(async () => {
    if (meterFrameRef.current !== null) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    analyserRef.current?.disconnect();
    analyserRef.current = null;

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // Ignore already-closed contexts.
      }
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setAudioLevel(0);
    audioBandsRef.current = DEFAULT_AUDIO_BANDS;
    setAudioBands(DEFAULT_AUDIO_BANDS);
  }, []);

  const ensureCaptureStream = useCallback(async () => {
    if (mediaStreamRef.current) {
      return mediaStreamRef.current;
    }

    const AudioCtx = getAudioContextConstructor();
    if (!window.navigator.mediaDevices?.getUserMedia || !AudioCtx) {
      setLastError("当前环境还不支持麦克风输入。");
      setLastErrorCode("unsupported");
      return null;
    }

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioCtx();
      if (context.state === "suspended") {
        await context.resume();
      }

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.42;
      source.connect(analyser);

      const timeDomainSamples = new Uint8Array(analyser.fftSize);
      const frequencySamples = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;

        analyser.getByteTimeDomainData(timeDomainSamples);
        analyser.getByteFrequencyData(frequencySamples);

        let total = 0;
        for (let index = 0; index < timeDomainSamples.length; index += 1) {
          const normalized = (timeDomainSamples[index] - 128) / 128;
          total += normalized * normalized;
        }

        const rms = Math.sqrt(total / timeDomainSamples.length);
        const activeFrequencyBins = Math.min(frequencySamples.length, 80);
        const nextBands = Array.from({ length: AUDIO_BAND_COUNT }, (_, bandIndex) => {
          const start = Math.floor((bandIndex * activeFrequencyBins) / AUDIO_BAND_COUNT);
          const end = Math.max(start + 1, Math.floor(((bandIndex + 1) * activeFrequencyBins) / AUDIO_BAND_COUNT));
          let bandTotal = 0;
          for (let index = start; index < end; index += 1) {
            bandTotal += frequencySamples[index] ?? 0;
          }
          const average = bandTotal / Math.max(1, end - start);
          return Math.min(1, (average / 255) * 2.8);
        });

        const peakBand = Math.max(...nextBands, 0);
        const nextLevel = Math.min(1, Math.max(rms * 7.2, peakBand * 0.95));

        setAudioLevel((current) => current * 0.28 + nextLevel * 0.72);
        setAudioBands((current) => {
          const shaped = current.map((value, index) => value * 0.24 + nextBands[index] * 0.76);
          audioBandsRef.current = shaped;
          return shaped;
        });

        meterFrameRef.current = window.requestAnimationFrame(tick);
      };

      mediaStreamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      meterFrameRef.current = window.requestAnimationFrame(tick);
      return stream;
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setLastError(
        denied ? "当前没有麦克风权限，请在系统设置里允许 AgentHub 使用麦克风。" : "没有检测到可用麦克风。",
      );
      setLastErrorCode(denied ? "not-allowed" : "audio-capture");
      await cleanupAudioMeter();
      return null;
    }
  }, [cleanupAudioMeter]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
      void cleanupAudioMeter();
    };
  }, [cleanupAudioMeter]);

  const startListening = useCallback(async () => {
    if (!supported) {
      setLastError("当前环境不支持语音输入。");
      setLastErrorCode("unsupported");
      return false;
    }

    if (isListening || isTranscribing) {
      return false;
    }

    clearError();
    setInterimTranscript("");

    const stream = await ensureCaptureStream();
    if (!stream) return false;

    chunksRef.current = [];
    recordingStartedAtRef.current = performance.now();

    let recorder: MediaRecorder;
    try {
      const mimeType = getPreferredRecorderMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
    } catch (error) {
      console.error("Failed to create media recorder:", error);
      setLastError("录音器没有成功启动。");
      setLastErrorCode("unsupported");
      await cleanupAudioMeter();
      return false;
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("Media recorder error:", event);
      setLastError("录音过程中出现异常，请重试。");
      setLastErrorCode("audio-capture");
    };

    recorderRef.current = recorder;

    try {
      recorder.start(160);
      setIsListening(true);
      return true;
    } catch (error) {
      console.error("Failed to start media recorder:", error);
      recorderRef.current = null;
      setLastError("录音没有成功启动。");
      setLastErrorCode("unknown");
      await cleanupAudioMeter();
      return false;
    }
  }, [clearError, cleanupAudioMeter, ensureCaptureStream, isListening, isTranscribing, supported]);

  const stopListening = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      await cleanupAudioMeter();
      return null;
    }

    if (isTranscribing) {
      return null;
    }

    setIsListening(false);
    setInterimTranscript("正在转写...");
    const durationMs = Math.max(
      0,
      Math.round(performance.now() - (recordingStartedAtRef.current ?? performance.now())),
    );

    const recordedBlob = await new Promise<Blob>((resolve, reject) => {
      const finish = () => {
        resolve(new Blob(chunksRef.current, { type: recordedMimeTypeRef.current || "audio/webm" }));
      };

      if (recorder.state === "inactive") {
        finish();
        return;
      }

      recorder.addEventListener("stop", finish, { once: true });
      recorder.addEventListener(
        "error",
        () => {
          reject(new Error("录音意外中断。"));
        },
        { once: true },
      );

      try {
        recorder.requestData();
      } catch {
        // Ignore requestData support differences.
      }

      recorder.stop();
    });

    recorderRef.current = null;
    await cleanupAudioMeter();

    if (recordedBlob.size === 0) {
      setInterimTranscript("");
      setLastError("没有录到有效声音，请再试一次。");
      setLastErrorCode("no-speech");
      chunksRef.current = [];
      recordingStartedAtRef.current = null;
      return null;
    }

    setIsTranscribing(true);

    try {
      const audioBase64 = await blobToBase64(recordedBlob);
      const mimeType = recordedMimeTypeRef.current || recordedBlob.type || "audio/webm";
      const [savedClip, result] = await Promise.all([
        invoke<SavedAudioClipResult>("save_audio_clip", {
          payload: {
            audioBase64,
            mimeType,
          },
        }),
        invoke<AudioTranscriptionResult>("transcribe_audio_clip", {
          payload: {
            audioBase64,
            mimeType,
            providerId,
          },
        }),
      ]);
      const transcript = result.text.trim();

      if (!transcript) {
        throw new Error("语音转写没有返回内容。");
      }

      onFinalSegment?.(transcript);
      setInterimTranscript("");
      chunksRef.current = [];
      return {
        transcript,
        audioClip: {
          filePath: savedClip.filePath,
          mimeType: savedClip.mimeType,
          durationMs,
          byteLength: savedClip.byteLength,
        },
      };
    } catch (error) {
      console.error("Failed to transcribe recorded audio:", error);
      setLastError(`语音转写失败：${error instanceof Error ? error.message : String(error)}`);
      setLastErrorCode("transcription-failed");
      setInterimTranscript("");
      chunksRef.current = [];
      return null;
    } finally {
      setIsTranscribing(false);
      recordingStartedAtRef.current = null;
    }
  }, [cleanupAudioMeter, isTranscribing, onFinalSegment, providerId]);

  return {
    supported,
    isListening,
    isTranscribing,
    interimTranscript,
    audioLevel,
    audioBands,
    lastError,
    lastErrorCode,
    startListening,
    stopListening,
    clearError,
  };
}
