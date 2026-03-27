import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}

const PROFILE = [{ value: "full", label: "完整" }, { value: "minimal", label: "精简" }, { value: "coding", label: "编码" }, { value: "chat", label: "聊天" }];
const SEARCH_PROVIDER = [{ value: "brave", label: "Brave" }, { value: "tavily", label: "Tavily" }, { value: "serper", label: "Serper" }, { value: "google", label: "Google" }, { value: "bing", label: "Bing" }];
const ACP_BACKEND = [{ value: "gateway", label: "网关" }, { value: "direct", label: "直连" }, { value: "none", label: "无" }];

function setNested(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(obj));
  const parts = path.split(".");
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === "true") cur[last] = true; else if (value === "false") cur[last] = false; else cur[last] = value;
  return copy;
}

export default function ToolsTab({ config, onSave }: Props) {
  const tools = (config?.tools || {}) as Record<string, unknown>;
  const web = (tools.web || {}) as Record<string, unknown>;
  const webSearch = (web.search || {}) as Record<string, unknown>;
  const webFetch = (web.fetch || {}) as Record<string, unknown>;
  const a2a = (tools.agentToAgent || {}) as Record<string, unknown>;
  const sessions = (tools.sessions || {}) as Record<string, unknown>;
  const acp = (config?.acp || {}) as Record<string, unknown>;

  const saveTools = (path: string, value: unknown) => onSave?.("tools", setNested(tools, path, value));
  const saveAcp = (path: string, value: unknown) => onSave?.("acp", setNested(acp, path, value));

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title="通用">
        <SelectRow label="工具集" value={String(tools.profile || "")} options={PROFILE}
          onSave={onSave ? (v) => saveTools("profile", v) : undefined} placeholder="选择..." />
        <EditableRow label="会话可见性" value={String(sessions.visibility || "")}
          onSave={onSave ? (v) => saveTools("sessions.visibility", v) : undefined} />
      </SettingsGroup>

      <SettingsGroup title="搜索">
        <EditableRow label="启用" value={String(webSearch.enabled ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveTools("web.search.enabled", v) : undefined} />
        <SelectRow label="搜索引擎" value={String(webSearch.provider || "")} options={SEARCH_PROVIDER}
          onSave={onSave ? (v) => saveTools("web.search.provider", v) : undefined} placeholder="选择..." />
        <EditableRow label="API Key" value={webSearch.apiKey ? "••••••" : ""} mono
          onSave={onSave ? (v) => saveTools("web.search.apiKey", v) : undefined} placeholder="设置" />
      </SettingsGroup>

      <SettingsGroup title="网页抓取">
        <EditableRow label="启用" value={String(webFetch.enabled ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveTools("web.fetch.enabled", v) : undefined} />
      </SettingsGroup>

      <SettingsGroup title="Agent 间通信">
        <EditableRow label="启用" value={String(a2a.enabled ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveTools("agentToAgent.enabled", v) : undefined} />
        {a2a.allow != null && (
          <EditableRow label="允许列表" value={(a2a.allow as string[]).join(", ")}
            onSave={onSave ? (v) => {
              const t = JSON.parse(JSON.stringify(tools));
              if (!t.agentToAgent) t.agentToAgent = {};
              (t.agentToAgent as Record<string, unknown>).allow = v.split(",").map((s: string) => s.trim()).filter(Boolean);
              onSave("tools", t);
            } : undefined} placeholder="agent-id, ..." />
        )}
      </SettingsGroup>

      <SettingsGroup title="ACP 协议">
        <EditableRow label="启用" value={String(acp.enabled ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveAcp("enabled", v) : undefined} />
        <SelectRow label="后端" value={String(acp.backend || "")} options={ACP_BACKEND}
          onSave={onSave ? (v) => saveAcp("backend", v) : undefined} />
        <EditableRow label="默认 Agent" value={String(acp.defaultAgent || "")}
          onSave={onSave ? (v) => saveAcp("defaultAgent", v) : undefined} />
        <EditableRow label="最大并发" value={String(acp.maxConcurrentSessions || "")}
          onSave={onSave ? (v) => saveAcp("maxConcurrentSessions", v ? parseInt(v) : undefined) : undefined} />
      </SettingsGroup>
    </div>
  );
}
