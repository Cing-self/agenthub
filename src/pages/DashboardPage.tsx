import { useEffect } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AgentDashboardDeck } from "@/components/agents/AgentDashboardDeck";
import { useAgentsStore } from "@/stores/agents-store";

export default function DashboardPage() {
  const { agents, loading, refresh } = useAgentsStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedAgentId = searchParams.get("agent") ?? "";
  const fallbackAgentId = agents.find((item) => item.running)?.id || agents[0]?.id || "";
  const selectedAgentId = agents.some((item) => item.id === requestedAgentId)
    ? requestedAgentId
    : fallbackAgentId;

  useEffect(() => {
    if (!selectedAgentId || requestedAgentId === selectedAgentId) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("agent", selectedAgentId);
    setSearchParams(nextParams, { replace: true });
  }, [requestedAgentId, searchParams, selectedAgentId, setSearchParams]);

  const handleSelectAgent = (agentId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("agent", agentId);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              总览所有 Agent 的运行状态、切换焦点和当前可用性
            </p>
          </div>
        </div>
        <button
          onClick={() => refresh()}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <AgentDashboardDeck
        agents={agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={handleSelectAgent}
        onRefresh={() => refresh()}
        refreshing={loading}
      />
    </div>
  );
}
