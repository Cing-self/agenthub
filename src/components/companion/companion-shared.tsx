import { AlertCircle, Bot, CheckCircle2, Loader2 } from "lucide-react";
import type { TaskStatus, ThreadBundle } from "@/lib/types/collaboration";
import { cn } from "@/lib/utils";

export type CompanionStatus = "idle" | "working" | "needs-you" | "done";

export interface CompanionSnapshot {
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

export const STATUS_META: Record<
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

export function formatFriendlyStatus(status: CompanionStatus) {
  return STATUS_META[status].label;
}

function isTaskStatus(status: TaskStatus, expected: TaskStatus[]) {
  return expected.includes(status);
}

export function resolveCompanionSnapshot(bundle: ThreadBundle | null): CompanionSnapshot {
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

export function platformShortcutLabel() {
  if (typeof navigator === "undefined") return "Ctrl + .";
  return /mac/i.test(navigator.platform) ? "⌘ ." : "Ctrl + .";
}

export function CatAvatar({ status }: { status: CompanionStatus }) {
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

export function MetricPill(props: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/65 px-3 py-2 backdrop-blur-md">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{props.value}</div>
    </div>
  );
}

export function StatusIcon({ status }: { status: CompanionStatus }) {
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
