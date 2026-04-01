import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Plug, Wrench, Zap, Lock, Settings, RefreshCw, Loader2,
  BarChart3, Eye, Brain, Network, DollarSign, User, Cloud,
  PanelLeftClose, PanelLeftOpen, MessageSquare, ListTodo, Clock, Send, Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import { useModeStore } from "@/stores/mode-store";
import { useAuthStore } from "@/stores/auth-store";

interface NavItem { label: string; icon: React.ReactNode; path: string; }

// Config mode nav — Dashboard is separate (top-level)
const configDashboard: NavItem = { label: "Dashboard", icon: <LayoutDashboard size={16} />, path: "/dashboard" };
const configResourceNav: NavItem[] = [
  { label: "Models", icon: <Plug size={16} />, path: "/models" },
  { label: "CLI", icon: <Terminal size={16} />, path: "/cli" },
  { label: "MCP Servers", icon: <Wrench size={16} />, path: "/mcp" },
  { label: "Skills", icon: <Zap size={16} />, path: "/skills" },
  { label: "Secrets", icon: <Lock size={16} />, path: "/secrets" },
];
const configMonitorNav: NavItem[] = [
  { label: "Token Monitor", icon: <BarChart3 size={16} />, path: "/tokens" },
  { label: "API Usage", icon: <DollarSign size={16} />, path: "/usage" },
  { label: "Prompt Inspector", icon: <Eye size={16} />, path: "/prompts" },
  { label: "Memory", icon: <Brain size={16} />, path: "/memory" },
  { label: "Collaboration", icon: <Network size={16} />, path: "/collab" },
];

// Work mode nav
const workNav: NavItem[] = [
  { label: "对话", icon: <Send size={16} />, path: "/work/chat" },
  { label: "消息", icon: <MessageSquare size={16} />, path: "/work/messages" },
  { label: "任务", icon: <ListTodo size={16} />, path: "/work/tasks" },
  { label: "定时", icon: <Clock size={16} />, path: "/work/cron" },
];

