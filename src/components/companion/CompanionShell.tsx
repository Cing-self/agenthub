import { useEffect, useMemo, useRef } from "react";
import { AlertCircle, Bot, CheckCircle2, ExternalLink, Loader2, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { TaskStatus, ThreadBundle } from "@/lib/types/collaboration";
import { cn } from "@/lib/utils";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useCompanionStore } from "@/stores/companion-store";

type CompanionStatus = "idle" | "working" | "needs-you" | "done";

interface CompanionSnapshot {
  status: CompanionStatus;
  title: string;
  subtitle: string;
  focus: string;
  recentLine: string;
  question: string | null;
  threadTitle: string | null;
  activeTaskCount: number;
  blockedTaskCount: number;
  doneTaskCount: number;
}

const STATUS_META: Record<
  CompanionStatus,
  {
    label: string;
    panelClassName: string;
    ringClassName: string;
    chipClassName: string;
  }
> = {
  idle: {
    label: "在这儿",
    panelClassName:
      "from-sky-500/[0.14] via-cyan-400/[0.06] to-transparent dark:from-sky-500/[0.14] dark:via-cyan-400/[0.06]",
    ringClassName: "from-sky-500/60 to-cyan-400/60",
    chipClassName: "bg-sky-500/[0.14] text-sky-600 dark:text-sky-300",
  },
  working: {
    label: "专注中",
    panelClassName:
      "from-amber-500/[0.16] via-orange-400/[0.08] to-transparent dark:from-amber-500/[0.16] dark:via-orange-400/[0.08]",
    ringClassName: "from-amber-500/70 to-orange-400/70",
    chipClassName: "bg-amber-500/[0.14] text-amber-700 dark:text-amber-300",
  },
  "needs-you": {
    label: "等你拍板",
    panelClassName:
      "from-rose-500/[0.16] via-amber-500/[0.1] to-transparent dark:from-rose-500/[0.16] dark:via-amber-500/[0.1]",
    ringClassName: "from-rose-500/70 to-amber-400/70",
    chipClassName: "bg-rose-500/[0.14] text-rose-700 dark:text-rose-300",
  },
  done: {
    label: "做完了",
    panelClassName:
      "from-emerald-500/[0.16] via-teal-400/[0.08] to-transparent dark:from-emerald-500/[0.16] dark:via-teal-400/[0.08]",
    ringClassName: "from-emerald-500/70 to-teal-400/70",
    chipClassName: "bg-emerald-500/[0.14] text-emerald-700 dark:text-emerald-300",
  },
};

function formatFriendlyStatus(status: CompanionStatus) {
  return STATUS_META[status].label;
}

function isTaskStatus(status: TaskStatus, expected: TaskStatus[]) {
  return expected.includes(status);
}

