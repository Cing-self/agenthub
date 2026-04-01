import { useEffect, useState } from "react";
import { BarChart3, MessageSquare, Layers, Wrench, RefreshCw, Loader2 } from "lucide-react";

interface DailyActivity {
  date: string;
  message_count: number;
  session_count: number;
  tool_call_count: number;
}

interface AgentActivity {
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  daily: DailyActivity[];
  total_messages: number;
  total_sessions: number;
  total_tool_calls: number;
  source_file: string;
}

interface TokenSummary {
  agents: AgentActivity[];
  total_messages: number;
  total_sessions: number;
  total_tool_calls: number;
  proxy_active: boolean;
  proxy_port: number;
}

export default function TokenMonitorPage() {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<TokenSummary>("get_token_usage");
      setSummary(data);
    } catch (err) {
      console.error("Failed to load token usage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsage(); }, []);

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <BarChart3 size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Token Monitor</h1>
            <p className="text-sm text-muted-foreground">Activity data from local agent files</p>
          </div>
        </div>
        <button onClick={loadUsage} disabled={loading} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
      )}

      {summary && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={<MessageSquare size={16} />} label="Total Messages" value={fmt(summary.total_messages)} />
            <StatCard icon={<Layers size={16} />} label="Total Sessions" value={fmt(summary.total_sessions)} />
            <StatCard icon={<Wrench size={16} />} label="Tool Calls" value={fmt(summary.total_tool_calls)} />
          </div>

          {/* Per-agent breakdown */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Per-Agent Activity</h2>
            {summary.agents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No activity data found. Agent stats files may not exist yet.
              </div>
            ) : (
              <div className="space-y-3">
                {summary.agents.map((agent) => (
                  <AgentCard key={agent.agent_id} agent={agent} fmt={fmt} />
                ))}
              </div>
            )}
          </div>

          {/* Daily activity chart for Claude Code (if has daily data) */}
          {summary.agents.some((a) => a.daily.length > 0) && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Daily Activity</h2>
              {summary.agents
                .filter((a) => a.daily.length > 0)
                .map((agent) => (
                  <div key={agent.agent_id} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span>{agent.agent_icon}</span>
                      <span className="text-sm font-medium">{agent.agent_name}</span>
                      <span className="text-xs text-muted-foreground">— last {Math.min(agent.daily.length, 14)} days</span>
                    </div>
                    <div className="flex items-end gap-1 h-24">
                      {agent.daily.slice(-14).map((day, i) => {
                        const maxMsg = Math.max(...agent.daily.slice(-14).map((d) => d.message_count), 1);
                        const height = (day.message_count / maxMsg) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${day.message_count} msgs, ${day.session_count} sessions, ${day.tool_call_count} tools`}>
                            <div className="w-full bg-primary/20 rounded-sm relative" style={{ height: "100%" }}>
                              <div
                                className="absolute bottom-0 w-full bg-primary rounded-sm transition-all"
                                style={{ height: `${height}%` }}
                              />
                            </div>
                            <span className="text-[8px] text-muted-foreground/50 rotate-[-45deg] origin-center">
                              {day.date.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function AgentCard({ agent, fmt }: { agent: AgentActivity; fmt: (n: number) => string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{agent.agent_icon}</span>
        <span className="font-medium text-sm">{agent.agent_name}</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">Messages</div>
          <div className="font-mono">{fmt(agent.total_messages)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Sessions</div>
          <div className="font-mono">{fmt(agent.total_sessions)}</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">Tool Calls</div>
          <div className="font-mono">{fmt(agent.total_tool_calls)}</div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/50 mt-2 truncate" title={agent.source_file}>
        Source: {agent.source_file.split("/").slice(-2).join("/")}
      </div>
    </div>
  );
}
