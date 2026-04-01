import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { SelectRow } from "@/components/shared/SelectRow";
import { EditableRow } from "@/components/shared/EditableRow";
import { useHubStore } from "@/stores/hub-store";
import type { DetectedAgent } from "@/lib/types/agents";
import type { CustomAgentConfig } from "@/lib/types/custom-agents";

const RUNTIME_OPTIONS = [
  { value: "claude-code", label: "Claude SDK Runtime" },
  { value: "codex", label: "Codex CLI Runtime" },
  { value: "opencode", label: "OpenCode Runtime" },
  { value: "openclaw", label: "OpenClaw Gateway Runtime" },
];

const AUTH_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "claude-code": [
    { value: "claude-subscription", label: "Claude Subscription" },
    { value: "anthropic-api-key", label: "Anthropic API Key" },
    { value: "custom-provider", label: "Custom Provider" },
  ],
  codex: [
    { value: "openai-api-key", label: "OpenAI API Key" },
    { value: "custom-provider", label: "Custom Provider" },
  ],
  opencode: [
    { value: "provider-env", label: "Provider Env" },
    { value: "custom-provider", label: "Custom Provider" },
  ],
  openclaw: [
    { value: "gateway-config", label: "Gateway Config" },
    { value: "custom-provider", label: "Custom Provider" },
  ],
};

interface Props {
  agent: DetectedAgent;
  config: CustomAgentConfig | null;
  onSave: (config: CustomAgentConfig) => Promise<void>;
  onSync: (options: {
    includeModels: boolean;
    includeMcpServers: boolean;
    includeSkills: boolean;
  }) => Promise<CustomAgentConfig>;
}

