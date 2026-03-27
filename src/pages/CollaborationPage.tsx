import { useEffect, useState } from "react";
import {
  Bot,
  Cloud,
  HardDrive,
  Network,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import { useCollaborationStore } from "@/stores/collaboration-store";
import type { ConnectorRef, TaskBoard } from "@/lib/types/collaboration";

const inputClass =
  "w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10";

const textareaClass = `${inputClass} min-h-[96px] resize-y`;

function connectorStatusClass(status: string) {
  switch (status) {
    case "online":
      return "bg-emerald-500/12 text-emerald-500";
    case "degraded":
      return "bg-amber-500/12 text-amber-500";
    case "unauthorized":
      return "bg-rose-500/12 text-rose-500";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function connectorTypeIcon(type: ConnectorRef["type"]) {
  switch (type) {
    case "local":
      return <HardDrive size={16} />;
    case "cloud":
      return <Cloud size={16} />;
    default:
      return <Server size={16} />;
  }
}

function connectorTypeLabel(type: ConnectorRef["type"]) {
  switch (type) {
    case "local":
      return "Local";
    case "ssh":
      return "SSH";
    case "http":
      return "HTTP";
    case "cloud":
      return "Cloud";
    default:
      return type;
  }
}

function countCapabilities(connector: ConnectorRef) {
  return Object.values(connector.capabilities).filter(Boolean).length;
}

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function arrayToLines(items: string[]) {
  return items.join("\n");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CollaborationPage() {
  const { agents, refresh: refreshAgents } = useAgentsStore();
  const {
    connectors,
    threads,
    selectedThreadId,
    currentBundle,
    connectorsLoading,
    threadsLoading,
    bundleLoading,
    savingBoard,
    creatingThread,
    creatingTask,
    renamingThread,
    loadConnectors,
    loadThreads,
    refreshAll,
    selectThread,
    createThread,
    renameThread,
    saveBoard,
    createTask,
    upsertConnector,
    deleteConnector,
  } = useCollaborationStore();

  const [threadTitle, setThreadTitle] = useState("");
  const [threadGoal, setThreadGoal] = useState("");
  const [threadAgentId, setThreadAgentId] = useState("");
  const [renameTitle, setRenameTitle] = useState("");

  const [connectorName, setConnectorName] = useState("");
  const [connectorType, setConnectorType] = useState<ConnectorRef["type"]>("ssh");
  const [connectorLocation, setConnectorLocation] = useState("");
  const [connectorAuth, setConnectorAuth] = useState<ConnectorRef["auth_mode"]>("ssh-key");
  const [connectorBaseUrl, setConnectorBaseUrl] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAgentId, setTaskAgentId] = useState("");

  const [objective, setObjective] = useState("");
  const [currentFocus, setCurrentFocus] = useState("");
  const [summary, setSummary] = useState("");
  const [decisions, setDecisions] = useState("");
  const [openQuestions, setOpenQuestions] = useState("");
  const [keyFiles, setKeyFiles] = useState("");

  useEffect(() => {
    refreshAgents();
    refreshAll();
  }, [refreshAgents, refreshAll]);

  useEffect(() => {
    if (!threads.length) return;
    if (!selectedThreadId) {
      selectThread(threads[0].id);
    }
  }, [threads, selectedThreadId, selectThread]);

  useEffect(() => {
    const board = currentBundle?.board;
    if (!board) return;
    setObjective(board.objective);
    setCurrentFocus(board.current_focus ?? "");
    setSummary(board.summary);
    setDecisions(arrayToLines(board.decisions));
    setOpenQuestions(arrayToLines(board.open_questions));
    setKeyFiles(arrayToLines(board.key_files));
  }, [currentBundle?.board.id, currentBundle?.board.version]);

  useEffect(() => {
    setRenameTitle(currentBundle?.thread.title ?? "");
  }, [currentBundle?.thread.id, currentBundle?.thread.title]);

  const activeBoard = currentBundle?.board ?? null;
  const connectorCount = connectors.length;
  const liveConnectorCount = connectors.filter((connector) => connector.status === "online").length;

  const handleCreateThread = async () => {
    if (!threadTitle.trim()) {
      toast.error("先给这条任务线起个名字");
      return;
    }

    try {
      await createThread({
        title: threadTitle.trim(),
        goal: threadGoal.trim(),
        defaultAgentId: threadAgentId || undefined,
      });
      setThreadTitle("");
      setThreadGoal("");
      setThreadAgentId("");
      toast.success("任务线已创建");
    } catch {
      toast.error("创建任务线失败");
    }
  };

  const handleSaveBoard = async () => {
    if (!activeBoard) return;

    const nextBoard: TaskBoard = {
      ...activeBoard,
      objective: objective.trim(),
      current_focus: currentFocus.trim() || undefined,
      summary: summary.trim(),
      decisions: linesToArray(decisions),
      open_questions: linesToArray(openQuestions),
      key_files: linesToArray(keyFiles),
    };

    try {
      await saveBoard(nextBoard);
      toast.success("共享任务板已更新");
    } catch {
      toast.error("保存任务板失败");
    }
  };

  const handleRenameThread = async () => {
    const nextTitle = renameTitle.trim();
    if (!currentBundle) return;
    if (!nextTitle) {
      toast.error("任务线名称不能为空");
      return;
    }
    if (nextTitle === currentBundle.thread.title) {
      toast("名称没有变化");
      return;
    }

    try {
      await renameThread(currentBundle.thread.id, nextTitle);
      toast.success("任务线名称已更新");
    } catch {
      toast.error("重命名任务线失败");
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim()) {
      toast.error("先写任务标题");
      return;
    }

    try {
      await createTask({
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        assignedAgentId: taskAgentId || undefined,
      });
      setTaskTitle("");
      setTaskDescription("");
      setTaskAgentId("");
      toast.success("子任务已加入任务板");
    } catch {
      toast.error("创建子任务失败");
    }
  };

  const handleCreateConnector = async () => {
    if (!connectorName.trim() || !connectorLocation.trim()) {
      toast.error("Connector 名称和位置至少要填上");
      return;
    }

    try {
      await upsertConnector({
        name: connectorName.trim(),
        type: connectorType,
        location_label: connectorLocation.trim(),
        auth_mode: connectorAuth,
        base_url: connectorBaseUrl.trim() || undefined,
      });
      setConnectorName("");
      setConnectorLocation("");
      setConnectorBaseUrl("");
      toast.success("远端 connector 已登记");
    } catch {
      toast.error("保存 connector 失败");
    }
  };

  const handleDeleteConnector = async (connectorId: string) => {
    try {
      await deleteConnector(connectorId);
      toast.success("connector 已移除");
    } catch {
      toast.error("删除 connector 失败");
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.06)] backdrop-blur">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at top left, rgba(251,146,60,0.16), transparent 28%), radial-gradient(circle at right 20%, rgba(56,189,248,0.12), transparent 24%)",
          }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              <Network size={13} />
              Collaboration Control Plane
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">把多 Agent 协作从概念变成可管理对象</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                这一页现在已经接上了真实数据层：本地 connector 自动发现、远端 connector 可登记、Thread 和共享
                Board 会落到 `hub.json`，而且 `Work &gt; Chat` 和 `Work &gt; Tasks` 已经开始复用这套结构。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Connectors</div>
              <div className="mt-2 text-2xl font-semibold">{connectorCount}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Online</div>
              <div className="mt-2 text-2xl font-semibold">{liveConnectorCount}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Threads</div>
              <div className="mt-2 text-2xl font-semibold">{threads.length}</div>
            </div>
            <button
              onClick={() => {
                loadConnectors();
                loadThreads();
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-border/60 bg-background/75 px-4 py-3 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <RefreshCw size={15} className={cn((connectorsLoading || threadsLoading) && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Connectors</div>
              <h2 className="mt-1 text-lg font-semibold">本地与远端执行入口</h2>
            </div>
            <div className="text-xs text-muted-foreground">{connectorsLoading ? "Loading..." : `${connectors.length} total`}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="group rounded-[22px] border border-border/60 bg-background/75 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_40px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      {connectorTypeIcon(connector.type)}
                    </div>
                    <div>
                      <div className="font-medium">{connector.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {connectorTypeLabel(connector.type)} · {connector.location_label}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-1 text-[11px] font-medium", connectorStatusClass(connector.status))}>
                      {connector.status}
                    </span>
                    {connector.id !== "local.default" && (
                      <button
                        onClick={() => handleDeleteConnector(connector.id)}
                        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                        title="Remove connector"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl bg-muted/45 px-3 py-2">
                    <div className="text-muted-foreground">Auth</div>
                    <div className="mt-1 font-medium">{connector.auth_mode}</div>
                  </div>
                  <div className="rounded-2xl bg-muted/45 px-3 py-2">
                    <div className="text-muted-foreground">Capabilities</div>
                    <div className="mt-1 font-medium">{countCapabilities(connector)}</div>
                  </div>
                  <div className="rounded-2xl bg-muted/45 px-3 py-2">
                    <div className="text-muted-foreground">Mode</div>
                    <div className="mt-1 font-medium">{connectorTypeLabel(connector.type)}</div>
                  </div>
                </div>

                {connector.base_url && (
                  <div className="mt-3 rounded-2xl border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    {connector.base_url}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Register</div>
            <h2 className="mt-1 text-lg font-semibold">登记一个远端 connector</h2>
          </div>

          <div className="space-y-3">
            <input
              value={connectorName}
              onChange={(event) => setConnectorName(event.target.value)}
              className={inputClass}
              placeholder="例如：Volcengine OpenClaw"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={connectorType}
                onChange={(event) => setConnectorType(event.target.value as ConnectorRef["type"])}
                className={inputClass}
              >
                <option value="ssh">SSH connector</option>
                <option value="http">HTTP connector</option>
                <option value="cloud">Cloud connector</option>
              </select>

              <select
                value={connectorAuth}
                onChange={(event) => setConnectorAuth(event.target.value as ConnectorRef["auth_mode"])}
                className={inputClass}
              >
                <option value="ssh-key">SSH key</option>
                <option value="token">Token</option>
                <option value="oauth">OAuth</option>
                <option value="none">None</option>
              </select>
            </div>

            <input
              value={connectorLocation}
              onChange={(event) => setConnectorLocation(event.target.value)}
              className={inputClass}
              placeholder="位置说明，例如：北京 · volces-cvm-01"
            />

            <input
              value={connectorBaseUrl}
              onChange={(event) => setConnectorBaseUrl(event.target.value)}
              className={inputClass}
              placeholder="可选：base URL / host"
            />

            <button
              onClick={handleCreateConnector}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
            >
              <Plus size={15} />
              保存 Connector
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Threads</div>
                <h2 className="mt-1 text-lg font-semibold">新建任务线</h2>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Plus size={16} />
              </div>
            </div>

            <div className="space-y-3">
              <input
                value={threadTitle}
                onChange={(event) => setThreadTitle(event.target.value)}
                className={inputClass}
                placeholder="例如：修支付回调 bug"
              />
              <textarea
                value={threadGoal}
                onChange={(event) => setThreadGoal(event.target.value)}
                className={textareaClass}
                placeholder="写清楚当前目标，后面 handoff 会直接用到这段目标描述"
              />
              <select
                value={threadAgentId}
                onChange={(event) => setThreadAgentId(event.target.value)}
                className={inputClass}
              >
                <option value="">默认 Agent（可选）</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.icon} {agent.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateThread}
                disabled={creatingThread}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={15} />
                {creatingThread ? "创建中..." : "创建 Thread"}
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-border/60 bg-card/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">任务线列表</div>
              <div className="text-xs text-muted-foreground">{threadsLoading ? "Loading..." : `${threads.length} 条`}</div>
            </div>

            <div className="space-y-2">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => selectThread(thread.id)}
                  className={cn(
                    "w-full rounded-[20px] border px-3 py-3 text-left transition-all",
                    thread.id === selectedThreadId
                      ? "border-primary/40 bg-primary/8 shadow-[0_10px_24px_rgba(0,0,0,0.04)]"
                      : "border-border/60 bg-background/70 hover:border-primary/20 hover:bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{thread.title}</div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {thread.goal || "No goal yet"}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {thread.status}
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-muted-foreground">更新于 {formatTime(thread.updated_at)}</div>
                </button>
              ))}

              {!threads.length && !threadsLoading && (
                <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  先创建第一条任务线，后面 Chat、Board、handoff 都会围绕它展开。
                </div>
              )}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          {!currentBundle ? (
            <div className="rounded-[28px] border border-dashed border-border/70 bg-card/60 px-8 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Network size={22} />
              </div>
              <h2 className="mt-4 text-xl font-semibold">还没有选中的协作线程</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                左侧先创建或选择一条 Thread，然后在这里维护共享任务板、子任务和协作事件。
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-[28px] border border-border/60 bg-card/80 p-5">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                      <Bot size={13} />
                      Shared Board
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold">{currentBundle.thread.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Board v{currentBundle.board.version} · 更新于 {formatTime(currentBundle.board.updated_at)}
                    </p>
                  </div>

                  <button
                    onClick={handleSaveBoard}
                    disabled={savingBoard || bundleLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={15} />
                    {savingBoard ? "保存中..." : "保存任务板"}
                  </button>
                </div>

                <div className="mb-5 grid gap-3 rounded-[22px] border border-border/60 bg-background/60 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="block">
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Thread Name</div>
                    <input
                      value={renameTitle}
                      onChange={(event) => setRenameTitle(event.target.value)}
                      className={inputClass}
                      placeholder="给这条任务线换个更清晰的名字"
                    />
                  </label>
                  <button
                    onClick={handleRenameThread}
                    disabled={renamingThread || !currentBundle}
                    className="self-end rounded-2xl border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {renamingThread ? "更新中..." : "更新名称"}
                  </button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Objective</div>
                      <input value={objective} onChange={(event) => setObjective(event.target.value)} className={inputClass} />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Current Focus</div>
                      <input value={currentFocus} onChange={(event) => setCurrentFocus(event.target.value)} className={inputClass} />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Shared Notes</div>
                      <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="min-h-[168px] w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10" />
                    </label>
                  </div>

                  <div className="grid gap-4">
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Decisions</div>
                      <textarea value={decisions} onChange={(event) => setDecisions(event.target.value)} className={textareaClass} placeholder="每行一条" />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Open Questions</div>
                      <textarea value={openQuestions} onChange={(event) => setOpenQuestions(event.target.value)} className={textareaClass} placeholder="每行一条" />
                    </label>
                    <label className="block">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Key Files</div>
                      <textarea value={keyFiles} onChange={(event) => setKeyFiles(event.target.value)} className={textareaClass} placeholder="每行一个文件路径" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Tasks</div>
                      <h3 className="mt-1 text-lg font-semibold">把工作拆成可认领的子任务</h3>
                    </div>
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Plus size={15} />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      className={inputClass}
                      placeholder="例如：检查 webhook 验签逻辑"
                    />
                    <select value={taskAgentId} onChange={(event) => setTaskAgentId(event.target.value)} className={inputClass}>
                      <option value="">分配给谁（可选）</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.icon} {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={taskDescription}
                    onChange={(event) => setTaskDescription(event.target.value)}
                    className="mt-3 min-h-[84px] w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                    placeholder="写清楚交付物和约束，让 handoff 的时候更稳"
                  />
                  <button
                    onClick={handleCreateTask}
                    disabled={creatingTask}
                    className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Plus size={15} />
                    {creatingTask ? "创建中..." : "新增子任务"}
                  </button>

                  <div className="mt-5 space-y-3">
                    {currentBundle.tasks.map((task) => (
                      <div key={task.id} className="rounded-[20px] border border-border/60 bg-background/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{task.title}</div>
                            {task.description && (
                              <div className="mt-1 text-sm leading-6 text-muted-foreground">{task.description}</div>
                            )}
                          </div>
                          <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {task.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-muted/60 px-2 py-1">priority: {task.priority}</span>
                          {task.assigned_agent_id && (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                              assigned: {task.assigned_agent_id}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {!currentBundle.tasks.length && (
                      <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                        这里先把可分发的任务拆出来，后面不同 Agent 才有真正协作的空间。
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Sessions</div>
                      <h3 className="mt-1 text-lg font-semibold">当前线程里的 Agent 会话</h3>
                    </div>

                    {currentBundle.sessions.length ? (
                      <div className="space-y-3">
                        {currentBundle.sessions.map((session) => (
                          <div key={session.id} className="rounded-[18px] border border-border/60 bg-background/70 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium">{session.agent_id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {session.mode} · last board v{session.last_seen_board_version}
                                </div>
                              </div>
                              <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                {session.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-border/70 bg-background/60 px-4 py-6 text-sm leading-6 text-muted-foreground">
                        当前线程还没有生成会话映射。去 `Work &gt; Chat` 里发一条消息，或者切换一次接手 Agent，
                        这里就会开始出现该 Thread 下的 session 记录。
                      </div>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
                    <div className="mb-4">
                      <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Events</div>
                      <h3 className="mt-1 text-lg font-semibold">关键协作事件</h3>
                    </div>

                    <div className="space-y-3">
                      {currentBundle.events.slice(0, 8).map((event) => (
                        <div key={event.id} className="rounded-[18px] border border-border/60 bg-background/70 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{event.title}</div>
                              {event.body && (
                                <div className="mt-1 text-sm leading-6 text-muted-foreground">{event.body}</div>
                              )}
                            </div>
                            <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {event.event_type}
                            </span>
                          </div>
                          <div className="mt-3 text-[11px] text-muted-foreground">{formatTime(event.created_at)}</div>
                        </div>
                      ))}
                    </div>

                    {!currentBundle.events.length && (
                      <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                        还没有事件。保存 Board、创建 Task 之后，这里会开始积累协作轨迹。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
