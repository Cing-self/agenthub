import { useParams, NavLink, Routes, Route, Navigate } from "react-router-dom";
import { useAgentsStore } from "@/stores/agents-store";
import { cn } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import {
  Bot, Radio, Wrench, Puzzle, Globe, Clock, Zap, FileCode, RefreshCw, Settings,
} from "lucide-react";
import { toast } from "sonner";

// Sub-tab pages
import OverviewTab from "./instance-tabs/OverviewTab";
import OpenClawAgentsTab from "./instance-tabs/openclaw/AgentsTab";
import OpenClawChannelsTab from "./instance-tabs/openclaw/ChannelsTab";
import OpenClawToolsTab from "./instance-tabs/openclaw/ToolsTab";
import OpenClawPluginsTab from "./instance-tabs/openclaw/PluginsTab";
import OpenClawGatewayTab from "./instance-tabs/openclaw/GatewayTab";
import OpenClawRawTab from "./instance-tabs/openclaw/RawTab";
import ClaudeCodeModelTab from "./instance-tabs/claudecode/ModelTab";
import ClaudeCodeInteractionTab from "./instance-tabs/claudecode/InteractionTab";
import ClaudeCodePermissionsTab from "./instance-tabs/claudecode/PermissionsTab";
import ClaudeCodeAgentsTab from "./instance-tabs/claudecode/AgentsTab";
import ClaudeCodeMcpTab from "./instance-tabs/claudecode/McpTab";
import ClaudeCodeHooksTab from "./instance-tabs/claudecode/HooksTab";
import ClaudeCodeSkillsTab from "./instance-tabs/claudecode/SkillsTab";
import ClaudeCodePluginsTab from "./instance-tabs/claudecode/PluginsTab";
import CodexConfigTab from "./instance-tabs/codex/ConfigTab";

interface TabDef {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const OPENCLAW_TABS: TabDef[] = [
  { label: "Overview", path: "", icon: <Settings size={14} /> },
  { label: "Agents", path: "agents", icon: <Bot size={14} /> },
  { label: "Channels", path: "channels", icon: <Radio size={14} /> },
  { label: "Tools", path: "tools", icon: <Wrench size={14} /> },
  { label: "Plugins", path: "plugins", icon: <Puzzle size={14} /> },
  { label: "Gateway", path: "gateway", icon: <Globe size={14} /> },
  { label: "Raw", path: "raw", icon: <FileCode size={14} /> },
];

const CLAUDE_CODE_TABS: TabDef[] = [
  { label: "Overview", path: "", icon: <Settings size={14} /> },
  { label: "模型", path: "model", icon: <Bot size={14} /> },
  { label: "交互", path: "interaction", icon: <Globe size={14} /> },
  { label: "权限", path: "permissions", icon: <Wrench size={14} /> },
  { label: "协作", path: "agents", icon: <Bot size={14} /> },
  { label: "MCP", path: "mcp", icon: <Wrench size={14} /> },
  { label: "Hooks", path: "hooks", icon: <Settings size={14} /> },
  { label: "Skills", path: "skills", icon: <Puzzle size={14} /> },
  { label: "Plugins", path: "plugins", icon: <Puzzle size={14} /> },
];

const CODEX_TABS: TabDef[] = [
  { label: "Overview", path: "", icon: <Settings size={14} /> },
  { label: "配置", path: "config", icon: <Wrench size={14} /> },
];

export default function AgentInstancePage() {
  const { agentId, "*": subPath } = useParams();
  const { agents } = useAgentsStore();
  const agent = agents.find((a) => a.id === agentId);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Load the agent's config file
  // Only show loading spinner on first load, not on reloads (to preserve child state)
  const loadConfig = useCallback(async () => {
    if (!agent) return;
    if (!config) setConfigLoading(true); // only first load
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<Record<string, unknown>>("read_config", {
        configFile: agent.config_path,
      });
      setConfig(data);
    } catch (err) {
      console.error("Failed to load config:", err);
      if (!config) setConfig(null);
    } finally {
      setConfigLoading(false);
    }
  }, [agent]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Save a specific module back to the config file
  const saveConfigModule = useCallback(async (module: string, data: unknown) => {
    if (!agent) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_config_module", { module, data });
      toast.success(`Saved ${module}`);
      // Reload to stay in sync
      await loadConfig();
    } catch (err) {
      console.error("Failed to save config:", err);
      toast.error(`Failed to save: ${err}`);
    }
  }, [agent, loadConfig]);