function resolveCompanionSnapshot(bundle: ThreadBundle | null): CompanionSnapshot {
  if (!bundle) {
    return {
      status: "idle",
      title: "我在这儿",
      subtitle: "继续用文字、语音、文件或视频把想法交给我。",
      focus: "现在还没有正在看的线程。",
      recentLine: "按快捷键把我叫出来，然后继续聊。",
      question: null,
      threadTitle: null,
      activeTaskCount: 0,
      blockedTaskCount: 0,
      doneTaskCount: 0,
    };
  }

  const activeTasks = bundle.tasks.filter((task) => isTaskStatus(task.status, ["claimed", "running"]));
  const blockedTasks = bundle.tasks.filter((task) => task.status === "blocked");
  const doneTasks = bundle.tasks.filter((task) => task.status === "done");
  const openQuestions = bundle.board.open_questions.filter(Boolean);
  const liveSessions = bundle.sessions.filter((session) => session.status === "running" || session.status === "waiting");
  const lastEvent = bundle.events[bundle.events.length - 1];

  let status: CompanionStatus = "idle";
  if (blockedTasks.length > 0 || openQuestions.length > 0) {
    status = "needs-you";
  } else if (activeTasks.length > 0 || liveSessions.length > 0) {
    status = "working";
  } else if (
    bundle.thread.status === "completed" ||
    (bundle.tasks.length > 0 && doneTasks.length > 0 && doneTasks.length === bundle.tasks.length)
  ) {
    status = "done";
  }

  const focus =
    bundle.board.current_focus ||
    activeTasks[0]?.title ||
    blockedTasks[0]?.title ||
    bundle.thread.goal ||
    "等你交代下一件事。";

  const recentLine = lastEvent?.body?.trim() || lastEvent?.title?.trim() || "还没有新的动作。";

  if (status === "needs-you") {
    return {
      status,
      title: "这一步需要你看一眼",
      subtitle: "我先停在这里，等你确认方向后继续。",
      focus,
      recentLine,
      question: openQuestions[0] || blockedTasks[0]?.description || null,
      threadTitle: bundle.thread.title,
      activeTaskCount: activeTasks.length,
      blockedTaskCount: blockedTasks.length,
      doneTaskCount: doneTasks.length,
    };
  }

  if (status === "working") {
    return {
      status,
      title: "我还在推进中",
      subtitle: "不用一直盯着主窗口，有结果我会冒出来。",
      focus,
      recentLine,
      question: null,
      threadTitle: bundle.thread.title,
      activeTaskCount: activeTasks.length,
      blockedTaskCount: blockedTasks.length,
      doneTaskCount: doneTasks.length,
    };
  }

  if (status === "done") {
    return {
      status,
      title: "这轮先做完了",
      subtitle: "点开看结果，如果要改方向，我们继续聊。",
      focus,
      recentLine,
      question: null,
      threadTitle: bundle.thread.title,
      activeTaskCount: activeTasks.length,
      blockedTaskCount: blockedTasks.length,
      doneTaskCount: doneTasks.length,
    };
  }

  return {
    status,
    title: "我在旁边陪着你",
    subtitle: "随时可以继续多轮聊，不用先切回大窗口。",
    focus,
    recentLine,
    question: null,
    threadTitle: bundle.thread.title,
    activeTaskCount: activeTasks.length,
    blockedTaskCount: blockedTasks.length,
    doneTaskCount: doneTasks.length,
  };
}

function platformShortcutLabel() {
  if (typeof navigator === "undefined") return "Ctrl + .";
  return /mac/i.test(navigator.platform) ? "⌘ ." : "Ctrl + .";
}

function CatAvatar({ status }: { status: CompanionStatus }) {
  const meta = STATUS_META[status];

  return (
    <div className="relative h-14 w-14 shrink-0">
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-[42%] bg-gradient-to-br shadow-[0_16px_40px_rgba(15,23,42,0.18)]",
          meta.ringClassName,
        )}
      />
      <div className="absolute left-[7px] top-0 h-5 w-5 rotate-[-22deg] rounded-t-[72%] rounded-br-[28%] bg-gradient-to-br from-white/80 to-white/18" />
      <div className="absolute right-[7px] top-0 h-5 w-5 rotate-[22deg] rounded-t-[72%] rounded-bl-[28%] bg-gradient-to-br from-white/80 to-white/18" />
      <div className="absolute inset-[5px] rounded-[44%] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.18))]" />
      <div className="absolute left-[18px] top-[24px] h-1.5 w-1.5 rounded-full bg-slate-900/70 dark:bg-slate-950/80" />
      <div className="absolute right-[18px] top-[24px] h-1.5 w-1.5 rounded-full bg-slate-900/70 dark:bg-slate-950/80" />
      <div className="absolute left-1/2 top-[31px] h-1.5 w-2.5 -translate-x-1/2 rounded-full bg-rose-400/80" />
      <div className="absolute left-1/2 top-[35px] h-3 w-4 -translate-x-1/2 rounded-b-full border-b border-slate-900/30 dark:border-white/30" />
    </div>
  );
}

