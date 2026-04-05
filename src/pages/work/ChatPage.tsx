import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Mic, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { MessageBlocksRenderer } from "@/components/chat/MessageBlocksRenderer";
import { extractFileRefs, filterMeaningfulFileRefs } from "@/lib/chat/file-refs.js";
import { parseMessageContent } from "@/lib/chat/message-blocks";
import { isNearBottom } from "@/lib/chat/scroll-position.js";
import { getRuntimeAdapter, getRuntimeSessionMode, usesNativeRuntimeSession } from "@/lib/runtime";
import type { MessagePart, RuntimeMessageMetadata } from "@/lib/types/chat";
import type { RuntimeStreamEvent } from "@/lib/runtime/types";
import { cn } from "@/lib/utils";
import type { AgentSessionRef, HandoffPacket, TaskBoard, TaskEvent, ThreadBundle } from "@/lib/types/collaboration";
import { useSpeechTranscription } from "@/hooks/useSpeechTranscription";
import { useAgentsStore } from "@/stores/agents-store";
import { useCollaborationStore } from "@/stores/collaboration-store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  rawText?: string;
  parts: MessagePart[];
  agent: string;
  metadata?: RuntimeMessageMetadata;
  timestamp: number;
  audioClip?: AudioClipAttachment;
}

interface AudioClipAttachment {
  filePath: string;
  mimeType: string;
  durationMs: number;
  byteLength?: number;
  transcript?: string;
}

const DRAFT_BUCKET = "__draft__";
const MESSAGE_MARKDOWN_CLASS =
  "prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed " +
  "[&_p]:my-1 [&_p]:text-[13px] [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 " +
  "[&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:rounded " +
  "[&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0";

function formatThreadTitle(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return `新任务线 ${new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

function formatMessageTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatAudioDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function shouldShowComposerPreview(source: string) {
  const trimmed = source.trim();
  if (!trimmed) return false;

  if (source.includes("\n")) return true;

  return /(^|\s)([#>*`-]|\d+\.)/.test(source);
}

function parseAgentSwitchCommand(source: string) {
  const trimmed = source.trim();
  if (!trimmed.startsWith("/agent")) return null;

  const rawTarget = trimmed.replace(/^\/agent\b/i, "").trim();
  const target = rawTarget.startsWith("->") ? rawTarget.slice(2).trim() : rawTarget;

  return {
    target,
  };
}

function findAgentByCommand(target: string, agents: Array<{ id: string; name: string }>) {
  const normalized = target.trim().toLowerCase();
  if (!normalized) return null;

  const exact = agents.find(
    (agent) => agent.id.toLowerCase() === normalized || agent.name.toLowerCase() === normalized,
  );
  if (exact) return exact;

  return (
    agents.find(
      (agent) =>
        agent.id.toLowerCase().includes(normalized) || agent.name.toLowerCase().includes(normalized),
    ) ?? null
  );
}

