import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Database,
  EyeOff,
  Link2,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ThreadRef } from "@/lib/types/collaboration";
import type { MemoryItem, MemoryKind, MemoryProviderConfig, MemoryScope, MemoryVisibility } from "@/lib/types/memory";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import { useMemoryStore } from "@/stores/memory-store";

const shellInputClass =
  "w-full rounded-2xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10";

const MEMORY_KIND_OPTIONS: Array<{ value: MemoryKind; label: string }> = [
  { value: "preference", label: "Preference" },
  { value: "project_fact", label: "Project Fact" },
  { value: "constraint", label: "Constraint" },
  { value: "decision", label: "Decision" },
  { value: "environment", label: "Environment" },
  { value: "skill_usage", label: "Skill Usage" },
  { value: "mcp_usage", label: "MCP Usage" },
  { value: "model_preference", label: "Model Preference" },
  { value: "secret_ref", label: "Secret Ref" },
  { value: "note", label: "Note" },
];

const MEMORY_PROVIDER_OPTIONS: Array<{ value: MemoryProviderConfig["provider"]; label: string }> = [
  { value: "memos", label: "Memos" },
  { value: "openmem", label: "MemOS Cloud" },
];

function formatTime(iso?: string | null) {
  if (!iso) return "未记录";
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scopeLabel(scope: string, scopeId?: string | null) {
  if (scope === "thread" && scopeId) return `Thread · ${scopeId.slice(-6)}`;
  if (scope === "agent" && scopeId) return `Agent · ${scopeId}`;
  return scope;
}

function memoryKindLabel(kind: string) {
  return MEMORY_KIND_OPTIONS.find((item) => item.value === kind)?.label ?? kind;
}

function AddMemoryDialog({
  threads,
  agents,
  onClose,
  onSubmit,
}: {
  threads: ThreadRef[];
  agents: ReturnType<typeof useAgentsStore.getState>["agents"];
  onClose: () => void;
  onSubmit: (item: MemoryItem) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<MemoryScope>("global");
  const [scopeId, setScopeId] = useState("");
  const [kind, setKind] = useState<MemoryKind>("note");
  const [visibility, setVisibility] = useState<MemoryVisibility>("visible");
  const [tags, setTags] = useState("");
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error("先写下要保存的记忆内容");
      return;
    }
    if ((scope === "thread" || scope === "agent") && !scopeId) {
      toast.error("这个 scope 需要选一个具体对象");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        id: "",
        content: content.trim(),
        kind,
        scope,
        scope_id: scope === "global" ? null : scopeId || null,
        visibility,
        source: "manual",
        confidence: 0.95,
        pinned,
        hidden: false,
        created_by: "user",
        tags: tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        created_at: "",
        updated_at: "",
        last_used_at: null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-[28px] border border-border/60 bg-card/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur"
        onClick={(event) => event.stopPropagation()}
      >
          <div className="mb-4">
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Add Memo</div>
          <h2 className="mt-2 text-xl font-semibold">写入记忆</h2>
        </div>

        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className={`${shellInputClass} min-h-[128px] resize-y leading-6`}
            placeholder="例如：当前项目以 Tauri + React 为主，默认中文回复。"
            autoFocus
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={kind} onChange={(event) => setKind(event.target.value as MemoryKind)} className={shellInputClass}>
              {MEMORY_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={visibility} onChange={(event) => setVisibility(event.target.value as MemoryVisibility)} className={shellInputClass}>
              <option value="visible">Visible</option>
              <option value="internal">Internal</option>
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <select value={scope} onChange={(event) => { setScope(event.target.value as MemoryScope); setScopeId(""); }} className={shellInputClass}>
              <option value="global">Global</option>
              <option value="thread">Thread</option>
              <option value="agent">Agent</option>
            </select>

            {scope === "thread" ? (
              <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className={shellInputClass}>
                <option value="">选择任务线</option>
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.title}
                  </option>
                ))}
              </select>
            ) : scope === "agent" ? (
              <select value={scopeId} onChange={(event) => setScopeId(event.target.value)} className={shellInputClass}>
                <option value="">选择 Agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value="全局共享" readOnly className={shellInputClass} />
            )}
          </div>

          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            className={shellInputClass}
            placeholder="可选：tag1, tag2"
          />

          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
              className="rounded border-border"
            />
            置顶，优先参与后续注入
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-2xl border border-border/70 px-4 py-2 text-sm hover:bg-muted/40">
            取消
          </button>
          <button
            onClick={() => {
              void handleSubmit();
            }}
            disabled={submitting}
            className="rounded-2xl bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "保存中..." : "写入记忆"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemoryPage() {
  const { agents, refresh: refreshAgents } = useAgentsStore();
  const { items, profiles, externalSources, connection, loading, saving, loadDashboard, upsertItem, deleteItem, saveConfig } =
    useMemoryStore();

  const [threads, setThreads] = useState<ThreadRef[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [query, setQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all");
  const [draftConfig, setDraftConfig] = useState<MemoryProviderConfig>({
    provider: "memos",
    enabled: false,
    base_url: "",
    access_token: "",
  });

  useEffect(() => {
    refreshAgents();
    void loadDashboard();
    void (async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const nextThreads = await invoke<ThreadRef[]>("list_threads");
      setThreads(nextThreads);
    })();
  }, [loadDashboard, refreshAgents]);

  useEffect(() => {
    setDraftConfig({
      provider: connection.config.provider,
      enabled: connection.config.enabled,
      base_url: connection.config.base_url,
      access_token: connection.config.access_token ?? "",
    });
  }, [connection.config.access_token, connection.config.base_url, connection.config.enabled, connection.config.provider]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (scopeFilter !== "all" && item.scope !== scopeFilter) return false;
      if (visibilityFilter !== "all" && item.visibility !== visibilityFilter) return false;
      if (!query.trim()) return true;

      const haystack = [
        item.content,
        item.kind,
        item.scope,
        item.scope_id ?? "",
        item.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query.trim().toLowerCase());
    });
  }, [items, query, scopeFilter, visibilityFilter]);

  const pinnedCount = items.filter((item) => item.pinned).length;
  const internalCount = items.filter((item) => item.visibility === "internal").length;

  const togglePinned = async (item: MemoryItem) => {
    try {
      await upsertItem({ ...item, pinned: !item.pinned });
    } catch {
      toast.error("更新 pinned 状态失败");
    }
  };

  const toggleHidden = async (item: MemoryItem) => {
    try {
      await upsertItem({ ...item, hidden: !item.hidden });
    } catch {
      toast.error("更新隐藏状态失败");
    }
  };

  const handleDelete = async (item: MemoryItem) => {
    try {
      await deleteItem(item.id);
      toast.success("记忆已删除");
    } catch {
      toast.error("删除记忆失败");
    }
  };

  const handleSaveConfig = async () => {
    try {
      await saveConfig(draftConfig);
      toast.success("记忆服务连接已保存");
    } catch (error) {
      toast.error(`保存失败: ${String(error)}`);
    }
  };

  const handleOpenAddDialog = () => {
    if (!draftConfig.enabled || !draftConfig.base_url.trim() || !(draftConfig.access_token ?? "").trim()) {
      toast.error("先把记忆服务、地址和 access token 配好并保存");
      return;
    }
    setShowAddDialog(true);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              <Link2 size={13} />
              Memory Provider
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">AgentHub 统一接入 Memory Provider</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                长期记忆通过可切换的 Memory Provider 统一读写。当前先提供 Memos，后续可以继续扩展别的后端，
                聊天时再按 `global / thread / agent` 取回相关内容。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Items</div>
              <div className="mt-2 text-2xl font-semibold">{items.length}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Pinned</div>
              <div className="mt-2 text-2xl font-semibold">{pinnedCount}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Internal</div>
              <div className="mt-2 text-2xl font-semibold">{internalCount}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Status</div>
              <div className="mt-2 text-sm font-medium">
                {connection.connected ? "Connected" : connection.configured ? "Disconnected" : "Not ready"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-border/60 bg-card/75 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Connection</div>
            <h2 className="mt-1 text-lg font-semibold">Memory Provider 连接配置</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              先选记忆服务，再填写对应的地址和 access token。连接正常后，Memory 页新增/删除/检索都会直接走当前 provider。
            </p>
          </div>

          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
              connection.connected
                ? "bg-emerald-500/10 text-emerald-600"
                : connection.configured
                  ? "bg-amber-500/10 text-amber-600"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", connection.connected ? "bg-emerald-500" : "bg-current/70")} />
            {connection.connected ? `已连接${connection.current_user ? ` · ${connection.current_user}` : ""}` : "未连接"}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[120px_160px_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <label className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-background/75 px-3 py-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={draftConfig.enabled}
              onChange={(event) => setDraftConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
              className="rounded border-border"
            />
            启用
          </label>
          <select
            value={draftConfig.provider}
            onChange={(event) =>
              setDraftConfig((prev) => ({ ...prev, provider: event.target.value as MemoryProviderConfig["provider"] }))
            }
            className={shellInputClass}
          >
            {MEMORY_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={draftConfig.base_url}
            onChange={(event) => setDraftConfig((prev) => ({ ...prev, base_url: event.target.value }))}
            className={shellInputClass}
            placeholder={
              draftConfig.provider === "openmem"
                ? "https://memos.memtensor.cn 或完整 /api/openmem/v1"
                : "http://127.0.0.1:5230"
            }
          />
          <input
            value={draftConfig.access_token ?? ""}
            onChange={(event) => setDraftConfig((prev) => ({ ...prev, access_token: event.target.value }))}
            className={shellInputClass}
            placeholder="access token / PAT"
            type="password"
          />
          <button
            onClick={() => {
              void handleSaveConfig();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            保存
          </button>
          <button
            onClick={() => {
              void loadDashboard();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border/70 px-4 py-2.5 text-sm hover:bg-muted/40"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            刷新
          </button>
        </div>

        {connection.last_error && (
          <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-700">
            {connection.last_error}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Knowledge</div>
                <h2 className="mt-1 text-lg font-semibold">{connection.provider_label} 中的长期记忆</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleOpenAddDialog}
                  className="inline-flex items-center gap-2 rounded-2xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
                >
                  <Plus size={14} />
                  新增记忆
                </button>
                <button
                  onClick={() => {
                    void loadDashboard();
                  }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-border/70 px-4 py-2.5 text-sm hover:bg-muted/40"
                >
                  <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                  刷新
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className={shellInputClass}
                placeholder="搜索内容、scope、tag..."
              />
              <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} className={shellInputClass}>
                <option value="all">全部 scope</option>
                <option value="global">Global</option>
                <option value="thread">Thread</option>
                <option value="agent">Agent</option>
              </select>
              <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className={shellInputClass}>
                <option value="all">全部可见性</option>
                <option value="visible">Visible</option>
                <option value="internal">Internal</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center rounded-[24px] border border-border/60 bg-card/70 py-12">
                <Loader2 size={22} className="animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length ? (
              filteredItems.map((item) => (
                <div key={item.id} className="rounded-[24px] border border-border/60 bg-card/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                          {memoryKindLabel(item.kind)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          {scopeLabel(item.scope, item.scope_id)}
                        </span>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                          {item.visibility}
                        </span>
                        {item.hidden && (
                          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-600">
                            hidden
                          </span>
                        )}
                      </div>

                      <p className="max-w-2xl text-sm leading-6">{item.content}</p>

                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                        <span>source: {item.source}</span>
                        <span>confidence: {item.confidence.toFixed(2)}</span>
                        <span>updated: {formatTime(item.updated_at)}</span>
                        <span>last used: {formatTime(item.last_used_at)}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => {
                          void togglePinned(item);
                        }}
                        disabled={connection.provider === "openmem"}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                          item.pinned
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border/60 bg-background/70 text-muted-foreground hover:text-foreground",
                        )}
                        title={connection.provider === "openmem" ? "OpenMem 模式暂不支持置顶编辑" : item.pinned ? "取消置顶" : "置顶"}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        onClick={() => {
                          void toggleHidden(item);
                        }}
                        disabled={connection.provider === "openmem"}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                        title={connection.provider === "openmem" ? "OpenMem 模式暂不支持隐藏编辑" : item.hidden ? "重新参与注入" : "从注入中隐藏"}
                      >
                        <EyeOff size={14} />
                      </button>
                      <button
                        onClick={() => {
                          void handleDelete(item);
                        }}
                        disabled={connection.provider === "openmem" && !item.id.startsWith("openmem-memory:") && !item.id.startsWith("openmem-preference:")}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition-colors hover:border-rose-500/30 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-45"
                        title={
                          connection.provider === "openmem" && !item.id.startsWith("openmem-memory:") && !item.id.startsWith("openmem-preference:")
                            ? "OpenMem 当前只支持删除已检索出的 memory 片段"
                            : "删除记忆"
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center text-sm text-muted-foreground">
                {connection.connected
                  ? `${connection.provider_label} 里还没有 AgentHub 管理的长期记忆。`
                  : "先连上记忆服务，再开始写入长期记忆。"}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Capability Profile</div>
              <h2 className="mt-1 text-lg font-semibold">当前环境画像</h2>
            </div>

            {profiles.map((profile) => (
              <div key={profile.id} className="rounded-[20px] border border-border/60 bg-background/65 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {profile.scope === "global" ? "Global Profile" : `${profile.scope} Profile`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {profile.source} · 更新于 {formatTime(profile.updated_at)}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {profile.scope}
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <Sparkles size={12} />
                      Skills
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.enabled_skills.length ? (
                        profile.enabled_skills.map((skill) => (
                          <span key={skill} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">未记录</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <Database size={12} />
                      MCP
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.enabled_mcp_servers.length ? (
                        profile.enabled_mcp_servers.map((server) => (
                          <span key={server} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                            {server}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">未记录</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <ArrowUpRight size={12} />
                      Models / Providers
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div>模型：{profile.preferred_models.length ? profile.preferred_models.join(" / ") : "未记录"}</div>
                      <div>Provider：{profile.preferred_providers.length ? profile.preferred_providers.join(" / ") : "未记录"}</div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <Shield size={12} />
                      Secret Refs
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.secret_refs.length ? (
                        profile.secret_refs.map((secretRef) => (
                          <span key={secretRef} className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                            {secretRef}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">未记录</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border border-border/60 bg-card/75 p-5">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">External Sources</div>
              <h2 className="mt-1 text-lg font-semibold">已发现的外部记忆源</h2>
            </div>

            <div className="space-y-3">
              {externalSources.map((source) => (
                <div key={source.agent_id} className="rounded-[20px] border border-border/60 bg-background/65 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {source.agent_icon} {source.agent_name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{source.memory_dir}</div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {source.memory_count}
                    </span>
                  </div>
                </div>
              ))}

              {!externalSources.length && (
                <div className="rounded-[20px] border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  当前没有扫到外部 memory 文件。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {showAddDialog && (
        <AddMemoryDialog
          threads={threads}
          agents={agents}
          onClose={() => setShowAddDialog(false)}
          onSubmit={async (item) => {
            try {
              await upsertItem(item);
              toast.success("记忆已写入当前服务");
            } catch {
              toast.error("写入记忆失败");
              throw new Error("save-failed");
            }
          }}
        />
      )}

      {saving && (
        <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground shadow-lg">
          <Loader2 size={12} className="animate-spin" />
          正在同步到 {connection.provider_label}
        </div>
      )}
    </div>
  );
}