function NavLink_({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink to={item.path}
      className={({ isActive }) => cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground",
        isActive ? "bg-sidebar-accent text-foreground font-medium" : "text-sidebar-foreground"
      )} title={item.label}>
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

function AgentInstances({ collapsed }: { collapsed: boolean }) {
  const { agents, loading, refresh } = useAgentsStore();

  return (
    <div>
      {!collapsed && (
        <div className="flex items-center justify-between px-3 pt-4 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Agents</span>
          <button onClick={() => refresh()} className="text-muted-foreground/50 hover:text-foreground transition-colors" title="Refresh">
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
        </div>
      )}
      <nav className="flex flex-col gap-0.5 px-2 mt-1">
        {agents.length === 0 && !loading && !collapsed && (
          <div className="px-2.5 py-1.5 text-xs text-muted-foreground/50">No agents detected</div>
        )}
        {agents.map((agent) => (
          <NavLink key={agent.id}
            to={`/agent/${agent.id}`}
            className={({ isActive }) => cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
              "hover:bg-sidebar-accent hover:text-foreground",
              isActive ? "bg-sidebar-accent text-foreground font-medium" : "text-sidebar-foreground"
            )} title={`${agent.name}${agent.running ? " (Running)" : ""}`}>
            <span className="text-sm leading-none">{agent.icon}</span>
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{agent.name}</span>
                <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", agent.running ? "bg-emerald-400" : "bg-zinc-500/40")} />
              </>
            )}
          </NavLink>
        ))}
        {!collapsed && (
          <NavLink to="/remote-hosts"
            className={({ isActive }) => cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors mt-1",
              "hover:bg-sidebar-accent hover:text-foreground",
              isActive ? "bg-sidebar-accent text-foreground" : "text-muted-foreground/50"
            )}>
            <span className="text-[11px]">＋</span>
            <span>添加远程主机</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { totalRunning, totalDetected, refresh } = useAgentsStore();
  const { mode, setMode } = useModeStore();
  const authUser = useAuthStore(s => s.user);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, 15000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  return (
    <aside className={cn("flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
      collapsed ? "w-[52px]" : "w-[210px]")}>

      {/* Top: Logo + collapse */}
      <div className={cn("flex items-center gap-2 px-3 py-2.5", collapsed && "justify-center")}>
        {collapsed ? (
          <button onClick={() => setCollapsed(false)}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors" title="Expand">
            <PanelLeftOpen size={15} />
          </button>
        ) : (
          <>
            <span className="text-lg flex-shrink-0">⬡</span>
            <span className="text-[13px] font-semibold text-foreground flex-1">AgentHub</span>
            <div className="flex items-center gap-1.5" title={`${totalRunning} running / ${totalDetected} detected`}>
              <span className={cn("h-1.5 w-1.5 rounded-full", totalRunning > 0 ? "bg-emerald-400" : "bg-zinc-500")} />
              <span className="text-[10px] text-muted-foreground/60">{totalRunning}/{totalDetected}</span>
            </div>
            <button onClick={() => setCollapsed(true)}
              className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors flex-shrink-0" title="Collapse">
              <PanelLeftClose size={14} />
            </button>
          </>
        )}
      </div>

      {/* Mode switcher */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <div className="flex rounded-lg bg-sidebar-accent/50 p-0.5">
            <button onClick={() => setMode("work")}
              className={cn("flex-1 text-[11px] py-1 rounded-md transition-colors",
                mode === "work" ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
              Work
            </button>
            <button onClick={() => setMode("config")}
              className={cn("flex-1 text-[11px] py-1 rounded-md transition-colors",
                mode === "config" ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:text-foreground")}>
              Config
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-0 pt-1">
        {mode === "work" ? (
          <>
            {!collapsed && (
              <div className="px-3 pt-1 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">工作</span>
              </div>
            )}
            <nav className="flex flex-col gap-0.5 px-2">
              {workNav.map(item => <NavLink_ key={item.path} item={item} collapsed={collapsed} />)}
            </nav>
          </>
        ) : (
          <>
            {/* Dashboard — top level */}
            <nav className="flex flex-col gap-0.5 px-2 mb-2">
              <NavLink_ item={configDashboard} collapsed={collapsed} />
            </nav>

            {!collapsed && (
              <div className="px-3 pt-1 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Resources</span>
              </div>
            )}
            <nav className="flex flex-col gap-0.5 px-2">
              {configResourceNav.map(item => <NavLink_ key={item.path} item={item} collapsed={collapsed} />)}
            </nav>
            {!collapsed && (
              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Monitor</span>
              </div>
            )}
            <nav className="flex flex-col gap-0.5 px-2">
              {configMonitorNav.map(item => <NavLink_ key={item.path} item={item} collapsed={collapsed} />)}
            </nav>
          </>
        )}

        {mode === "config" && <AgentInstances collapsed={collapsed} />}
      </div>

      {/* Bottom */}
      <div className={cn("border-t border-sidebar-border/50 px-2 py-2", collapsed && "flex justify-center")}>
        <div className={cn("flex items-center gap-1.5", collapsed && "flex-col")}>
          <NavLink to="/account"
            className={({ isActive }) => cn(
              "flex items-center gap-2 rounded-lg transition-colors",
              collapsed ? "justify-center p-1.5" : "flex-1 min-w-0 px-2 py-1.5",
              "hover:bg-sidebar-accent hover:text-foreground", isActive ? "bg-sidebar-accent" : ""
            )} title="Account">
            {authUser ? (
              <img src={authUser.avatar_url} className="h-6 w-6 rounded-full flex-shrink-0" />
            ) : (
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 flex-shrink-0">
                <User size={13} className="text-primary" />
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-sidebar-foreground truncate">{authUser?.name || authUser?.login || "登录"}</div>
                <div className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                  {authUser ? <><Cloud size={9} /> 已连接</> : "未登录"}
                </div>
              </div>
            )}
          </NavLink>
          {!collapsed && (
            <NavLink to="/settings"
              className={({ isActive }) => cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-colors flex-shrink-0",
                "hover:bg-sidebar-accent hover:text-foreground",
                isActive ? "bg-sidebar-accent text-foreground" : "text-muted-foreground/40"
              )} title="Settings">
              <Settings size={15} />
            </NavLink>
          )}
        </div>
      </div>
    </aside>
  );
}