export default function CustomAgentRuntimeTab({ agent, config, onSave, onSync }: Props) {
  const { models, mcpServers, loadHub } = useHubStore();
  const [syncing, setSyncing] = useState<null | "all" | "models" | "mcp" | "skills">(null);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  const enabledModels = useMemo(() => models.filter((model) => model.enabled), [models]);
  const enabledMcpServers = useMemo(() => mcpServers.filter((server) => server.enabled), [mcpServers]);
  const authOptions = AUTH_OPTIONS[config?.runtime_profile.runtime_family || "claude-code"] || AUTH_OPTIONS["claude-code"];
  const authHint =
    config?.runtime_profile.runtime_family === "claude-code"
      ? "Claude 订阅模式会复用本机 Claude 登录态；API Key / Custom Provider 则跟随你在 Models 里配置的 provider。"
      : config?.runtime_profile.runtime_family === "codex"
      ? "Codex 这条线优先跟随 OpenAI/Custom Provider 的配置。"
      : config?.runtime_profile.runtime_family === "opencode"
      ? "OpenCode 通常从本机 provider 环境读取认证。"
      : "OpenClaw 这条线优先复用本机 gateway / provider 配置。";
  const canLaunchClaudeLogin =
    config?.runtime_profile.runtime_family === "claude-code" &&
    config?.runtime_profile.auth_source === "claude-subscription";

  if (!config) {
    return null;
  }

  const updateRuntimeProfile = async (
    key: keyof CustomAgentConfig["runtime_profile"],
    value: string | null,
  ) => {
    const nextConfig: CustomAgentConfig = {
      ...config,
      runtime_profile: {
        ...config.runtime_profile,
        [key]: value,
      },
    };
    await onSave(nextConfig);
  };

  const updateField = async <K extends keyof CustomAgentConfig>(key: K, value: CustomAgentConfig[K]) => {
    const nextConfig: CustomAgentConfig = {
      ...config,
      [key]: value,
    };
    await onSave(nextConfig);
  };

  const handleSync = async (
    type: "all" | "models" | "mcp" | "skills",
    options: { includeModels: boolean; includeMcpServers: boolean; includeSkills: boolean },
  ) => {
    setSyncing(type);
    try {
      const updated = await onSync(options);
      const modelCount = updated.model_ids?.length ?? 0;
      const mcpCount = updated.mcp_server_ids?.length ?? 0;
      const skillCount = updated.skill_directories?.length ?? 0;
      toast.success(`已同步 ${modelCount} 个模型、${mcpCount} 个 MCP、${skillCount} 个 Skills 目录`);
    } catch (error) {
      toast.error(`同步失败: ${error}`);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <section className="rounded-[24px] border border-border/60 bg-card/70 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            {config.name}
          </div>
          <div className="inline-flex items-center rounded-full bg-secondary/70 px-3 py-1 text-[11px] text-muted-foreground">
            {config.runtime_profile.runtime_family}
          </div>
          <div className="inline-flex items-center rounded-full bg-secondary/70 px-3 py-1 text-[11px] text-muted-foreground">
            {config.runtime_profile.auth_source || "runtime default"}
          </div>
          <div className="inline-flex items-center rounded-full bg-secondary/70 px-3 py-1 text-[11px] text-muted-foreground">
            {config.runtime_profile.default_model || "follow runtime"}
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          这里定义的是 <span className="text-foreground/80">dolphin</span> 的执行内核、认证来源和默认模型。
          Agent 本身仍然是独立身份，runtime 只是底层执行器。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canLaunchClaudeLogin ? (
            <button
              onClick={async () => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("open_terminal_command", { command: "claude login" });
                  toast.success("已在终端打开 Claude 登录");
                } catch (error) {
                  toast.error(`无法打开 Claude 登录: ${error}`);
                }
              }}
              className="inline-flex items-center rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              打开 Claude 登录
            </button>
          ) : null}
          {config.runtime_profile.auth_source?.includes("api-key") || config.runtime_profile.auth_source === "custom-provider" ? (
            <Link
              to="/models"
              className="inline-flex items-center rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              去 Models 配置凭证
            </Link>
          ) : null}
        </div>
      </section>

      <SettingsGroup title="Runtime & Auth" description="dolphin 的执行内核、认证方式和默认模型在这里统一管理。">
        <SelectRow
          label="Runtime"
          value={config.runtime_profile.runtime_family}
          options={RUNTIME_OPTIONS}
          onSave={(value) => updateRuntimeProfile("runtime_family", value)}
        />
        <SelectRow
          label="Auth Source"
          value={config.runtime_profile.auth_source || ""}
          options={authOptions}
          onSave={(value) => updateRuntimeProfile("auth_source", value || null)}
          placeholder="选择认证方式"
          hint={authHint}
        />
        <SelectRow
          label="Default Model"
          value={config.runtime_profile.default_model || ""}
          options={enabledModels.map((model) => ({
            value: model.id,
            label: model.name || model.id,
          }))}
          onSave={(value) => updateRuntimeProfile("default_model", value || null)}
          placeholder="跟随 runtime 默认"
        />
        <EditableRow
          label="Agent Name"
          value={config.name}
          onSave={(value) => {
            void updateField("name", value.trim() || config.name);
          }}
          placeholder="dolphin"
        />
      </SettingsGroup>

      <SettingsGroup title="继承全局配置" description="从 Models、MCP Servers 和 Skills 目录里一键把当前全局启用配置拉到 dolphin。">
        <div className="flex flex-wrap gap-2 px-1 pb-1">
          <Link
            to="/models"
            className="inline-flex items-center rounded-full border border-border/70 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            查看 Models
          </Link>
          <Link
            to="/mcp"
            className="inline-flex items-center rounded-full border border-border/70 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            查看 MCP Servers
          </Link>
          <Link
            to="/skills"
            className="inline-flex items-center rounded-full border border-border/70 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            查看 Skills
          </Link>
        </div>
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <div className="flex-1 pr-4">
            <div className="text-[13px]">Models</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              当前已挂 {config.model_ids?.length ?? 0} 个，Hub 里启用 {enabledModels.length} 个
            </div>
          </div>
          <button
            onClick={() => {
              void handleSync("models", {
                includeModels: true,
                includeMcpServers: false,
                includeSkills: false,
              });
            }}
            disabled={syncing !== null}
            className="text-[12px] text-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
          >
            {syncing === "models" ? "同步中..." : "同步"}
          </button>
        </div>
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <div className="flex-1 pr-4">
            <div className="text-[13px]">MCP Servers</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              当前已挂 {config.mcp_server_ids?.length ?? 0} 个，Hub 里启用 {enabledMcpServers.length} 个
            </div>
          </div>
          <button
            onClick={() => {
              void handleSync("mcp", {
                includeModels: false,
                includeMcpServers: true,
                includeSkills: false,
              });
            }}
            disabled={syncing !== null}
            className="text-[12px] text-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
          >
            {syncing === "mcp" ? "同步中..." : "同步"}
          </button>
        </div>
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <div className="flex-1 pr-4">
            <div className="text-[13px]">Skills</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              当前已挂 {config.skill_directories?.length ?? 0} 个目录，将优先读取 Hub 配置并补齐本机已安装目录
            </div>
          </div>
          <button
            onClick={() => {
              void handleSync("skills", {
                includeModels: false,
                includeMcpServers: false,
                includeSkills: true,
              });
            }}
            disabled={syncing !== null}
            className="text-[12px] text-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
          >
            {syncing === "skills" ? "同步中..." : "同步"}
          </button>
        </div>
        <div className="flex items-center justify-between min-h-[52px] px-1">
          <div className="flex-1 pr-4">
            <div className="text-[13px] font-medium">一键同步全部</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              把当前 Hub 里启用的 Models / MCP / Skills 一次性拉到 dolphin。
            </div>
          </div>
          <button
            onClick={() => {
              void handleSync("all", {
                includeModels: true,
                includeMcpServers: true,
                includeSkills: true,
              });
            }}
            disabled={syncing !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[12px] text-foreground/75 transition-colors hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw size={12} className={syncing === "all" ? "animate-spin" : ""} />
            {syncing === "all" ? "同步中..." : "立即同步"}
          </button>
        </div>
      </SettingsGroup>

      <SettingsGroup title="当前挂载清单">
        <div className="min-h-[44px] px-1 py-3 text-[12px] text-muted-foreground">
          <div className="font-medium text-foreground/80">{agent.name}</div>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">Models</div>
              <div className="mt-1">{config.model_ids?.length ? config.model_ids.join(" / ") : "未绑定"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">MCP</div>
              <div className="mt-1">{config.mcp_server_ids?.length ? config.mcp_server_ids.join(" / ") : "未绑定"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">Skills</div>
              <div className="mt-1 break-all">
                {config.skill_directories?.length ? config.skill_directories.join("\n") : "未绑定"}
              </div>
            </div>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
