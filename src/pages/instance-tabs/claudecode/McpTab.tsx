import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { EditableRow } from "@/components/shared/EditableRow";
import { toast } from "sonner";

interface Props {
  agent: { home_dir: string };
}

interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;  // "stdio" | "sse"
  url?: string;   // for sse
  [key: string]: unknown;
}

export default function ClaudeCodeMcpTab({ agent }: Props) {
  const [servers, setServers] = useState<Record<string, McpServerConfig>>({});
  const [loading, setLoading] = useState(true);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [addingName, setAddingName] = useState("");

  const claudeJsonPath = `${agent.home_dir.replace(/\/settings\.json$/, "")}/../.claude.json`.replace("/.claude/../", "/");
  // Normalize: ~/.claude.json
  const configPath = agent.home_dir.includes(".claude") ? `${agent.home_dir.split(".claude")[0]}.claude.json` : `${agent.home_dir}/../.claude.json`;

  const load = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const home = agent.home_dir.replace(/\/.claude\/.*$/, "");
      const path = `${home}/.claude.json`;
      const data = await invoke<Record<string, unknown>>("read_json_file", { path });
      setServers((data.mcpServers || {}) as Record<string, McpServerConfig>);
    } catch {
      setServers({});
    }
    setLoading(false);
  };

  const save = async (newServers: Record<string, McpServerConfig>) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const home = agent.home_dir.replace(/\/.claude\/.*$/, "");
      const path = `${home}/.claude.json`;
      // Read full file, update mcpServers, write back
      const data = await invoke<Record<string, unknown>>("read_json_file", { path });
      data.mcpServers = newServers;
      await invoke("write_json_file", { path, data: JSON.stringify(data, null, 2) });
      setServers(newServers);
      toast.success("已保存");
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    }
  };

  useEffect(() => { load(); }, [agent.home_dir]);

  const updateServer = (name: string, updates: Partial<McpServerConfig>) => {
    const updated = { ...servers, [name]: { ...servers[name], ...updates } };
    save(updated);
  };

  const removeServer = (name: string) => {
    const updated = { ...servers };
    delete updated[name];
    save(updated);
    if (expandedName === name) setExpandedName(null);
  };

  const addServer = () => {
    if (!addingName.trim() || servers[addingName.trim()]) return;
    const name = addingName.trim();
    const updated = { ...servers, [name]: { command: "", args: [] } };
    save(updated);
    setExpandedName(name);
    setAddingName("");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="animate-spin" size={18} /></div>;
  }

  const names = Object.keys(servers);

  return (
    <div className="space-y-6 max-w-xl pb-8">

      <SettingsGroup title={`MCP Servers (${names.length})`}>
        {names.length === 0 && !addingName && (
          <div className="py-6 text-center text-[13px] text-muted-foreground/50">
            没有配置 MCP Server
          </div>
        )}
        {names.map(name => {
          const cfg = servers[name];
          const isExpanded = expandedName === name;
          return (
            <div key={name}>
              <div className="flex items-center justify-between min-h-[44px] px-1 cursor-pointer" onClick={() => setExpandedName(isExpanded ? null : name)}>
                <div>
                  <div className="text-[13px] font-medium">{name}</div>
                  <div className="text-[11px] text-muted-foreground/40 font-mono">
                    {cfg.type === "sse" ? cfg.url : (cfg.command ? `${cfg.command} ${(cfg.args || []).join(" ")}` : "未配置")}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground/30">{isExpanded ? "收起" : "展开"}</span>
              </div>
              {isExpanded && (
                <div className="pb-3 px-1 space-y-2">
                  <div className="rounded-lg bg-foreground/[0.02] p-3 space-y-1">
                    <EditableRow label="命令" value={cfg.command || ""} mono
                      onSave={(v) => updateServer(name, { command: v })} placeholder="npx" />
                    <EditableRow label="参数" value={(cfg.args || []).join(" ")} mono
                      onSave={(v) => updateServer(name, { args: v.split(/\s+/).filter(Boolean) })}
                      placeholder="-y @modelcontextprotocol/server-xxx" hint="空格分隔" />
                    {cfg.env && Object.keys(cfg.env).length > 0 && (
                      <div className="pt-2">
                        <div className="text-[11px] text-muted-foreground/40 mb-1">环境变量</div>
                        {Object.entries(cfg.env).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-[12px] font-mono py-0.5">
                            <span className="text-muted-foreground/50">{k}</span>
                            <span className="text-muted-foreground/20">=</span>
                            <span className="text-foreground/60">{v ? "••••" : "(空)"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => removeServer(name)}
                    className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors">
                    删除
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new */}
        <div className="flex items-center gap-2 min-h-[44px] px-1">
          <input value={addingName} onChange={e => setAddingName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addServer()}
            placeholder="输入名称添加..."
            style={{ border: "none", outline: "none", background: "none", padding: 0, font: "inherit" }}
            className="flex-1 text-[13px] placeholder:text-muted-foreground/25" />
          {addingName.trim() && (
            <button onClick={addServer} className="text-[12px] text-foreground/60 hover:text-foreground">添加</button>
          )}
        </div>
      </SettingsGroup>

      {/* Project MCP 管理 — 读取 settings.json */}
      <McpProjectSettings agent={agent} />

      <div className="text-[11px] text-muted-foreground px-1">
        用户级: <span className="font-mono">~/.claude.json</span> → mcpServers &nbsp;|&nbsp; 项目级: <span className="font-mono">.mcp.json</span>
      </div>
    </div>
  );
}

// ── Project-level MCP settings (from settings.json) ──
function McpProjectSettings({ agent }: { agent: { home_dir: string } }) {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke<Record<string, unknown>>("read_config", { configFile: `${agent.home_dir}/settings.json` })
    ).then(setConfig).catch(() => setConfig(null));
  }, [agent.home_dir]);

  if (!config) return null;

  const save = async (key: string, value: unknown) => {
    const c = { ...config };
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) delete c[key]; else c[key] = value;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_json_file", { path: `${agent.home_dir}/settings.json`, data: JSON.stringify(c, null, 2) });
      setConfig(c);
    } catch { /* */ }
  };

  return (
    <SettingsGroup title="项目 MCP 管理" description="控制项目级 .mcp.json 中的 MCP Server 审批">
      <EditableRow label="自动批准全部" value={String(config.enableAllProjectMcpServers ?? "false")} type="toggle"
        onSave={(v) => save("enableAllProjectMcpServers", v === "true" ? true : undefined)}
        hint="自动批准项目 .mcp.json 中定义的所有 Server" />
      <EditableRow label="白名单" value={Array.isArray(config.enabledMcpjsonServers) ? (config.enabledMcpjsonServers as string[]).join(", ") : ""}
        onSave={(v) => save("enabledMcpjsonServers", v.split(",").map(s => s.trim()).filter(Boolean))}
        placeholder="memory, github" hint="逗号分隔" />
      <EditableRow label="黑名单" value={Array.isArray(config.disabledMcpjsonServers) ? (config.disabledMcpjsonServers as string[]).join(", ") : ""}
        onSave={(v) => save("disabledMcpjsonServers", v.split(",").map(s => s.trim()).filter(Boolean))}
        placeholder="filesystem" hint="逗号分隔" />
    </SettingsGroup>
  );
}