function formatContextPrompt(
  packet: HandoffPacket,
  taskTitles: string[],
  includeRecentContext: boolean,
) {
  const keyFiles = filterMeaningfulFileRefs(packet.key_files);
  const sections = [
    packet.summary ? `共享备注：\n${packet.summary}` : "",
    includeRecentContext && packet.recent_context.length
      ? `最近往来：\n- ${packet.recent_context.join("\n- ")}`
      : "",
    packet.open_questions.length ? `未解决问题：\n- ${packet.open_questions.join("\n- ")}` : "",
    keyFiles.length ? `关键文件：\n- ${keyFiles.join("\n- ")}` : "",
    taskTitles.length ? `当前相关子任务：\n- ${taskTitles.join("\n- ")}` : "",
    `用户消息：\n${packet.latest_user_message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return sections;
}

function shouldSyncNativeBoard(session: AgentSessionRef | undefined, boardVersion: number) {
  if (!session) return false;
  return session.last_seen_board_version < boardVersion;
}

function compactText(text: string, maxLength: number) {
  const normalized = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildBoardUpdate(
  board: TaskBoard,
  params: {
    userContent: string;
    response: string;
  },
) {
  const userSnippet = compactText(params.userContent, 72);
  const mergedFiles = filterMeaningfulFileRefs([
    ...board.key_files,
    ...extractFileRefs(params.userContent, params.response),
  ]).slice(0, 8);

  return {
    ...board,
    current_focus: userSnippet || board.current_focus,
    key_files: mergedFiles,
  };
}

function buildMessagesFromEvents(events: TaskEvent[]): Message[] {
  return [...events]
    .filter((event) => event.event_type === "user_message" || event.event_type === "assistant_message")
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((event) => {
      const payload = event.payload ?? {};
      const audioPayload =
        event.event_type === "user_message" && payload.audioClip && typeof payload.audioClip === "object"
          ? (payload.audioClip as Record<string, unknown>)
          : null;
      const audioClip =
        audioPayload &&
        typeof audioPayload.filePath === "string" &&
        typeof audioPayload.mimeType === "string"
          ? {
              filePath: audioPayload.filePath,
              mimeType: audioPayload.mimeType,
              durationMs:
                typeof audioPayload.durationMs === "number"
                  ? audioPayload.durationMs
                  : Number(audioPayload.durationMs ?? 0),
              byteLength:
                typeof audioPayload.byteLength === "number"
                  ? audioPayload.byteLength
                  : Number(audioPayload.byteLength ?? 0),
              transcript:
                typeof audioPayload.transcript === "string" ? audioPayload.transcript : undefined,
            }
          : undefined;
      const rawText =
        event.event_type === "assistant_message" && typeof payload.rawText === "string"
          ? payload.rawText
          : event.body ?? "";
      const parsed = parseMessageContent(rawText);

      return {
        id: event.id,
        role: event.event_type === "user_message" ? "user" : "assistant",
        content:
          event.event_type === "assistant_message"
            ? parsed.text
            : audioClip
              ? audioClip.transcript || event.body || "语音消息"
              : event.body ?? "",
        rawText: event.event_type === "assistant_message" ? parsed.rawText : undefined,
        parts:
          event.event_type === "assistant_message"
            ? parsed.parts
            : [{ type: "text", content: event.body ?? "" }],
        agent: event.agent_id ?? "",
        metadata:
          event.event_type === "assistant_message" && payload.metadata && typeof payload.metadata === "object"
            ? (payload.metadata as RuntimeMessageMetadata)
            : undefined,
        timestamp: Number.isNaN(Date.parse(event.created_at)) ? Date.now() : Date.parse(event.created_at),
        audioClip,
      };
    });
}

function plainTextForSpeech(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVoiceDraft(base: string, committed: string, interim = "") {
  return [base.trim(), committed.trim(), interim.trim()].filter(Boolean).join(" ").trim();
}

function VoiceLevelIndicator({ level, bands }: { level: number; bands?: number[] }) {
  const visualBands =
    bands && bands.length > 0
      ? bands
      : [0.34, 0.58, 0.86, 0.58, 0.34].map((base, index) => Math.min(1, base + level * (0.9 - index * 0.08)));

  return (
    <span className="inline-flex h-4 items-end gap-[2px]" aria-hidden="true">
      {visualBands.map((value, index) => (
        <span
          key={index}
          className="w-[2px] rounded-full bg-emerald-600/90 transition-[height,opacity] duration-75"
          style={{
            height: `${4 + Math.max(0.08, value) * 13}px`,
            opacity: 0.42 + Math.max(level, value) * 0.58,
          }}
        />
      ))}
    </span>
  );
}

function AudioMessageBubble({ clip, align }: { clip: AudioClipAttachment; align: "left" | "right" }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadedDurationMs, setLoadedDurationMs] = useState(clip.durationMs);
  const audioUrl = convertFileSrc(clip.filePath);
  const totalDurationMs = loadedDurationMs > 0 ? loadedDurationMs : clip.durationMs;
  const barHeights = [0.36, 0.62, 0.86, 0.54, 0.48, 0.92, 0.44, 0.7, 0.58, 0.82, 0.4, 0.66];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncProgress = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(1, audio.currentTime / audio.duration));
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setLoadedDurationMs(Math.round(audio.duration * 1000));
      }
      syncProgress();
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(1);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", syncProgress);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", syncProgress);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play().catch((error) => {
        console.error("Failed to play audio clip:", error);
      });
    } else {
      audio.pause();
    }
  };

  return (
    <button
      type="button"
      onClick={togglePlayback}
      className={cn(
        "group flex w-[260px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
        align === "right"
          ? "border-emerald-400/15 bg-emerald-500/10 text-emerald-950/90"
          : "border-border/60 bg-background/70 text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          align === "right" ? "bg-emerald-600 text-white" : "bg-foreground/10 text-foreground",
        )}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} className="translate-x-[1px]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="relative flex h-9 items-end gap-[3px] overflow-hidden rounded-xl bg-black/5 px-2 py-1.5">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-xl transition-[width] duration-150",
              align === "right" ? "bg-emerald-500/18" : "bg-foreground/8",
            )}
            style={{ width: `${Math.max(6, progress * 100)}%` }}
          />
          {barHeights.map((height, index) => (
            <span
              key={index}
              className={cn(
                "relative z-[1] w-[3px] rounded-full",
                align === "right" ? "bg-emerald-600/80" : "bg-foreground/55",
              )}
              style={{ height: `${10 + height * 15}px` }}
            />
          ))}
        </span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {formatAudioDuration(totalDurationMs)}
      </span>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
    </button>
  );
}

interface SendPayload {
  displayText?: string;
  runtimeText: string;
  audioClip?: AudioClipAttachment;
}

export default function ChatPage() {
  const { agents } = useAgentsStore();
  const {
    threads,
    selectedThreadId: storeSelectedThreadId,
    currentBundle,
    bundleLoading,
    loadThreads,
    selectThread,
    createThread,
    setPrimaryAgent,
    saveBoard,
  } = useCollaborationStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState("");
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceBaseInputRef = useRef("");
  const voiceAutoSendRef = useRef(false);
  const voicePendingReplyRef = useRef(false);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const {
    supported: voiceInputSupported,
    isListening,
    isTranscribing,
    audioLevel,
    audioBands,
    lastError: voiceError,
    lastErrorCode: voiceErrorCode,
    startListening,
    stopListening,
    clearError: clearVoiceError,
  } = useSpeechTranscription();

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const requestedAgentId = searchParams.get("agent") ?? "";
  const requestedThreadId = searchParams.get("thread") ?? "";
  const requestedDraft = searchParams.get("draft") ?? "";
  const activeAgents = agents.filter((item) => item.running);
  const visibleAgents = activeAgents.length > 0 ? activeAgents : agents;

  const fallbackThreadId = threads.some((thread) => thread.id === storeSelectedThreadId)
    ? storeSelectedThreadId ?? ""
    : threads[0]?.id ?? "";
  const selectedThreadId = threads.some((thread) => thread.id === requestedThreadId)
    ? requestedThreadId
    : fallbackThreadId;
  const currentThread = threads.find((thread) => thread.id === selectedThreadId);

  const fallbackAgentId =
    visibleAgents.find((item) => item.id === "dolphin")?.id ||
    (currentThread?.primary_agent_id &&
    visibleAgents.some((item) => item.id === currentThread.primary_agent_id)
      ? currentThread.primary_agent_id
      : null) ||
    visibleAgents[0]?.id ||
    "";
  const selectedAgentId = visibleAgents.some((item) => item.id === requestedAgentId)
    ? requestedAgentId
    : fallbackAgentId;

  const activeBucket = selectedThreadId || DRAFT_BUCKET;
  const messages = messageMap[activeBucket] ?? [];
  const agent = visibleAgents.find((item) => item.id === selectedAgentId);
  const currentSession = currentBundle?.sessions.find((session) => session.agent_id === selectedAgentId);

  useEffect(() => {
    if (!selectedAgentId || requestedAgentId === selectedAgentId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("agent", selectedAgentId);
    setSearchParams(nextParams, { replace: true });
  }, [requestedAgentId, searchParams, selectedAgentId, setSearchParams]);

  useEffect(() => {
    if (selectedThreadId && requestedThreadId !== selectedThreadId) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("thread", selectedThreadId);
      setSearchParams(nextParams, { replace: true });
    }
  }, [requestedThreadId, searchParams, selectedThreadId, setSearchParams]);

  useEffect(() => {
    if (!selectedThreadId) return;
    if (storeSelectedThreadId === selectedThreadId && currentBundle?.thread.id === selectedThreadId) return;
    void selectThread(selectedThreadId);
  }, [currentBundle?.thread.id, selectThread, selectedThreadId, storeSelectedThreadId]);

  useEffect(() => {
    if (!requestedDraft) return;
    setInput(requestedDraft);
    inputRef.current?.focus();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("draft");
    setSearchParams(nextParams, { replace: true });
  }, [requestedDraft, searchParams, setSearchParams]);

  useEffect(() => {
    shouldStickToBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [selectedThreadId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!voiceError) return;
    const canOpenMicSettings = voiceErrorCode === "not-allowed" || voiceErrorCode === "service-not-allowed";

    if (canOpenMicSettings) {
      void invoke<boolean>("prompt_open_microphone_settings").catch((error) => {
        console.error("Failed to show native microphone settings dialog:", error);
        toast.error("没能弹出系统权限提示，请手动前往“隐私与安全性 -> 麦克风”。");
      });
    } else {
      toast.error(voiceError);
    }
    clearVoiceError();
  }, [clearVoiceError, voiceError, voiceErrorCode]);

  useEffect(() => {
    if (!currentBundle) return;
    const restoredMessages = buildMessagesFromEvents(currentBundle.events);
    setMessageMap((prev) => ({
      ...prev,
      [currentBundle.thread.id]: restoredMessages,
    }));
  }, [currentBundle]);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    lastSpokenMessageIdRef.current = lastAssistant?.id ?? null;
    voicePendingReplyRef.current = false;
    voiceBaseInputRef.current = "";
    voiceAutoSendRef.current = false;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
  }, [selectedThreadId]);

  useEffect(() => {
    const synthesis = typeof window !== "undefined" ? window.speechSynthesis : null;
    const lastMessage = [...messages].reverse().find((message) => message.role === "assistant");
    if (!lastMessage) return;
    if (lastSpokenMessageIdRef.current === lastMessage.id) return;

    const shouldSpeak = voiceReplyEnabled || voicePendingReplyRef.current;
    if (!shouldSpeak || !synthesis) return;

    const speechText = plainTextForSpeech(lastMessage.rawText || lastMessage.content);
    if (!speechText) return;

    synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    utterance.pitch = 1;
    synthesis.speak(utterance);
    lastSpokenMessageIdRef.current = lastMessage.id;
    voicePendingReplyRef.current = false;
  }, [messages, voiceReplyEnabled]);

  const updateParams = (next: { agentId?: string; threadId?: string | null }) => {
    const params = new URLSearchParams(searchParams);
    if (next.agentId) {
      params.set("agent", next.agentId);
    }
    if (next.threadId === null) {
      params.delete("thread");
    } else if (next.threadId) {
      params.set("thread", next.threadId);
    }
    setSearchParams(params, { replace: true });
  };

  const appendMessage = (threadId: string, message: Message) => {
    setMessageMap((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), message],
    }));
  };

  const updateMessage = (threadId: string, messageId: string, updater: (message: Message) => Message) => {
    setMessageMap((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }));
  };

  const removeMessage = (threadId: string, messageId: string) => {
    setMessageMap((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).filter((message) => message.id !== messageId),
    }));
  };

  const persistChatSnapshot = async (params: {
    threadId: string;
    role: Message["role"];
    agentId: string;
    agentName: string;
    content: string;
    timestamp: number;
  }) => {
    if (!params.content.trim()) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("append_chat_memory_record", {
        threadId: params.threadId,
        agentId: params.agentId,
        role: params.role,
        content: params.content.trim(),
        timestamp: new Date(params.timestamp).toISOString(),
      });
    } catch (error) {
      console.error("Failed to persist chat snapshot to memory provider:", error);
    }
  };

  const ensureThreadForChat = async (seedText: string) => {
    if (selectedThreadId) return selectedThreadId;
    const bundle = await createThread({
      title: formatThreadTitle(seedText),
      goal: seedText.trim(),
      primaryAgentId: selectedAgentId || undefined,
    });
    updateParams({ threadId: bundle.thread.id, agentId: selectedAgentId });
    return bundle.thread.id;
  };

  const handleAgentChange = async (agentId: string) => {
    updateParams({ agentId, threadId: selectedThreadId || null });
    inputRef.current?.focus();

    if (!selectedThreadId) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const session = await invoke<{ id: string }>("ensure_thread_session", {
        threadId: selectedThreadId,
        agentId,
        mode: getRuntimeSessionMode(visibleAgents.find((item) => item.id === agentId) ?? null),
        runtimeSessionId: null,
      });
      await invoke("record_thread_event", {
        threadId: selectedThreadId,
        eventType: "agent_selected",
        title: `切换到 ${agentId}`,
        body: "聊天页已切换当前接手 Agent。",
        agentId,
        sessionId: session.id,
        taskId: null,
        payload: null,
      });
      if (currentThread?.primary_agent_id !== agentId) {
        await setPrimaryAgent(selectedThreadId, agentId);
      }
      await selectThread(selectedThreadId);
    } catch (error) {
      console.error("Failed to switch agent session:", error);
    }
  };

  const send = async (override?: string | SendPayload) => {
    const payload =
      typeof override === "string"
        ? { runtimeText: override, displayText: override }
        : override ?? { runtimeText: input, displayText: input };
    const runtimeText = payload.runtimeText.trim();
    const displayText = (payload.displayText ?? payload.runtimeText).trim();
    const threadSeed = runtimeText || displayText;
    if (!runtimeText || !selectedAgentId || sending) return;
    shouldStickToBottomRef.current = true;
    const switchCommand = payload.audioClip ? null : parseAgentSwitchCommand(runtimeText);
    if (switchCommand) {
      const nextAgent = findAgentByCommand(switchCommand.target, visibleAgents);
      if (!switchCommand.target) {
        toast.message(`可切换到：${visibleAgents.map((item) => item.name).join(" / ")}`);
        return;
      }
      if (!nextAgent) {
        toast.error(`没有找到 Agent：${switchCommand.target}`);
        return;
      }
      setInput("");
      await handleAgentChange(nextAgent.id);
      toast.success(`已切换到 ${nextAgent.name}`);
      return;
    }

    const threadId = await ensureThreadForChat(threadSeed);
    const userContent = runtimeText;
    const previousAgentId = messages[messages.length - 1]?.agent ?? null;
    const agentName = agent?.name || selectedAgentId;
    if (!agent) {
      toast.error("当前 Agent 不可用");
      return;
    }

    const runtime = getRuntimeAdapter(agent);
    const runtimeUsesNativeSession = usesNativeRuntimeSession(agent);
    const runtimeMode = getRuntimeSessionMode(agent);
    const requestId = runtime.capabilities.streaming_output ? crypto.randomUUID() : null;
    const streamingAssistantId = requestId ? `stream-${requestId}` : null;
    const currentBoardVersion = currentBundle?.board.version ?? 1;
    const needsNativeBootstrap = runtimeUsesNativeSession && !currentSession?.last_handoff_version;
    const needsNativeBoardSync = runtimeUsesNativeSession && shouldSyncNativeBoard(currentSession, currentBoardVersion);
    const isAgentSwitch = Boolean(previousAgentId && previousAgentId !== selectedAgentId);
    const needsSharedContext = !runtimeUsesNativeSession || isAgentSwitch || needsNativeBootstrap || needsNativeBoardSync;
    const includeRecentContext = !runtimeUsesNativeSession || isAgentSwitch || needsNativeBootstrap;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayText || userContent,
      parts: [{ type: "text", content: displayText || userContent }],
      agent: selectedAgentId,
      timestamp: Date.now(),
      audioClip: payload.audioClip,
    };

    appendMessage(threadId, userMsg);
    if (streamingAssistantId) {
      appendMessage(threadId, {
        id: streamingAssistantId,
        role: "assistant",
        content: "",
        rawText: "",
        parts: [{ type: "text", content: "" }],
        agent: selectedAgentId,
        timestamp: Date.now(),
      });
    }
    setInput("");
    setSending(true);
    setSendingLabel(
      isAgentSwitch || needsNativeBootstrap || needsNativeBoardSync || !runtimeUsesNativeSession
        ? `${agentName} 正在思考...`
        : `${agentName} 正在回复...`,
    );

    let stopStreamListener: (() => void) | null = null;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (requestId && streamingAssistantId) {
        stopStreamListener = await listen<RuntimeStreamEvent>("agenthub://runtime-stream", (event) => {
          if (event.payload.requestId !== requestId) return;

          const partialRawText = event.payload.rawText || "";
          if (partialRawText.trim()) {
            setSendingLabel("");
          }
          const parsedPartial = parseMessageContent(partialRawText);

          updateMessage(threadId, streamingAssistantId, (message) => ({
            ...message,
            content: parsedPartial.text || partialRawText,
            rawText: partialRawText,
            parts: parsedPartial.parts,
          }));
        });
      }

      const session = await invoke<{ id: string }>("ensure_thread_session", {
        threadId,
        agentId: selectedAgentId,
        mode: runtimeMode,
        runtimeSessionId: currentSession?.runtime_session_id ?? null,
      });

      await invoke("record_thread_event", {
        threadId,
        eventType: "user_message",
        title: "用户发来新消息",
        body: userContent,
        agentId: selectedAgentId,
        sessionId: session.id,
        taskId: null,
        payload: payload.audioClip
          ? {
              audioClip: {
                filePath: payload.audioClip.filePath,
                mimeType: payload.audioClip.mimeType,
                durationMs: payload.audioClip.durationMs,
                byteLength: payload.audioClip.byteLength ?? 0,
                transcript: userContent,
              },
            }
          : null,
      });

      void persistChatSnapshot({
        threadId,
        role: "user",
        agentId: selectedAgentId,
        agentName,
        content: userContent,
        timestamp: userMsg.timestamp,
      });

      const handoff = needsSharedContext
        ? await invoke<HandoffPacket>("create_handoff_packet", {
            threadId,
            toAgentId: selectedAgentId,
            latestUserMessage: userContent,
            fromAgentId: previousAgentId,
          })
        : null;

      const bundleTasks = handoff
        ? currentBundle?.tasks
            .filter((task) => handoff.selected_task_ids.includes(task.id))
            .map((task) => task.title) ?? []
        : [];

      if (handoff && runtimeUsesNativeSession && (isAgentSwitch || needsNativeBootstrap || needsNativeBoardSync)) {
        await invoke("record_thread_event", {
          threadId,
          eventType: "handoff_generated",
          title: `已生成 handoff：${selectedAgentId}`,
          body: `基于 Board v${handoff.board_version} 为当前 Agent 生成共享上下文。`,
          agentId: selectedAgentId,
          sessionId: session.id,
          taskId: null,
          payload: {
            boardVersion: handoff.board_version,
            includeRecentContext,
            selectedTaskIds: handoff.selected_task_ids,
          },
        });
      }

      const basePrompt = payload.audioClip
        ? `用户发送了一段语音消息（时长 ${formatAudioDuration(payload.audioClip.durationMs)}）。以下是系统转写内容：\n${userContent}`
        : userContent;
      const runtimePrompt = handoff
        ? formatContextPrompt(
            {
              ...handoff,
              latest_user_message: basePrompt,
            },
            bundleTasks,
            includeRecentContext,
          )
        : basePrompt;

      const runtimeResult = await runtime.sendMessage({
        agent,
        threadId,
        agentId: selectedAgentId,
        prompt: runtimePrompt,
        runtimeSessionId: currentSession?.runtime_session_id ?? null,
        requestId,
      });
      const parsedResponse = parseMessageContent(runtimeResult.rawText);
      const response = parsedResponse.text || runtimeResult.rawText;
      const runtimeSessionId = runtimeResult.runtimeSessionId;

      const assistantTimestamp = Date.now();
      const assistantMessage: Message = {
        id: streamingAssistantId ?? crypto.randomUUID(),
        role: "assistant",
        content: response,
        rawText: runtimeResult.rawText,
        parts: parsedResponse.parts,
        agent: selectedAgentId,
        metadata: runtimeResult.metadata,
        timestamp: assistantTimestamp,
      };

      if (streamingAssistantId) {
        updateMessage(threadId, streamingAssistantId, () => assistantMessage);
      } else {
        appendMessage(threadId, assistantMessage);
      }

      void persistChatSnapshot({
        threadId,
        role: "assistant",
        agentId: selectedAgentId,
        agentName,
        content: response.trim() || runtimeResult.rawText.trim(),
        timestamp: assistantTimestamp,
      });

      await invoke("record_thread_event", {
        threadId,
        eventType: "assistant_message",
        title: `${agentName} 已回复`,
        body: response,
        agentId: selectedAgentId,
        sessionId: session.id,
        taskId: null,
        payload: {
          rawText: runtimeResult.rawText,
          blocks: parsedResponse.blocks,
          metadata: runtimeResult.metadata ?? null,
        },
      });

      const latestBundle = await invoke<ThreadBundle>("get_thread_bundle", { threadId });
      const nextBoard = buildBoardUpdate(latestBundle.board, {
        userContent,
        response,
      });
      await saveBoard(nextBoard);
      const refreshedBundle = await invoke<ThreadBundle>("get_thread_bundle", { threadId });
      await invoke("update_thread_session", {
        threadId,
        agentId: selectedAgentId,
        runtimeSessionId,
        mode: runtimeMode,
        status: "idle",
        lastSeenBoardVersion: refreshedBundle.board.version,
        lastHandoffVersion: handoff?.board_version ?? currentSession?.last_handoff_version ?? 0,
      });

      await selectThread(threadId);
    } catch (error) {
      if (streamingAssistantId) {
        removeMessage(threadId, streamingAssistantId);
      }
      voicePendingReplyRef.current = false;
      toast.error(`发送失败: ${error}`);
    } finally {
      stopStreamListener?.();
      setSending(false);
      setSendingLabel("");
      inputRef.current?.focus();
    }
  };

  const showComposerPreview = shouldShowComposerPreview(input);
  const agentSwitchCommand = parseAgentSwitchCommand(input);
  const canSpeakReply =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  const toggleVoiceInput = async () => {
    if (isListening) {
      const shouldAutoSend = voiceAutoSendRef.current;
      voiceAutoSendRef.current = false;
      const capture = await stopListening();
      const transcript = capture?.transcript.trim() ?? "";
      const finalDraft = buildVoiceDraft(voiceBaseInputRef.current, transcript);
      voiceBaseInputRef.current = "";

      if (!capture) {
        if (!shouldAutoSend) {
          setInput(finalDraft);
        }
        return;
      }

      if (shouldAutoSend && transcript && !sending) {
        voicePendingReplyRef.current = true;
        void send({
          displayText: "语音消息",
          runtimeText: transcript,
          audioClip: {
            ...capture.audioClip,
            transcript,
          },
        });
      } else {
        setInput(finalDraft);
      }
      return;
    }

    if (!voiceInputSupported) {
      toast.error("当前环境还不支持语音输入。");
      return;
    }

    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }

    voiceAutoSendRef.current = input.trim().length === 0;
    voiceBaseInputRef.current = voiceAutoSendRef.current ? "" : input;
    if (voiceAutoSendRef.current) {
      setInput("");
    }
    const started = await startListening();
    if (!started) {
      voiceAutoSendRef.current = false;
      voiceBaseInputRef.current = "";
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div
          onScroll={(event) => {
            const viewport = event.currentTarget;
            shouldStickToBottomRef.current = isNearBottom({
              scrollTop: viewport.scrollTop,
              clientHeight: viewport.clientHeight,
              scrollHeight: viewport.scrollHeight,
            });
          }}
          className="flex-1 min-h-0 space-y-3 overflow-y-auto pb-3"
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <span className="text-2xl">{agent?.icon || "💬"}</span>
              <p className="text-[13px]">
                {agent
                  ? currentThread
                    ? `在 ${currentThread.title} 中与 ${agent.name} 协作`
                    : `与 ${agent.name} 开始一条新任务线`
                  : "选择一个 Agent"}
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex flex-col gap-1", message.role === "user" ? "items-end" : "items-start")}
            >
              <span className="px-1 text-[11px] text-muted-foreground/80">
                {formatMessageTimestamp(message.timestamp)}
              </span>
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl",
                  message.audioClip
                    ? ""
                    : message.role === "user"
                      ? "glass px-4 py-2.5"
                      : "px-4 py-2.5",
                )}
              >
                {message.role === "assistant" ? (
                  <MessageBlocksRenderer parts={message.parts} />
                ) : message.audioClip ? (
                  <AudioMessageBubble
                    clip={message.audioClip}
                    align={message.role === "user" ? "right" : "left"}
                  />
                ) : (
                  <div className={MESSAGE_MARKDOWN_CLASS}>
                    <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && sendingLabel && (
            <div className="flex items-center gap-2 px-1 text-muted-foreground">
              <Loader2 className="animate-spin" size={14} />
              <span className="text-[12px]">{sendingLabel}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 pb-1">
          <div className="glass rounded-2xl px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">
                {isTranscribing
                  ? "正在转写刚才的语音..."
                  : isListening
                    ? voiceAutoSendRef.current
                      ? "正在录音，再点一次即可结束并发送语音消息"
                      : "正在录音，再点一次即可结束并追加到输入框"
                    : agentSwitchCommand
                      ? "输入 /agent dolphin 这样的命令可以切换 Agent"
                    : showComposerPreview
                      ? "检测到 Markdown，下面会实时预览"
                      : "Enter 换行，Cmd/Ctrl+Enter 发送"}
              </span>
              <div className="flex items-center gap-2">
                {canSpeakReply && (
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceReplyEnabled && typeof window !== "undefined") {
                        window.speechSynthesis?.cancel();
                      }
                      setVoiceReplyEnabled((current) => !current);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors",
                      voiceReplyEnabled
                        ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-700"
                        : "border-border/60 text-muted-foreground hover:bg-foreground/5",
                    )}
                  >
                    {voiceReplyEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    <span>{voiceReplyEnabled ? "自动朗读" : "静音回复"}</span>
                  </button>
                )}
                {bundleLoading && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" />
                    <span>同步中</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={agent ? "输入消息..." : "选择 Agent..."}
                  disabled={!selectedAgentId || sending}
                  rows={1}
                  className="max-h-[160px] w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-40"
                  style={{ minHeight: "72px" }}
                />

                {showComposerPreview && (
                  <div className="mt-3 rounded-2xl border border-border/50 bg-background/35 px-3 py-2">
                    {input.trim() ? (
                      <div className={MESSAGE_MARKDOWN_CLASS}>
                        <Markdown remarkPlugins={[remarkGfm]}>{input}</Markdown>
                      </div>
                    ) : (
                      <div className="pt-1 text-[13px] text-muted-foreground">输入内容后，这里会显示 Markdown 预览。</div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  void toggleVoiceInput();
                }}
                disabled={!selectedAgentId || sending || isTranscribing}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center transition-colors",
                  isListening ? "text-emerald-700" : "text-muted-foreground hover:text-foreground",
                  (!selectedAgentId || sending || isTranscribing) && "cursor-not-allowed opacity-50",
                )}
                title={
                  isListening
                    ? "停止语音输入"
                    : isTranscribing
                      ? "正在转写语音"
                    : input.trim()
                      ? "开始听写，识别结果会追加到输入框"
                      : "开始语音直发，停下后会自动发送"
                }
              >
                {isListening ? <VoiceLevelIndicator level={audioLevel} bands={audioBands} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  void send();
                }}
                disabled={!input.trim() || !selectedAgentId || sending}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
                  input.trim() ? "bg-foreground text-background" : "bg-foreground/10 text-muted-foreground",
                )}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
