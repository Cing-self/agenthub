import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { CLI_MARKET, type CliMarketEntry } from "@/lib/cli-market";
import type { DetectedAgent } from "@/lib/types/agents";
import { useAgentsStore } from "@/stores/agents-store";
import { cn } from "@/lib/utils";

type CliProbe = {
  id: string;
  path: string | null;
  version: string | null;
  installed: boolean;
  error?: string | null;
};

async function runShell(command: string, timeoutSecs = 15) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<{ stdout: string; stderr: string; success: boolean }>("run_shell_cmd", {
    command,
    timeoutSecs,
  });
}

async function probeCli(entry: CliMarketEntry): Promise<CliProbe> {
  try {
    const pathResult = await runShell(`command -v ${entry.binary} 2>/dev/null || true`);
    const path = pathResult.stdout.trim() || null;

    if (!path) {
      return {
        id: entry.id,
        path: null,
        version: null,
        installed: false,
        error: "未在 PATH 中找到可执行文件",
      };
    }

    let version: string | null = null;
    for (const arg of entry.versionArgs) {
      const result = await runShell(`${entry.binary} ${arg} 2>&1 || true`);
      const line = result.stdout.trim();
      if (line) {
        version = line;
        break;
      }
    }

    return {
      id: entry.id,
      path,
      version,
      installed: true,
      error: null,
    };
  } catch (error) {
    return {
      id: entry.id,
      path: null,
      version: null,
      installed: false,
      error: error instanceof Error ? error.message : "检测失败",
    };
  }
}

function compactVersion(version: string | null) {
  if (!version) return "未检测到版本";
  return version.split("\n").map((line) => line.trim()).find(Boolean) || "未检测到版本";
}

function InstanceChip({ agent }: { agent: DetectedAgent }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-foreground/80">
      <span>{agent.icon}</span>
      <span>{agent.name}</span>
      <span className={cn("h-1.5 w-1.5 rounded-full", agent.running ? "bg-emerald-500" : "bg-muted-foreground/35")} />
    </span>
  );
}

function InstallButton({
  entry,
  installed,
  busy,
  onInstall,
}: {
  entry: CliMarketEntry;
  installed: boolean;
  busy: boolean;
  onInstall: (entry: CliMarketEntry, upgrade: boolean) => void;
}) {
  return (
    <button
      onClick={() => onInstall(entry, installed)}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-50",
        installed
          ? "border border-border/70 bg-background/70 text-foreground hover:bg-background"
          : "bg-foreground text-background hover:opacity-90",
      )}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
      {installed ? "升级" : "一键安装"}
    </button>
  );
}

