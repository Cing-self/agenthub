import { useEffect } from "react";
import { useAgentsStore } from "@/stores/agents-store";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { useAuthStore } from "@/stores/auth-store";

export default function DashboardPage() {
  const { agents, totalRunning, totalDetected, refresh } = useAgentsStore();
  const { user } = useAuthStore();

  useEffect(() => { refresh(); }, [refresh]);

  const running = agents.filter(a => a.running);
  const stopped = agents.filter(a => !a.running);

  return (
    <div className="space-y-6 max-w-2xl pb-8">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          {totalRunning} 个 Agent 运行中 / {totalDetected} 个已检测
        </p>
      </div>

      {/* Running agents */}
      <SettingsGroup title={`运行中 (${running.length})`}>
        {running.length === 0 ? (
          <div className="min-h-[44px] px-1 flex items-center text-[13px] text-muted-foreground">没有运行中的 Agent</div>
        ) : (
          running.map(agent => (
            <a key={agent.id} href={`/agent/${agent.id}`}
              className="flex items-center gap-3 min-h-[48px] px-1 hover:bg-foreground/[0.03] rounded-lg transition-colors">
              <span className="text-lg">{agent.icon}</span>
              <div className="flex-1">
                <div className="text-[13px] font-medium">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground">PID {agent.pid} · {agent.agent_type}</div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </a>
          ))
        )}
      </SettingsGroup>

      {/* Stopped agents */}
      {stopped.length > 0 && (
        <SettingsGroup title={`未运行 (${stopped.length})`}>
          {stopped.map(agent => (
            <a key={agent.id} href={`/agent/${agent.id}`}
              className="flex items-center gap-3 min-h-[44px] px-1 hover:bg-foreground/[0.03] rounded-lg transition-colors">
              <span className="text-lg">{agent.icon}</span>
              <div className="flex-1">
                <div className="text-[13px]">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground">{agent.agent_type}</div>
              </div>
              <span className="w-2 h-2 rounded-full bg-muted-foreground/20" />
            </a>
          ))}
        </SettingsGroup>
      )}

      {/* Quick stats */}
      <SettingsGroup title="快捷信息">
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <span className="text-[13px]">账户</span>
          <span className="text-[13px] text-muted-foreground">{user ? `@${user.login}` : "未登录"}</span>
        </div>
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <span className="text-[13px]">远程主机</span>
          <span className="text-[13px] text-muted-foreground">0 台</span>
        </div>
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <span className="text-[13px]">配置目录</span>
          <span className="text-[12px] text-muted-foreground font-mono">~/.agenthub/</span>
        </div>
      </SettingsGroup>
    </div>
  );
}
