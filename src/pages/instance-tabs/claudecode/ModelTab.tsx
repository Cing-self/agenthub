import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SelectRow } from "@/components/shared/SelectRow";
import { EditableRow } from "@/components/shared/EditableRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { useHubStore } from "@/stores/hub-store";
import type { ModelProvider } from "@/lib/types/hub";
import { toast } from "sonner";

interface Props {
  agent: { config_path: string; home_dir: string };
  config: Record<string, unknown> | null;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}

const MODEL_OPTIONS = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "opus[1m]", label: "Opus 1M" },
  { value: "sonnet", label: "Sonnet" },
  { value: "haiku", label: "Haiku" },
];

const EFFORT_OPTIONS = [
  { value: "", label: "默认" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const LOGIN_OPTIONS = [
  { value: "", label: "自动" },
  { value: "claudeai", label: "Claude.ai" },
  { value: "console", label: "Console" },
];

export default function ClaudeCodeModelTab({ config, onSave }: Props) {
  const { providers, models, loadHub } = useHubStore();
  const [showProviders, setShowProviders] = useState(false);

  useEffect(() => { loadHub(); }, [loadHub]);
  if (!config) return null;

  const env = (config.env || {}) as Record<string, string>;

  const update = (key: string, value: unknown) => {
    const c = { ...config };
    if (value === "" || value === undefined || value === null) delete c[key]; else c[key] = value;
    onSave(c);
  };

  const updateEnv = (key: string, value: string) => {
    const newEnv = { ...env };
    if (value) newEnv[key] = value; else delete newEnv[key];
    const c = { ...config };
    if (Object.keys(newEnv).length > 0) c.env = newEnv; else delete c.env;
    onSave(c);
  };

  const applyProvider = (provider: ModelProvider, mappings: { haiku?: string; sonnet?: string; opus?: string }) => {
    const newEnv = { ...env };
    const ep = provider.endpoints?.find(e => e.apiType === "anthropic") || provider.endpoints?.[0];
    if (ep?.baseUrl) newEnv.ANTHROPIC_BASE_URL = ep.baseUrl;
    if (provider.apiKey) newEnv.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
    if (mappings.haiku) newEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = mappings.haiku; else delete newEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    if (mappings.sonnet) newEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = mappings.sonnet; else delete newEnv.ANTHROPIC_DEFAULT_SONNET_MODEL;
    if (mappings.opus) newEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = mappings.opus; else delete newEnv.ANTHROPIC_DEFAULT_OPUS_MODEL;
    onSave({ ...config, env: newEnv });
    toast.success(`已切换到 ${provider.name}`);
    setShowProviders(false);
  };

  const currentProvider = providers.find(p => p.endpoints?.some(e => e.baseUrl === env.ANTHROPIC_BASE_URL));

  return (
    <div className="space-y-6 max-w-xl pb-8">

      {/* API 来源 + 切换 */}
      <SettingsGroup title="API 来源">
        <div className="flex items-center justify-between min-h-[44px] px-1">
          <div>
            <div className="text-[13px]">{currentProvider?.name || (env.ANTHROPIC_BASE_URL ? "自定义" : "Anthropic")}</div>
            <div className="text-[11px] text-muted-foreground/40 font-mono">{env.ANTHROPIC_BASE_URL || "api.anthropic.com"}</div>
          </div>
          <button onClick={() => setShowProviders(!showProviders)}
            className="text-[13px] text-foreground/50 hover:text-foreground transition-colors">切换</button>
        </div>
        {showProviders && (
          <div className="px-1 pb-2 space-y-1">
            <button onClick={() => {
              const newEnv = { ...env };
              ["ANTHROPIC_BASE_URL","ANTHROPIC_AUTH_TOKEN","ANTHROPIC_DEFAULT_HAIKU_MODEL","ANTHROPIC_DEFAULT_SONNET_MODEL","ANTHROPIC_DEFAULT_OPUS_MODEL"].forEach(k => delete newEnv[k]);
              const c = { ...config }; if (Object.keys(newEnv).length > 0) c.env = newEnv; else delete c.env;
              onSave(c); toast.success("已切换到 Anthropic"); setShowProviders(false);
            }} className={cn("w-full text-left rounded-lg px-3 py-2 text-[13px] transition-colors", !env.ANTHROPIC_BASE_URL ? "bg-foreground/5" : "hover:bg-foreground/[0.03]")}>
              Anthropic 官方
            </button>
            {providers.filter(p => p.apiKey).map(p => (
              <ProviderItem key={p.id} provider={p} isCurrent={currentProvider?.id === p.id}
                providerModels={models.filter(m => m.providerIds?.includes(p.id)).map(m => ({ value: m.id, label: m.name || m.id }))}
                onApply={(mappings) => applyProvider(p, mappings)} />
            ))}
          </div>
        )}
      </SettingsGroup>

      {/* 认证 */}
      <SettingsGroup title="认证">
        <SelectRow label="登录方式" value={String(config.forceLoginMethod || "")} options={LOGIN_OPTIONS}
          onSave={(v) => update("forceLoginMethod", v || undefined)} />
        <EditableRow label="Base URL" value={env.ANTHROPIC_BASE_URL || ""} mono
          onSave={(v) => updateEnv("ANTHROPIC_BASE_URL", v)} placeholder="api.anthropic.com" />
        <EditableRow label="Auth Token" value={env.ANTHROPIC_AUTH_TOKEN ? "••••••" : ""} mono
          onSave={(v) => updateEnv("ANTHROPIC_AUTH_TOKEN", v)} placeholder="设置" />
        <EditableRow label="API Key" value={env.ANTHROPIC_API_KEY ? "••••••" : ""} mono
          onSave={(v) => updateEnv("ANTHROPIC_API_KEY", v)} placeholder="设置" />
        <EditableRow label="API 超时" value={env.API_TIMEOUT_MS || ""} mono
          onSave={(v) => updateEnv("API_TIMEOUT_MS", v)} hint="毫秒，默认 600000" />
      </SettingsGroup>

      {/* 模型 */}
      <SettingsGroup title="模型选择">
        <SelectRow label="默认模型" value={String(config.model || "")} options={MODEL_OPTIONS}
          onSave={(v) => update("model", v)} placeholder="跟随账户" />
        <SelectRow label="思考深度" value={String(config.effortLevel || "")} options={EFFORT_OPTIONS}
          onSave={(v) => update("effortLevel", v || undefined)} />
        <EditableRow label="始终深度思考" value={String(config.alwaysThinkingEnabled ?? "false")} type="toggle"
          onSave={(v) => update("alwaysThinkingEnabled", v === "true")} />
      </SettingsGroup>

      {/* 模型映射 */}
      {env.ANTHROPIC_BASE_URL && (
        <SettingsGroup title="模型映射" description="Haiku/Sonnet/Opus 实际调用的模型">
          <EditableRow label="Haiku" value={env.ANTHROPIC_DEFAULT_HAIKU_MODEL || ""} mono
            onSave={(v) => updateEnv("ANTHROPIC_DEFAULT_HAIKU_MODEL", v)} placeholder="原模型" />
          <EditableRow label="Sonnet" value={env.ANTHROPIC_DEFAULT_SONNET_MODEL || ""} mono
            onSave={(v) => updateEnv("ANTHROPIC_DEFAULT_SONNET_MODEL", v)} placeholder="原模型" />
          <EditableRow label="Opus" value={env.ANTHROPIC_DEFAULT_OPUS_MODEL || ""} mono
            onSave={(v) => updateEnv("ANTHROPIC_DEFAULT_OPUS_MODEL", v)} placeholder="原模型" />
        </SettingsGroup>
      )}

      {/* 模型限制与覆盖 */}
      <SettingsGroup title="模型管理">
        <EditableRow label="可选模型" value={Array.isArray(config.availableModels) ? (config.availableModels as string[]).join(", ") : ""}
          onSave={(v) => {
            const models = v.split(",").map(s => s.trim()).filter(Boolean);
            update("availableModels", models.length > 0 ? models : undefined);
          }} placeholder="sonnet, haiku, opus" hint="限制 /model 可选范围，留空不限" />
        <EditableRow label="API Key 脚本" value={String(config.apiKeyHelper || "")} mono
          onSave={(v) => update("apiKeyHelper", v || undefined)} placeholder="/bin/generate_api_key.sh" hint="动态生成 API Key 的脚本" />
      </SettingsGroup>
    </div>
  );
}

function ProviderItem({ provider, isCurrent, providerModels, onApply }: {
  provider: ModelProvider; isCurrent: boolean;
  providerModels: { value: string; label: string }[];
  onApply: (m: { haiku?: string; sonnet?: string; opus?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [haiku, setHaiku] = useState("");
  const [sonnet, setSonnet] = useState("");
  const [opus, setOpus] = useState("");
  const opts = [{ value: "", label: "不映射" }, ...providerModels];

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)}
        className={cn("w-full text-left rounded-lg px-3 py-2 text-[13px] transition-colors",
          isCurrent ? "bg-foreground/5" : "hover:bg-foreground/[0.03]")}>
        <span>{provider.name}</span>
        {isCurrent && <span className="text-[11px] text-muted-foreground/40 ml-2">当前</span>}
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-foreground/[0.03] p-3 space-y-3">
      <div className="text-[13px] font-medium">{provider.name}</div>
      <div className="space-y-1.5">
        {(["haiku", "sonnet", "opus"] as const).map(tier => (
          <div key={tier} className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground/50 w-14 capitalize">{tier}</span>
            <span className="text-muted-foreground/30">→</span>
            <select value={tier === "haiku" ? haiku : tier === "sonnet" ? sonnet : opus}
              onChange={e => (tier === "haiku" ? setHaiku : tier === "sonnet" ? setSonnet : setOpus)(e.target.value)}
              style={{ WebkitAppearance: "none", appearance: "none", border: "none", outline: "none", background: "none", padding: 0, font: "inherit" }}
              className="flex-1 text-[12px] cursor-pointer">
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setExpanded(false)} className="text-[12px] text-muted-foreground/50 hover:text-foreground">取消</button>
        <button onClick={() => onApply({ haiku: haiku || undefined, sonnet: sonnet || undefined, opus: opus || undefined })}
          className="text-[12px] text-foreground/70 hover:text-foreground font-medium">应用</button>
      </div>
    </div>
  );
}
