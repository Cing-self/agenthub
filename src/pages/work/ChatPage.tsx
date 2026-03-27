import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AgentSwitchRail } from "@/components/agents/AgentSwitchRail";
import { cn } from "@/lib/utils";
import type { HandoffPacket, TaskBoard, ThreadBundle } from "@/lib/types/collaboration";
import { useAgentsStore } from "@/stores/agents-store";
import { useCollaborationStore } from "@/stores/collaboration-store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent: string;
  timestamp: number;
}

const DRAFT_BUCKET = "__draft__";
const STATELESS_AGENT_TYPES = new Set(["claude-code", "codex", "openclaw"]);

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

function formatHandoffPrompt(packet: HandoffPacket, taskTitles: string[]) {
  const sections = [
    "你正在 AgentHub 的同一条任务线里继续工作，请基于下面的共享上下文接手。",
    `任务目标：${packet.objective}`,
    packet.current_focus ? `当前焦点：${packet.current_focus}` : "",
    packet.summary ? `共享备注：\n${packet.summary}` : "",
    packet.recent_context.length ? `最近往来：\n- ${packet.recent_context.join("\n- ")}` : "",
    packet.open_questions.length ? `未解决问题：\n- ${packet.open_questions.join("\n- ")}` : "",
    packet.key_files.length ? `关键文件：\n- ${packet.key_files.join("\n- ")}` : "",
    taskTitles.length ? `当前相关子任务：\n- ${taskTitles.join("\n- ")}` : "",
    `用户最新请求：\n${packet.latest_user_message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return sections;
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

function formatContinuationPrompt(packet: HandoffPacket, taskTitles: string[]) {
  const sections = [
    "继续处理当前任务线，下面是最新共享上下文。",
    `任务目标：${packet.objective}`,
    packet.current_focus ? `当前焦点：${packet.current_focus}` : "",
    packet.summary ? `共享备注：\n${packet.summary}` : "",
    packet.recent_context.length ? `最近往来：\n- ${packet.recent_context.join("\n- ")}` : "",
    packet.open_questions.length ? `待解决问题：\n- ${packet.open_questions.join("\n- ")}` : "",
    taskTitles.length ? `当前相关子任务：\n- ${taskTitles.join("\n- ")}` : "",
    `用户最新请求：\n${packet.latest_user_message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return sections;
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
    renameThread,
    saveBoard,
  } = useCollaborationStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [messageMap, setMessageMap] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingLabel, setSendingLabel] = useState("");
  const [isRenamingThread, setIsRenamingThread] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const requestedAgentId = searchParams.get("agent") ?? "";
  const requestedThreadId = searchParams.get("thread") ?? "";

  const fallbackAgentId = agents.find((item) => item.running)?.id || agents[0]?.id || "";
  const selectedAgentId = agents.some((item) => item.id === requestedAgentId)
    ? requestedAgentId
    : fallbackAgentId;

  const fallbackThreadId = threads.some((thread) => thread.id === storeSelectedThreadId)
    ? storeSelectedThreadId ?? ""
    : threads[0]?.id ?? "";
  const selectedThreadId = threads.some((thread) => thread.id === requestedThreadId)
    ? requestedThreadId
    : fallbackThreadId;

  const activeBucket = selectedThreadId || DRAFT_BUCKET;
  const messages = messageMap[activeBucket] ?? [];
  const agent = agents.find((item) => item.id === selectedAgentId);
  const currentThread = threads.find((thread) => thread.id === selectedThreadId);
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
    setRenameTitle(currentThread?.title ?? "");
    setIsRenamingThread(false);
  }, [currentThread?.id, currentThread?.title]);

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

  const ensureThreadForChat = async () => {
    if (selectedThreadId) return selectedThreadId;
    const bundle = await createThread({
      title: formatThreadTitle(input),
      goal: input.trim(),
      defaultAgentId: selectedAgentId || undefined,
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
        mode: "stateless",
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
      await selectThread(selectedThreadId);
    } catch (error) {
      console.error("Failed to switch agent session:", error);
    }
  };

  const handleThreadChange = async (threadId: string) => {
    updateParams({ threadId, agentId: selectedAgentId });
    await selectThread(threadId);
    inputRef.current?.focus();
  };

  const handleQuickThreadCreate = async () => {
    try {
      const bundle = await createThread({
        title: formatThreadTitle(input),
        goal: input.trim(),
        defaultAgentId: selectedAgentId || undefined,
      });
      updateParams({ threadId: bundle.thread.id, agentId: selectedAgentId });
      toast.success("已创建新的任务线");
      inputRef.current?.focus();
    } catch {
      toast.error("创建任务线失败");
    }
  };

  const handleThreadRename = async () => {
    if (!currentThread) return;
    const nextTitle = renameTitle.trim();
    if (!nextTitle) {
      toast.error("任务线名称不能为空");
      return;
    }
    if (nextTitle === currentThread.title) {
      setIsRenamingThread(false);
      return;
    }

    try {
      await renameThread(currentThread.id, nextTitle);
      toast.success("任务线名称已更新");
      setIsRenamingThread(false);
    } catch {
      toast.error("更新任务线名称失败");
    }
  };

  const send = async () => {
    if (!input.trim() || !selectedAgentId || sending) return;

    const threadId = await ensureThreadForChat();
    const userContent = input.trim();
    const previousAgentId = messages[messages.length - 1]?.agent ?? null;
    const agentName = agent?.name || selectedAgentId;
    const runtimeIsStateless = STATELESS_AGENT_TYPES.has(agent?.agent_type ?? "");
    const isFirstSession = !currentSession;
    const isAgentSwitch = Boolean(previousAgentId && previousAgentId !== selectedAgentId);
    const needsHandoff = isFirstSession || isAgentSwitch;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      agent: selectedAgentId,
      timestamp: Date.now(),
    };

    appendMessage(threadId, userMsg);
    setInput("");
    setSending(true);
    setSendingLabel(
      needsHandoff
        ? isAgentSwitch
          ? `正在切换到 ${agentName} 并同步上下文...`
          : `正在为 ${agentName} 初始化上下文...`
        : runtimeIsStateless
          ? `正在整理上下文并交给 ${agentName} 处理...`
          : `正在交给 ${agentName} 处理...`,
    );

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const session = await invoke<{ id: string }>("ensure_thread_session", {
        threadId,
        agentId: selectedAgentId,
        mode: "stateless",
        runtimeSessionId: null,
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

      const handoff = await invoke<HandoffPacket>("create_handoff_packet", {
        threadId,
        toAgentId: selectedAgentId,
        latestUserMessage: userContent,
        fromAgentId: previousAgentId,
      });

      const bundleTasks = currentBundle?.tasks
        .filter((task) => handoff.selected_task_ids.includes(task.id))
        .map((task) => task.title) ?? [];

      if (needsHandoff) {
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
            selectedTaskIds: handoff.selected_task_ids,
          },
        });
      }

      const runtimePrompt = needsHandoff
        ? formatHandoffPrompt(handoff, bundleTasks)
        : formatContinuationPrompt(handoff, bundleTasks);

      let response = "";

      if (agent?.agent_type === "claude-code") {
        const escaped = runtimePrompt
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");
        const result = await invoke<{ stdout: string; success: boolean }>("run_shell_cmd", {
          command: `claude -p "${escaped}" 2>/dev/null`,
          timeoutSecs: 120,
        });
        response = result.success && result.stdout.trim() ? result.stdout.trim() : "（无回复或超时）";
      } else if (agent?.agent_type === "codex") {
        const escaped = runtimePrompt
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");
        const result = await invoke<{ stdout: string; success: boolean }>("run_shell_cmd", {
          command: `codex exec "${escaped}" 2>/dev/null`,
          timeoutSecs: 120,
        });
        response = result.success && result.stdout.trim() ? result.stdout.trim() : "（无回复或超时）";
      } else if (agent?.agent_type === "openclaw") {
        const idKey = `hub-${Date.now()}`;
        const result = await invoke<{ stdout: string; success: boolean; json?: unknown }>("run_openclaw_cmd", {
          args: [
            "gateway",
            "call",
            "agent",
            "--params",
            JSON.stringify({
              message: runtimePrompt,
              agentId: "main",
              idempotencyKey: idKey,
            }),
            "--json",
            "--expect-final",
            "--timeout",
            "90000",
          ],
          configPath: agent.config_path !== "default" ? agent.config_path : null,
        });
        if (result.json) {
          const data = result.json as Record<string, unknown>;
          const payloads = ((data.result as Record<string, unknown>)?.payloads || []) as { text?: string }[];
          response = payloads.map((payload) => payload.text || "").join("\n").trim() || "（无回复）";
        } else if (result.stdout) {
          const lines = result.stdout.split("\n").filter((line) => line.trim().startsWith("{"));
          const jsonLine = lines.pop();
          if (jsonLine) {
            try {
              const data = JSON.parse(jsonLine) as {
                result?: { payloads?: { text?: string }[] };
              };
              const payloads = data.result?.payloads || [];
              response = payloads.map((payload) => payload.text || "").join("\n").trim() || "（无回复）";
            } catch {
              response = "（解析失败）";
            }
          } else {
            response = "（无回复）";
          }
        } else {
          response = "（Gateway 未响应）";
        }
      } else {
        response = "该 Agent 暂不支持对话";
      }

      appendMessage(threadId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
        agent: selectedAgentId,
        timestamp: Date.now(),
      });

      await invoke("record_thread_event", {
        threadId,
        eventType: "assistant_message",
        title: `${agentName} 已回复`,
        body: response,
        agentId: selectedAgentId,
        sessionId: session.id,
        taskId: null,
        payload: null,
      });

      const latestBundle = await invoke<ThreadBundle>("get_thread_bundle", { threadId });
      const nextBoard = buildBoardUpdate(latestBundle.board, {
        userContent,
        response,
      });
      await saveBoard(nextBoard);

      await selectThread(threadId);
    } catch (error) {
      toast.error(`发送失败: ${error}`);
    }

    setSending(false);
    setSendingLabel("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-4xl shrink-0 pb-3">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-[18px] border border-white/45 bg-white/80 p-1.5 shadow-[0_20px_56px_-42px_rgba(83,48,26,0.45)] backdrop-blur dark:border-white/8 dark:bg-white/[0.05]">
          <button
            onClick={() => {
              void handleQuickThreadCreate();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-90"
            title="创建新任务线"
          >
            <Plus size={14} />
          </button>

          <div className="h-6 w-px bg-black/8 dark:bg-white/10" />

          <div className="inline-flex items-center gap-2 rounded-[14px] border border-black/6 bg-white/78 px-2 py-1 dark:border-white/8 dark:bg-white/[0.04]">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Agent
            </span>
            <AgentSwitchRail
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={(agentId) => {
                void handleAgentChange(agentId);
              }}
              className="min-w-[132px] max-w-[180px] appearance-none rounded-[10px] border border-black/8 bg-white/82 px-3 py-1.5 text-[13px] font-medium outline-none transition-colors hover:border-black/12 focus:border-foreground/20 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.06]"
            />
          </div>

          <div className="h-6 w-px bg-black/8 dark:bg-white/10" />

          <div className="inline-flex items-center gap-2 rounded-[14px] border border-black/6 bg-white/78 px-2 py-1 dark:border-white/8 dark:bg-white/[0.04]">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Thread
            </span>
            {isRenamingThread && currentThread ? (
              <>
                <input
                  value={renameTitle}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleThreadRename();
                    }
                    if (event.key === "Escape") {
                      setRenameTitle(currentThread.title);
                      setIsRenamingThread(false);
                    }
                  }}
                  className="min-w-[144px] max-w-[208px] rounded-[10px] border border-black/8 bg-white/82 px-3 py-1.5 text-[13px] font-medium outline-none transition-colors hover:border-black/12 focus:border-foreground/20 dark:border-white/8 dark:bg-white/[0.06]"
                  placeholder="任务线名称"
                  autoFocus
                />
                <button
                  onClick={() => {
                    void handleThreadRename();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-90"
                  title="保存任务线名称"
                >
                  <Check size={13} />
                </button>
                <button
                  onClick={() => {
                    setRenameTitle(currentThread.title);
                    setIsRenamingThread(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/75 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                  title="取消重命名"
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <select
                  value={selectedThreadId}
                  onChange={(event) => {
                    void handleThreadChange(event.target.value);
                  }}
                  disabled={!threads.length}
                  className="min-w-[144px] max-w-[208px] appearance-none rounded-[10px] border border-black/8 bg-white/82 px-3 py-1.5 text-[13px] font-medium outline-none transition-colors hover:border-black/12 focus:border-foreground/20 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.06]"
                >
                  {threads.length === 0 ? (
                    <option value="">未绑定任务线</option>
                  ) : (
                    threads.map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.title}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={() => {
                    if (!currentThread) return;
                    setRenameTitle(currentThread.title);
                    setIsRenamingThread(true);
                  }}
                  disabled={!currentThread}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-background/75 text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-40"
                  title="重命名任务线"
                >
                  <Pencil size={13} />
                </button>
              </>
            )}
          </div>

          {bundleLoading && (
            <>
              <div className="h-6 w-px bg-black/8 dark:bg-white/10" />
              <div className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
                <Loader2 size={12} className="animate-spin" />
                <span>同步中</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pb-3">
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
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed
                    [&_p]:my-1 [&_p]:text-[13px] [&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:rounded
                    [&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0"
                  >
                    <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
                  </div>
                ) : (
                  <p className="text-[13px]">{message.content}</p>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 px-1 text-muted-foreground">
              <Loader2 className="animate-spin" size={14} />
              <span className="text-[12px]">{sendingLabel || "发送中..."}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 pb-1">
          <div className="glass flex items-end gap-2 rounded-2xl px-4 py-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={agent ? `发送给 ${agent.name}，并挂到当前 Thread...` : "选择 Agent..."}
              disabled={!selectedAgentId || sending}
              rows={1}
              className="max-h-[100px] flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground disabled:opacity-40"
              style={{ minHeight: "22px" }}
            />
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
  );
}
