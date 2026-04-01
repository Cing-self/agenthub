import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MessageBlocksRenderer } from "@/components/chat/MessageBlocksRenderer";
import { parseMessageContent } from "@/lib/chat/message-blocks";
import { getRuntimeAdapter, getRuntimeSessionMode, usesNativeRuntimeSession } from "@/lib/runtime";
import type { MessagePart, RuntimeMessageMetadata } from "@/lib/types/chat";
import type { RuntimeStreamEvent } from "@/lib/runtime/types";
import { cn } from "@/lib/utils";
import type { AgentSessionRef, HandoffPacket, TaskBoard, TaskEvent, ThreadBundle } from "@/lib/types/collaboration";
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
  const sections = [
    packet.summary ? `共享备注：\n${packet.summary}` : "",
    includeRecentContext && packet.recent_context.length
      ? `最近往来：\n- ${packet.recent_context.join("\n- ")}`
      : "",
    packet.open_questions.length ? `未解决问题：\n- ${packet.open_questions.join("\n- ")}` : "",
    packet.key_files.length ? `关键文件：\n- ${packet.key_files.join("\n- ")}` : "",
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

function extractFileRefs(...texts: string[]) {
  const pattern = /(?:\/[\w.-]+)+\/[\w.-]+|(?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z0-9]+/g;
  const refs = texts
    .flatMap((text) => text.match(pattern) ?? [])
    .filter((item) => item.length > 3);
  return Array.from(new Set(refs)).slice(0, 6);
}

function buildBoardUpdate(
  board: TaskBoard,
  params: {
    userContent: string;
    response: string;
  },
) {
  const userSnippet = compactText(params.userContent, 72);
  const mergedFiles = Array.from(
    new Set([...board.key_files, ...extractFileRefs(params.userContent, params.response)]),
  ).slice(0, 8);

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
      const rawText =
        event.event_type === "assistant_message" && typeof payload.rawText === "string"
          ? payload.rawText
          : event.body ?? "";
      const parsed = parseMessageContent(rawText);

      return {
        id: event.id,
        role: event.event_type === "user_message" ? "user" : "assistant",
        content: event.event_type === "assistant_message" ? parsed.text : event.body ?? "",
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
      };
    });
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const requestedAgentId = searchParams.get("agent") ?? "";
  const requestedThreadId = searchParams.get("thread") ?? "";
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedThreadId]);

  useEffect(() => {
    if (!currentBundle) return;
    const restoredMessages = buildMessagesFromEvents(currentBundle.events);
    setMessageMap((prev) => ({
      ...prev,
      [currentBundle.thread.id]: restoredMessages,
    }));
  }, [currentBundle]);

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

  const ensureThreadForChat = async () => {
    if (selectedThreadId) return selectedThreadId;
    const bundle = await createThread({
      title: formatThreadTitle(input),
      goal: input.trim(),
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

  const send = async () => {
    if (!input.trim() || !selectedAgentId || sending) return;
    const switchCommand = parseAgentSwitchCommand(input);
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

    const threadId = await ensureThreadForChat();
    const userContent = input.trim();
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
      content: userContent,
      parts: [{ type: "text", content: userContent }],
      agent: selectedAgentId,
      timestamp: Date.now(),
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
        payload: null,
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

      const runtimePrompt = handoff
        ? formatContextPrompt(handoff, bundleTasks, includeRecentContext)
        : userContent;

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pb-3">
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
            <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5", message.role === "user" ? "glass" : "")}>
                {message.role === "assistant" ? (
                  <MessageBlocksRenderer parts={message.parts} />
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
                {agentSwitchCommand
                  ? "输入 /agent dolphin 这样的命令可以切换 Agent"
                  : showComposerPreview
                    ? "检测到 Markdown，下面会实时预览"
                    : "Enter 换行，Cmd/Ctrl+Enter 发送"}
              </span>
              {bundleLoading && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  <span>同步中</span>
                </span>
              )}
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
