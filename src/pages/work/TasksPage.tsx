import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, GitBranch, ListTodo } from "lucide-react";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TasksPage() {
  const {
    threads,
    selectedThreadId,
    currentBundle,
    threadsLoading,
    bundleLoading,
    loadThreads,
    selectThread,
  } = useCollaborationStore();

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!threads.length || selectedThreadId) return;
    void selectThread(threads[0].id);
  }, [selectedThreadId, selectThread, threads]);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
      <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              <ListTodo size={13} />
              Work Tasks
            </div>
            <h1 className="mt-3 text-2xl font-semibold">当前任务线里的可分发任务</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              这里直接读取 Collaboration 的共享任务板，所以你在 `Config &gt; Collaboration` 里创建的 Thread 和 Task，
              到 Work 模式会直接复用。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Thread</span>
            <select
              value={selectedThreadId ?? ""}
              onChange={(event) => {
                void selectThread(event.target.value);
              }}
              className="min-w-[220px] rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            >
              {threads.length === 0 ? (
                <option value="">暂无任务线</option>
              ) : (
                threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </section>

      {!currentBundle ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[26px] border border-dashed border-border/70 bg-card/60 px-6 py-14 text-center text-muted-foreground">
          <span className="text-2xl">📋</span>
          <p className="text-[13px] font-medium text-foreground">还没有可查看的任务线</p>
          <p className="max-w-md text-[12px] leading-6">
            {threadsLoading ? "任务线加载中..." : "先去 Collaboration 页面或 Chat 页里创建一条 Thread，再回来这里看任务。"}
          </p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-border/60 bg-card/75 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Thread</div>
              <div className="mt-2 text-lg font-semibold">{currentBundle.thread.title}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">{currentBundle.thread.goal || "No goal yet"}</div>
            </div>
            <div className="rounded-[22px] border border-border/60 bg-card/75 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Open Tasks</div>
              <div className="mt-2 text-3xl font-semibold">
                {currentBundle.tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length}
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">当前仍可认领或继续执行的任务数</div>
            </div>
            <div className="rounded-[22px] border border-border/60 bg-card/75 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Board</div>
              <div className="mt-2 text-3xl font-semibold">v{currentBundle.board.version}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">{bundleLoading ? "同步中..." : "和聊天页共用同一块共享上下文"}</div>
            </div>
          </section>

          <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Task Queue</div>
                <h2 className="mt-1 text-lg font-semibold">任务列表</h2>
              </div>
              <Link
                to="/collab"
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                去协作页编辑
                <ArrowUpRight size={12} />
              </Link>
            </div>

            <div className="space-y-3">
              {currentBundle.tasks.map((task) => (
                <div key={task.id} className="rounded-[20px] border border-border/60 bg-background/70 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{task.title}</div>
                      {task.description && (
                        <div className="mt-1 text-sm leading-6 text-muted-foreground">{task.description}</div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em]",
                        task.status === "done"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
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
                    <span className="rounded-full bg-muted/60 px-2 py-1">updated: {formatTime(task.updated_at)}</span>
                  </div>
                </div>
              ))}

              {!currentBundle.tasks.length && (
                <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                  当前线程还没有任务。去协作页或聊天页里先把工作拆成子任务。
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
            <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              <GitBranch size={13} />
              Board Focus
            </div>
            <div className="text-sm leading-7 text-foreground">
              {currentBundle.board.current_focus || currentBundle.board.summary || "尚未设置当前焦点。"}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
