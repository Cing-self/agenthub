import { Activity, Bot, Layers3, RefreshCw, Sparkles } from "lucide-react";
import type { DetectedAgent } from "@/lib/types/agents";
import { cn } from "@/lib/utils";
import {
  MetaPill,
  StatCard,
  StatusBadge,
  getAgentRuntimeLabel,
  getAgentSummary,
  getAgentTone,
} from "./agent-display";

interface AgentDashboardDeckProps {
  agents: DetectedAgent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function AgentDashboardDeck({
  agents,
  selectedAgentId,
  onSelectAgent,
  onRefresh,
  refreshing = false,
}: AgentDashboardDeckProps) {
  const selectedAgent = agents.find((item) => item.id === selectedAgentId) ?? agents[0];
  const selectedTone = getAgentTone(selectedAgent);
  const onlineCount = agents.filter((item) => item.running).length;
  const orderedAgents = [...agents].sort((left, right) => {
    if (left.id === selectedAgentId) return -1;
    if (right.id === selectedAgentId) return 1;
    if (left.running !== right.running) return left.running ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/40 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(247,242,236,0.82))] p-5 shadow-[0_34px_100px_-56px_rgba(83,48,26,0.4)] dark:border-white/8 dark:bg-[linear-gradient(135deg,rgba(28,28,28,0.9),rgba(16,16,16,0.96))]">
      <div className="pointer-events-none absolute inset-0">
        <div className={cn("absolute -right-12 -top-14 h-40 w-40 rounded-full blur-3xl", selectedTone.glow)} />
        <div className="absolute bottom-0 left-[18%] h-24 w-24 rounded-full bg-white/35 blur-3xl dark:bg-white/[0.05]" />
      </div>

      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-muted-foreground">Agent Dashboard</div>
            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.04em]">Fleet overview and switchboard</h2>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white/65 px-3 py-1.5 text-[12px] text-foreground/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] hover:bg-white/85 dark:border-white/8 dark:bg-white/[0.05] dark:text-foreground/75 dark:hover:bg-white/[0.08]"
            >
              <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
              Refresh
            </button>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_320px]">
          <div className={cn("overflow-hidden rounded-[28px] border p-5", selectedTone.hero)}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className={cn("flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-[22px] text-[30px]", selectedTone.icon)}>
                  {selectedAgent?.icon || "💬"}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-black/6 bg-white/58 px-2.5 py-1 text-[11px] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/8 dark:bg-white/[0.05]">
                      当前焦点
                    </span>
                    {selectedAgent && <StatusBadge running={selectedAgent.running} />}
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
                    <h3 className="text-[30px] font-semibold tracking-[-0.04em] text-foreground">
                      {selectedAgent?.name || "未检测到 Agent"}
                    </h3>
                    {selectedAgent?.version && (
                      <span className="pb-1 text-[12px] text-muted-foreground">
                        v{selectedAgent.version}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                    {selectedAgent
                      ? `${getAgentRuntimeLabel(selectedAgent)} · ${getAgentSummary(selectedAgent)}`
                      : "当前还没有检测到可展示的 Agent。"}
                  </p>
                </div>
              </div>

              {selectedAgent && (
                <div className="grid grid-cols-2 gap-2 sm:min-w-[210px]">
                  <MetaPill icon={<Bot size={13} />} label={getAgentRuntimeLabel(selectedAgent)} />
                  <MetaPill
                    icon={<Activity size={13} />}
                    label={selectedAgent.running ? `PID ${selectedAgent.pid ?? "active"}` : "等待启动"}
                  />
                  <MetaPill icon={<Sparkles size={13} />} label={selectedAgent.version ? `v${selectedAgent.version}` : "未记录版本"} />
                  <MetaPill icon={<Layers3 size={13} />} label={`${agents.length} 个 Agent`} />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <StatCard
              label="在线"
              value={String(onlineCount)}
              hint={`${agents.length} 个 Agent 中可立即接管的数量`}
            />
            <StatCard
              label="待机"
              value={String(Math.max(agents.length - onlineCount, 0))}
              hint="已检测到但当前未运行的运行时"
            />
            <StatCard
              label="焦点"
              value={selectedAgent ? selectedAgent.name : "未选择"}
              hint="点击下方卡片即可切换当前焦点对象"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orderedAgents.map((item) => {
            const tone = getAgentTone(item);
            const selected = item.id === selectedAgentId;

            return (
              <button
                key={item.id}
                onClick={() => onSelectAgent(item.id)}
                className={cn(
                  "group relative overflow-hidden rounded-[24px] border p-4 text-left transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-40px_rgba(66,37,22,0.26)]",
                  tone.deck,
                  selected && tone.deckSelected,
                )}
              >
                <div className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className={cn("absolute inset-0", tone.hero)} />
                </div>

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] text-[22px]", selected ? tone.icon : "bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-white/[0.06]")}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
                          {item.name}
                        </span>
                        {selected && (
                          <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/[0.08] dark:text-foreground/75">
                            当前
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        {getAgentRuntimeLabel(item)}
                      </div>
                    </div>
                  </div>

                  <StatusBadge running={item.running} />
                </div>

                <div className="relative mt-4 flex items-end justify-between gap-3">
                  <p className="line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                    {getAgentSummary(item)}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {item.version ? `v${item.version}` : "local"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