  // Save the entire config (for Raw tab full JSON editing, and Claude Code tabs)
  const saveFullConfig = useCallback(async (newConfig: Record<string, unknown>) => {
    if (!agent) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (agent.agent_type === "claude-code" || agent.agent_type === "codex") {
        // Claude Code / Codex: write the entire file directly
        const jsonStr = JSON.stringify(newConfig, null, 2);
        await invoke("write_json_file", { path: agent.config_path, data: jsonStr });
      } else {
        // OpenClaw variants: write each top-level key as a module
        for (const [key, value] of Object.entries(newConfig)) {
          await invoke("write_config_module", { module: key, data: value });
        }
      }
      toast.success("Config saved");
      await loadConfig();
    } catch (err) {
      console.error("Failed to save config:", err);
      toast.error(`Failed to save: ${err}`);
    }
  }, [agent, loadConfig]);

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Agent not found. Waiting for scan...
      </div>
    );
  }

  const tabs =
    agent.agent_type === "openclaw"
      ? OPENCLAW_TABS
      : agent.agent_type === "claude-code"
      ? CLAUDE_CODE_TABS
      : CODEX_TABS;

  const basePath = `/agent/${agentId}`;

  return (
    <div className="space-y-4">
      {/* Agent header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{agent.name}</h1>
              {agent.version && (
                <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">
                  v{agent.version}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{agent.config_path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Launch / Restart / Open buttons */}
          {agent.running ? (
            <button
              onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  if (agent.pid) await invoke("kill_agent", { pid: agent.pid });
                  toast.success("正在重启...");
                  // Wait a moment then relaunch
                  setTimeout(async () => {
                    await invoke("launch_agent", { agentType: agent.agent_type === "openclaw" ? "openclaw" : agent.id, configPath: agent.config_path });
                    // Refresh agents list
                    const { useAgentsStore } = await import("@/stores/agents-store");
                    useAgentsStore.getState().refresh();
                  }, 1500);
                } catch (err) { toast.error(`重启失败: ${err}`); }
              }}
              className="text-[12px] text-muted-foreground/60 hover:text-foreground px-2 py-1 rounded transition-colors"
            >
              重启
            </button>
          ) : (
            <button
              onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("launch_agent", { agentType: agent.agent_type === "openclaw" ? "openclaw" : agent.id, configPath: agent.config_path });
                  toast.success("已启动");
                  setTimeout(async () => {
                    const { useAgentsStore } = await import("@/stores/agents-store");
                    useAgentsStore.getState().refresh();
                  }, 2000);
                } catch (err) { toast.error(`启动失败: ${err}`); }
              }}
              className="text-[12px] text-foreground/70 hover:text-foreground px-2 py-1 rounded transition-colors"
            >
              启动
            </button>
          )}

          {/* Status badge */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1",
              agent.running ? "bg-foreground/5" : "bg-foreground/[0.03]"
            )}
          >
            <div className={cn("h-1.5 w-1.5 rounded-full", agent.running ? "bg-emerald-500" : "bg-muted-foreground/30")} />
            <span className={cn("text-[11px]", agent.running ? "text-foreground/60" : "text-muted-foreground/40")}>
              {agent.running ? `PID ${agent.pid}` : "未运行"}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {tabs.map((tab) => {
          const to = tab.path ? `${basePath}/${tab.path}` : basePath;
          return (
            <NavLink
              key={tab.path}
              to={to}
              end={!tab.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-[1px]",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )
              }
            >
              {tab.icon}
              {tab.label}
            </NavLink>
          );
        })}
      </div>

      {/* Tab content */}
      {configLoading && !config ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading configuration...
        </div>
      ) : (
        <Routes>
          <Route index element={<OverviewTab agent={agent} config={config} />} />
          {agent.agent_type === "claude-code" && (
            <>
              <Route path="model" element={<ClaudeCodeModelTab agent={agent} config={config} onSave={saveFullConfig} />} />
              <Route path="interaction" element={<ClaudeCodeInteractionTab config={config} onSave={saveFullConfig} />} />
              <Route path="permissions" element={<ClaudeCodePermissionsTab config={config} onSave={saveFullConfig} />} />
              <Route path="agents" element={<ClaudeCodeAgentsTab config={config} onSave={saveFullConfig} />} />
              <Route path="mcp" element={<ClaudeCodeMcpTab agent={agent} />} />
              <Route path="hooks" element={<ClaudeCodeHooksTab config={config} onSave={saveFullConfig} />} />
              <Route path="skills" element={<ClaudeCodeSkillsTab agent={agent} />} />
              <Route path="plugins" element={<ClaudeCodePluginsTab agent={agent} />} />
            </>
          )}
          {agent.agent_type === "codex" && (
            <>
              <Route path="config" element={<CodexConfigTab agent={agent} />} />
            </>
          )}
          {agent.agent_type === "openclaw" && (
            <>
              <Route path="agents" element={<OpenClawAgentsTab config={config} onSave={saveConfigModule} />} />
              <Route path="channels" element={<OpenClawChannelsTab config={config} onSave={saveConfigModule} />} />
              <Route path="tools" element={<OpenClawToolsTab config={config} onSave={saveConfigModule} />} />
              <Route path="plugins" element={<OpenClawPluginsTab config={config} onSave={saveConfigModule} />} />
              <Route path="gateway" element={<OpenClawGatewayTab config={config} onSave={saveConfigModule} />} />
              <Route path="raw" element={<OpenClawRawTab config={config} onSave={saveFullConfig} />} />
            </>
          )}
        </Routes>
      )}
    </div>
  );
}