function MetricPill(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/65 px-3 py-2 backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

function StatusIcon({ status }: { status: CompanionStatus }) {
  switch (status) {
    case "working":
      return <Loader2 size={15} className="animate-spin" />;
    case "needs-you":
      return <AlertCircle size={15} />;
    case "done":
      return <CheckCircle2 size={15} />;
    default:
      return <Bot size={15} />;
  }
}

export function CompanionShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const shortcutLabel = useMemo(() => platformShortcutLabel(), []);
  const {
    currentBundle,
    threads,
    selectedThreadId,
    threadsLoading,
    bundleLoading,
    loadThreads,
    selectThread,
  } = useCollaborationStore();
  const { expanded, open, close, toggle } = useCompanionStore();
  const snapshot = useMemo(() => resolveCompanionSnapshot(currentBundle), [currentBundle]);
  const hasAttention = snapshot.status === "needs-you" || snapshot.status === "done";
  const previousStatusRef = useRef<CompanionStatus | null>(null);
  const bootstrappedThreadsRef = useRef(false);

  useEffect(() => {
    if (bootstrappedThreadsRef.current) return;
    if (!threadsLoading && threads.length === 0 && !currentBundle) {
      bootstrappedThreadsRef.current = true;
      void loadThreads();
    }
  }, [currentBundle, loadThreads, threads.length, threadsLoading]);

  useEffect(() => {
    if (threads.length > 0 && !selectedThreadId) {
      void selectThread(threads[0].id);
    }
  }, [selectedThreadId, selectThread, threads]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSummon = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === ".";
      if (isSummon) {
        event.preventDefault();
        toggle();
        return;
      }

      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, toggle]);

  useEffect(() => {
    if (previousStatusRef.current === null) {
      previousStatusRef.current = snapshot.status;
      return;
    }

    if (snapshot.status !== previousStatusRef.current && hasAttention) {
      open();
    }

    previousStatusRef.current = snapshot.status;
  }, [hasAttention, open, snapshot.status]);

  const openWorkspace = () => {
    if (location.pathname !== "/work/chat") {
      navigate("/work/chat");
    }
    close();
  };

  const openBoard = () => {
    if (location.pathname !== "/collab") {
      navigate("/collab");
    }
    close();
  };

  const meta = STATUS_META[snapshot.status];

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute bottom-24 right-6 flex max-w-[calc(100vw-48px)] flex-col items-end gap-3">
        <div
          className={cn(
            "pointer-events-auto w-[380px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[28px] border border-border/70 bg-card/[0.78] shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-95 opacity-0",
          )}
        >
          <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", meta.panelClassName)} aria-hidden />

          <div className="relative flex items-start gap-4 p-5">
            <CatAvatar status={snapshot.status} />

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", meta.chipClassName)}>
                    <StatusIcon status={snapshot.status} />
                    {formatFriendlyStatus(snapshot.status)}
                  </div>
                  <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-foreground">{snapshot.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{snapshot.subtitle}</p>
                </div>

                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/[0.55] text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                  aria-label="收起 Companion"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 rounded-[22px] border border-border/70 bg-background/[0.62] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">当前线程</div>
                <div className="mt-2 text-base font-medium text-foreground">
                  {snapshot.threadTitle ?? "还没有选中的线程"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{snapshot.focus}</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricPill label="处理中" value={snapshot.activeTaskCount} />
                <MetricPill label="待确认" value={snapshot.blockedTaskCount} />
                <MetricPill label="已完成" value={snapshot.doneTaskCount} />
              </div>

              <div className="mt-3 rounded-[22px] border border-border/70 bg-background/[0.62] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {snapshot.question ? "这一步等你决定" : "最近动态"}
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground">
                  {snapshot.question ?? snapshot.recentLine}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={openWorkspace}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_16px_40px_rgba(14,165,233,0.16)] transition-transform hover:-translate-y-0.5"
                >
                  继续对话
                  <ExternalLink size={16} />
                </button>
                <button
                  type="button"
                  onClick={openBoard}
                  className="inline-flex h-11 items-center rounded-full border border-border/70 bg-background/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-background"
                >
                  查看任务板
                </button>
                <div className="ml-auto text-xs text-muted-foreground">{shortcutLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          className={cn(
            "pointer-events-auto group relative flex min-h-[88px] w-[294px] max-w-[calc(100vw-48px)] items-center gap-4 overflow-hidden rounded-[28px] border border-border/70 bg-card/[0.76] px-4 py-3 text-left shadow-[0_20px_72px_rgba(15,23,42,0.16)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(15,23,42,0.2)]",
            hasAttention && "ring-1 ring-primary/30",
            expanded && "translate-y-1 scale-[0.98] opacity-90",
          )}
          aria-expanded={expanded}
          aria-label="打开 Companion"
        >
          <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", meta.panelClassName)} aria-hidden />
          <div className="relative flex items-center gap-4">
            <CatAvatar status={snapshot.status} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.chipClassName)}>
                  {formatFriendlyStatus(snapshot.status)}
                </span>
                {bundleLoading ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" />
                    同步中
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{snapshot.threadTitle ?? "Companion"}</div>
              <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{snapshot.focus}</div>
            </div>
          </div>

          <div className="relative ml-auto shrink-0 rounded-full border border-border/70 bg-background/[0.65] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {shortcutLabel}
          </div>
        </button>
      </div>
    </div>
  );
}
