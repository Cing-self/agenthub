import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";

interface Props {
  config: Record<string, unknown> | null;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}

const TEAMMATE_OPTIONS = [
  { value: "auto", label: "自动" },
  { value: "in-process", label: "同进程" },
  { value: "tmux", label: "Tmux 分屏" },
];

export default function ClaudeCodeAgentsTab({ config, onSave }: Props) {
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

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title="Agent Teams">
        <EditableRow label="启用 Agent Teams" value={String(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1" ? "true" : "false")} type="toggle"
          onSave={(v) => updateEnv("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", v === "true" ? "1" : "")}
          hint="多 Agent 并行协作（实验性）" />
        <SelectRow label="协作模式" value={String(config.teammateMode || "auto")} options={TEAMMATE_OPTIONS}
          onSave={(v) => update("teammateMode", v)}
          hint="Agent 之间如何协作显示" />
      </SettingsGroup>

      <SettingsGroup title="子代理">
        <EditableRow label="默认子代理" value={String(config.agent || "")}
          onSave={(v) => update("agent", v || undefined)}
          hint="用指定的子代理运行主线程，继承其 system prompt 和工具限制" />
      </SettingsGroup>
    </div>
  );
}
