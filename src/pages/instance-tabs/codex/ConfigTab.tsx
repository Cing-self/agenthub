import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";

interface Props {
  agent: { config_path: string; home_dir: string };
}

const MODEL_OPTIONS = [
  { value: "gpt-5.4", label: "GPT-5.4" },
  { value: "o3", label: "o3" },
  { value: "o4-mini", label: "o4-mini" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "codex-mini", label: "Codex Mini" },
];

const EFFORT_OPTIONS = [
  { value: "", label: "默认" },
  { value: "xlow", label: "极低" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

const SANDBOX_OPTIONS = [
  { value: "read-only", label: "只读" },
  { value: "workspace-write", label: "工作区可写" },
  { value: "danger-full-access", label: "完全访问（危险）" },
];

const APPROVAL_OPTIONS = [
  { value: "untrusted", label: "仅信任命令" },
  { value: "on-failure", label: "失败时询问" },
  { value: "on-request", label: "模型决定" },
  { value: "never", label: "从不询问" },
];

const PROVIDER_OPTIONS = [
  { value: "", label: "默认 (OpenAI)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "oss", label: "本地开源模型" },
  { value: "ollama", label: "Ollama" },
  { value: "lmstudio", label: "LM Studio" },
];

// Codex uses TOML. We read it via the Rust read_config (JSON5 parser won't work for TOML).
// Instead we'll use run_openclaw_cmd to execute shell commands to read/write.

interface CodexConfig {
  model?: string;
  model_reasoning_effort?: string;
  sandbox?: string;
  approval_policy?: string;
  provider?: string;
  search?: boolean;
  features?: Record<string, boolean>;
  projects?: Record<string, { trust_level?: string }>;
}

export default function CodexConfigTab({ agent }: Props) {
  const [config, setConfig] = useState<CodexConfig | null>(null);
  const [rawToml, setRawToml] = useState("");
  const [loading, setLoading] = useState(true);
  

  const configPath = `${agent.home_dir}/config.toml`;

  const load = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // Read raw TOML file
      const text = await invoke<string>("read_text_file", { path: configPath, maxBytes: 100000 }).catch(() => "");
      setRawToml(text);

      // Parse basic fields from TOML (simple regex parsing for top-level keys)
      const cfg: CodexConfig = {};
      const modelMatch = text.match(/^model\s*=\s*"(.+?)"/m);
      if (modelMatch) cfg.model = modelMatch[1];
      const effortMatch = text.match(/^model_reasoning_effort\s*=\s*"(.+?)"/m);
      if (effortMatch) cfg.model_reasoning_effort = effortMatch[1];

      // Parse features from TOML (CLI approach removed — read directly)
      // Parse features from the TOML
      const featSection = text.match(/\[features\]([\s\S]*?)(?=\[|$)/);
      if (featSection) {
        const feats: Record<string, boolean> = {};
        featSection[1].replace(/(\w+)\s*=\s*(true|false)/g, (_, k, v) => { feats[k] = v === "true"; return ""; });
        cfg.features = feats;
      }

      // Parse projects
      const projectMatches = [...text.matchAll(/\[projects\."(.+?)"\]\s*\ntrust_level\s*=\s*"(.+?)"/g)];
      if (projectMatches.length > 0) {
        cfg.projects = {};
        projectMatches.forEach(m => { cfg.projects![m[1]] = { trust_level: m[2] }; });
      }

      setConfig(cfg);
    } catch (err) {
      console.error(err);
      setConfig({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [configPath]);

  const saveField = async (key: string, value: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let newToml = rawToml;
      const regex = new RegExp(`^${key}\\s*=\\s*".+?"`, "m");
      if (regex.test(newToml)) {
        newToml = newToml.replace(regex, `${key} = "${value}"`);
      } else {
        // Add at the top (before any section)
        const firstSection = newToml.indexOf("[");
        if (firstSection > 0) {
          newToml = newToml.slice(0, firstSection) + `${key} = "${value}"\n` + newToml.slice(firstSection);
        } else {
          newToml = `${key} = "${value}"\n` + newToml;
        }
      }
      await invoke("write_json_file", { path: configPath, data: newToml });
      setRawToml(newToml);
      toast.success("已保存");
      // Update local state
      setConfig(prev => prev ? { ...prev, [key]: value } : { [key]: value });
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    }
  };

  const removeProject = async (path: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      let newToml = rawToml;
      // Remove the [projects."path"] section
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\[projects\\."${escaped}"\\]\\s*\\n[^\\[]*`, "g");
      newToml = newToml.replace(regex, "");
      await invoke("write_json_file", { path: configPath, data: newToml });
      setRawToml(newToml);
      toast.success("已删除");
      await load();
    } catch (err) {
      toast.error(`删除失败: ${err}`);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" size={18} /></div>;
  }

  return (
    <div className="space-y-6 max-w-xl pb-8">

      <SettingsGroup title="模型">
        <SelectRow label="默认模型" value={config?.model || ""} options={MODEL_OPTIONS}
          onSave={(v) => saveField("model", v)} placeholder="选择..." />
        <SelectRow label="推理深度" value={config?.model_reasoning_effort || ""} options={EFFORT_OPTIONS}
          onSave={(v) => saveField("model_reasoning_effort", v)} />
        <SelectRow label="Provider" value={config?.provider || ""} options={PROVIDER_OPTIONS}
          onSave={(v) => saveField("provider", v)} />
      </SettingsGroup>

      <SettingsGroup title="执行策略">
        <SelectRow label="沙箱模式" value={config?.sandbox || "workspace-write"} options={SANDBOX_OPTIONS}
          onSave={(v) => saveField("sandbox", v)} hint="命令执行的隔离级别" />
        <SelectRow label="审批策略" value={config?.approval_policy || "on-request"} options={APPROVAL_OPTIONS}
          onSave={(v) => saveField("approval_policy", v)} hint="何时需要人工确认" />
        <EditableRow label="搜索" value={String(config?.search ?? "false")} type="toggle"
          onSave={async (v) => {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              let newToml = rawToml;
              const regex = /^search\s*=\s*(true|false)/m;
              if (regex.test(newToml)) newToml = newToml.replace(regex, `search = ${v}`);
              else {
                const idx = newToml.indexOf("[");
                newToml = idx > 0 ? newToml.slice(0, idx) + `search = ${v}\n` + newToml.slice(idx) : `search = ${v}\n` + newToml;
              }
              await invoke("write_json_file", { path: configPath, data: newToml });
              setRawToml(newToml);
              setConfig(prev => prev ? { ...prev, search: v === "true" } : null);
            } catch { /* */ }
          }} hint="启用 Web 搜索工具" />
      </SettingsGroup>

      {config?.features && Object.keys(config.features).length > 0 && (
        <SettingsGroup title="功能开关">
          {Object.entries(config.features).map(([name, enabled]) => (
            <EditableRow key={name} label={name} value={String(enabled)} type="toggle"
              onSave={async (v) => {
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  let newToml = rawToml;
                  const regex = new RegExp(`(\\[features\\][\\s\\S]*?)${name}\\s*=\\s*(true|false)`);
                  if (regex.test(newToml)) {
                    newToml = newToml.replace(regex, `$1${name} = ${v}`);
                  }
                  await invoke("write_json_file", { path: configPath, data: newToml });
                  setRawToml(newToml);
                  setConfig(prev => prev ? { ...prev, features: { ...prev.features, [name]: v === "true" } } : null);
                  toast.success("已保存");
                } catch (err) { toast.error(`保存失败: ${err}`); }
              }} />
          ))}
        </SettingsGroup>
      )}

      {config?.projects && Object.keys(config.projects).length > 0 && (
        <SettingsGroup title={`受信项目 (${Object.keys(config.projects).length})`}>
          {Object.entries(config.projects).map(([path, proj]) => (
            <div key={path} className="flex items-center justify-between min-h-[40px] px-1 group">
              <div>
                <div className="text-[12px] font-mono truncate max-w-[350px]" title={path}>{path}</div>
                <div className="text-[11px] text-muted-foreground">{proj.trust_level}</div>
              </div>
              <button onClick={() => removeProject(path)}
                className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">删除</button>
            </div>
          ))}
        </SettingsGroup>
      )}

      <div className="text-[11px] text-muted-foreground px-1">
        配置文件: <span className="font-mono">{configPath}</span>
      </div>
    </div>
  );
}
