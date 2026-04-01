import type { DetectedAgent } from "@/lib/types/agents";

interface AgentSwitchRailProps {
  agents: DetectedAgent[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  className?: string;
}

export function AgentSwitchRail({
  agents,
  selectedAgentId,
  onSelectAgent,
  className,
}: AgentSwitchRailProps) {
  const orderedAgents = [...agents].sort((left, right) => {
    if (left.id === selectedAgentId) return -1;
    if (right.id === selectedAgentId) return 1;
    if (left.id === "dolphin") return -1;
    if (right.id === "dolphin") return 1;
    if (left.running !== right.running) return left.running ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-[16px] border border-white/40 bg-white/72 px-2.5 py-2 shadow-[0_18px_48px_-40px_rgba(83,48,26,0.42)] dark:border-white/8 dark:bg-white/[0.04]">
      <select
        value={selectedAgentId}
        onChange={(event) => onSelectAgent(event.target.value)}
        disabled={agents.length === 0}
        className={
          className ??
          "min-w-[170px] max-w-[220px] appearance-none rounded-[10px] border border-black/8 bg-white/80 px-3 py-1.5 text-[13px] font-medium outline-none transition-colors hover:border-black/12 focus:border-foreground/20 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.06]"
        }
      >
        {orderedAgents.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}
