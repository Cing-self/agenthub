import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CronJob } from "@/lib/types/cron";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useAgentsStore } from "@/stores/agents-store";
import { cn } from "@/lib/utils";

function nowIso() {
  return new Date().toISOString();
}

function emptyJob(threadId = "", agentId = ""): CronJob {
  return {
    id: "",
    title: "",
    prompt: "",
    thread_id: threadId,
    agent_id: agentId || null,
    enabled: true,
    schedule_kind: "interval",
    interval_minutes: 60,
    daily_time: "09:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function invokeCore<T>(command: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export default function CronPage() {
  const { threads, loadThreads } = useCollaborationStore();
  const { agents, refresh } = useAgentsStore();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const defaultThreadId = threads[0]?.id || "";
  const defaultAgentId = agents.find((agent) => agent.id === "dolphin")?.id || agents[0]?.id || "";
  const [draft, setDraft] = useState<CronJob>(() => emptyJob());

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invokeCore<CronJob[]>("list_cron_jobs");
      setJobs(data);
    } catch (error) {
      console.error("Failed to load cron jobs:", error);
      toast.error(`加载定时任务失败: ${error}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadThreads(), refresh(), loadJobs()]);
  }, [loadJobs, loadThreads, refresh]);

  useEffect(() => {
    setDraft((current) => {
      if (current.thread_id && current.agent_id) return current;
      return {
        ...current,
        thread_id: current.thread_id || defaultThreadId,
        agent_id: current.agent_id || defaultAgentId || null,
      };
    });
  }, [defaultAgentId, defaultThreadId]);

  const threadLabelMap = useMemo(
    () =>
      Object.fromEntries(threads.map((thread) => [thread.id, thread.title])) as Record<string, string>,
    [threads],
  );
  const agentLabelMap = useMemo(
    () =>
      Object.fromEntries(agents.map((agent) => [agent.id, agent.name])) as Record<string, string>,
    [agents],
  );

  const saveJob = async () => {
    if (!draft.title.trim()) {
      toast.error("请先填写定时任务名称");
      return;
    }
    if (!draft.thread_id) {
      toast.error("请先选择一条 Thread");
      return;
    }

    setSaving(true);
    try {
      const saved = await invokeCore<CronJob>("upsert_cron_job", { job: draft });
      setJobs((current) => {
        const exists = current.some((item) => item.id === saved.id);
        if (exists) {
          return current.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...current];
      });
      setDraft(emptyJob(saved.thread_id, saved.agent_id || defaultAgentId));
      toast.success("定时任务已保存");
    } catch (error) {
      toast.error(`保存失败: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleJob = async (job: CronJob) => {
    try {
      const saved = await invokeCore<CronJob>("upsert_cron_job", {
        job: {
          ...job,
          enabled: !job.enabled,
        },
      });
      setJobs((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch (error) {
      toast.error(`更新失败: ${error}`);
    }
  };

  const runNow = async (job: CronJob) => {
    setRunningId(job.id);
    try {
      const saved = await invokeCore<CronJob>("run_cron_job_now", { id: job.id });
      setJobs((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      toast.success(`已触发：${job.title}`);
    } catch (error) {
      toast.error(`执行失败: ${error}`);
    } finally {
      setRunningId(null);
    }
  };

  const removeJob = async (id: string) => {
    try {
      await invokeCore("delete_cron_job", { id });
      setJobs((current) => current.filter((job) => job.id !== id));
      toast.success("已删除定时任务");
    } catch (error) {
      toast.error(`删除失败: ${error}`);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
      <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              <AlarmClock size={13} />
              Scheduled Runs
            </div>
            <h1 className="mt-3 text-2xl font-semibold">定时任务</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              第一版会在 App 运行时轮询调度，并在到点后自动往指定 Thread 注入一条任务，同时记录协作事件。你也可以手动立即执行。
            </p>
          </div>
          <button
            onClick={() => {
              void loadJobs();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Create Job</div>
          <h2 className="mt-1 text-lg font-semibold">新增定时任务</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-[12px] text-muted-foreground">任务名称</span>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="例如：每日检查项目进展"
              className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[12px] text-muted-foreground">执行方式</span>
            <select
              value={draft.schedule_kind}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  schedule_kind: event.target.value as CronJob["schedule_kind"],
                }))
              }
              className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            >
              <option value="interval">按间隔</option>
              <option value="daily">每天固定时间</option>
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-[12px] text-muted-foreground">触发后要写入 Thread 的任务说明</span>
            <textarea
              value={draft.prompt}
              onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
              placeholder="例如：请检查本周需求推进情况，并给出一条新的跟进任务。"
              className="min-h-[108px] w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-[12px] text-muted-foreground">目标 Thread</span>
            <select
              value={draft.thread_id}
              onChange={(event) => setDraft((current) => ({ ...current, thread_id: event.target.value }))}
              className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            >
              <option value="">选择 Thread</option>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[12px] text-muted-foreground">默认指派 Agent</span>
            <select
              value={draft.agent_id || ""}
              onChange={(event) => setDraft((current) => ({ ...current, agent_id: event.target.value || null }))}
              className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
            >
              <option value="">不指派</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          {draft.schedule_kind === "interval" ? (
            <label className="space-y-2">
              <span className="text-[12px] text-muted-foreground">间隔分钟</span>
              <input
                type="number"
                min={5}
                value={draft.interval_minutes ?? 60}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    interval_minutes: Number(event.target.value || 0),
                  }))
                }
                className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
              />
            </label>
          ) : (
            <label className="space-y-2">
              <span className="text-[12px] text-muted-foreground">每天时间</span>
              <input
                type="time"
                value={draft.daily_time || "09:00"}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    daily_time: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none"
              />
            </label>
          )}

          <div className="flex items-end">
            <button
              onClick={() => {
                void saveJob();
              }}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              保存任务
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-border/60 bg-card/75 p-5">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Queue</div>
          <h2 className="mt-1 text-lg font-semibold">已配置的定时任务</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
            还没有定时任务。先创建一条，把周期性动作绑定到某条 Thread。
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-[20px] border border-border/60 bg-background/70 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{job.title}</div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.18em]",
                          job.enabled
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {job.enabled ? "enabled" : "paused"}
                      </span>
                    </div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">{job.prompt || "无附加说明"}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-muted/60 px-2 py-1">thread: {threadLabelMap[job.thread_id] || job.thread_id}</span>
                      {job.agent_id ? (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                          agent: {agentLabelMap[job.agent_id] || job.agent_id}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-muted/60 px-2 py-1">
                        {job.schedule_kind === "interval"
                          ? `every ${job.interval_minutes ?? 0} min`
                          : `daily ${job.daily_time || "09:00"}`}
                      </span>
                      <span className="rounded-full bg-muted/60 px-2 py-1">next: {formatTime(job.next_run_at)}</span>
                      <span className="rounded-full bg-muted/60 px-2 py-1">last: {formatTime(job.last_run_at)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => {
                        void toggleJob(job);
                      }}
                      className="rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {job.enabled ? "暂停" : "启用"}
                    </button>
                    <button
                      onClick={() => {
                        void runNow(job);
                      }}
                      disabled={runningId === job.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {runningId === job.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      立即执行
                    </button>
                    <button
                      onClick={() => {
                        void removeJob(job.id);
                      }}
                      className="rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