export default function CliPage() {
  const { agents, loading: agentsLoading, refresh } = useAgentsStore();
  const [search, setSearch] = useState("");
  const [checking, setChecking] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installLogs, setInstallLogs] = useState<Record<string, string>>({});
  const [probes, setProbes] = useState<Record<string, CliProbe>>({});

  const loadState = useCallback(async () => {
    setChecking(true);
    try {
      await refresh();
      const detected = await Promise.all(CLI_MARKET.map(probeCli));
      setProbes(Object.fromEntries(detected.map((item) => [item.id, item])));
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return CLI_MARKET;
    return CLI_MARKET.filter((entry) =>
      [entry.name, entry.vendor, entry.category, entry.description, entry.binary, ...(entry.badges ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  const totalInstalled = useMemo(
    () => CLI_MARKET.filter((entry) => probes[entry.id]?.installed).length,
    [probes],
  );

  const linkedAgents = useMemo(() => {
    return CLI_MARKET.reduce<Record<string, DetectedAgent[]>>((acc, entry) => {
      acc[entry.id] = entry.agentType ? agents.filter((agent) => agent.agent_type === entry.agentType) : [];
      return acc;
    }, {});
  }, [agents]);

  const handleInstall = async (entry: CliMarketEntry, upgrade: boolean) => {
    const command = upgrade ? entry.upgradeCommand || entry.installCommand : entry.installCommand;
    setInstallingId(entry.id);
    setInstallLogs((prev) => ({
      ...prev,
      [entry.id]: `> ${command}\n\n安装中...`,
    }));

    try {
      const result = await runShell(command, 900);
      const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n\n");
      setInstallLogs((prev) => ({
        ...prev,
        [entry.id]: `> ${command}\n\n${output || "命令已执行，没有返回额外输出。"}`,
      }));

      if (result.success) {
        toast.success(`${entry.name} 已完成${upgrade ? "升级" : "安装"}`);
      } else {
        toast.error(`${entry.name}${upgrade ? "升级" : "安装"}失败`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInstallLogs((prev) => ({
        ...prev,
        [entry.id]: `> ${command}\n\n${message}`,
      }));
      toast.error(`${entry.name}${upgrade ? "升级" : "安装"}失败`);
    } finally {
      setInstallingId(null);
      await loadState();
    }
  };

  const copyCommand = async (entry: CliMarketEntry) => {
    try {
      await navigator.clipboard.writeText(entry.installCommand);
      toast.success("安装命令已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold">CLI Market</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            统一发现、安装和接入本机 CLI runtime。当前先提供官方精选清单，后面再扩展社区源和自定义 registry。
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 CLI、厂商或关键词..."
              className="w-full rounded-xl border border-border/70 bg-background/75 py-2 pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 sm:w-[280px]"
            />
          </div>
          <button
            onClick={() => {
              void loadState();
            }}
            disabled={checking}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            刷新
          </button>
        </div>
      </div>

      <SettingsGroup title="Overview" description="市场和当前本机环境会合并展示，方便你知道哪些已经装了、哪些只是可发现。">
        <div className="flex min-h-[52px] items-center justify-between px-1">
          <span className="text-[13px]">市场条目</span>
          <span className="text-[13px] text-muted-foreground">{CLI_MARKET.length} 个</span>
        </div>
        <div className="flex min-h-[52px] items-center justify-between px-1">
          <span className="text-[13px]">已安装 CLI</span>
          <span className="text-[13px] text-muted-foreground">{totalInstalled} 个</span>
        </div>
        <div className="flex min-h-[52px] items-center justify-between px-1">
          <span className="text-[13px]">已检测 Agent</span>
          <span className="text-[13px] text-muted-foreground">{agents.length} 个</span>
        </div>
        <div className="flex min-h-[52px] items-center justify-between px-1">
          <span className="text-[13px]">环境状态</span>
          <span className="text-[13px] text-muted-foreground">
            {checking || agentsLoading ? "扫描中..." : "已同步"}
          </span>
        </div>
      </SettingsGroup>

      <div className="grid gap-4">
        {filteredEntries.map((entry) => {
          const probe = probes[entry.id];
          const installed = probe?.installed ?? false;
          const agentsForEntry = linkedAgents[entry.id] ?? [];
          const busy = installingId === entry.id;

          return (
            <section
              key={entry.id}
              className="rounded-[26px] border border-border/60 bg-card/75 p-5 shadow-[0_20px_56px_-46px_rgba(83,48,26,0.28)]"
            >
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Terminal size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[15px] font-semibold">{entry.name}</h2>
                          <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                            {entry.sourceLabel}
                          </span>
                          <span className="rounded-full bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {entry.category}
                          </span>
                        </div>
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          {entry.vendor} · <span className="font-mono">{entry.binary}</span>
                        </div>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-foreground/80">
                          {entry.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                          installed
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-300",
                        )}
                      >
                        {installed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {installed ? "已安装" : "未安装"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                        <Sparkles size={12} />
                        {compactVersion(probe?.version ?? null)}
                      </span>
                      {(entry.badges ?? []).map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <InstallButton entry={entry} installed={installed} busy={busy} onInstall={handleInstall} />
                    <button
                      onClick={() => {
                        void copyCommand(entry);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Copy size={14} />
                      复制命令
                    </button>
                    <a
                      href={entry.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      文档
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Install Command</div>
                    <div className="mt-2 break-all font-mono text-[12px] leading-6 text-foreground/85">
                      {entry.installCommand}
                    </div>
                    {entry.note && (
                      <div className="mt-3 text-[12px] leading-6 text-muted-foreground">{entry.note}</div>
                    )}
                    {probe?.path && (
                      <div className="mt-3 text-[12px] text-muted-foreground">
                        当前路径：<span className="font-mono text-foreground/80">{probe.path}</span>
                      </div>
                    )}
                    {probe?.error && !installed && (
                      <div className="mt-3 text-[12px] text-muted-foreground">{probe.error}</div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Agent Bindings</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {agentsForEntry.length ? (
                        agentsForEntry.map((agent) => <InstanceChip key={agent.id} agent={agent} />)
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          当前还没有检测到对应实例，安装后刷新即可重新绑定。
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {installLogs[entry.id] && (
                  <div className="rounded-2xl border border-border/60 bg-black/[0.03] px-4 py-3 dark:bg-white/[0.03]">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Install Output</div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-6 text-foreground/80">
                      {installLogs[entry.id]}
                    </pre>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {!filteredEntries.length && (
          <div className="rounded-[26px] border border-dashed border-border/70 px-6 py-12 text-center text-sm text-muted-foreground">
            没有找到匹配的 CLI。后面我也可以继续帮你把自定义 registry 和社区源加进去。
          </div>
        )}
      </div>
    </div>
  );
}
