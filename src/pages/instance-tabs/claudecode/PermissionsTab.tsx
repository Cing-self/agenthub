import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";

interface Props {
  config: Record<string, unknown> | null;
  onSave: (config: Record<string, unknown>) => Promise<void>;
}

const MODE_OPTIONS = [
  { value: "", label: "每次询问" },
  { value: "default", label: "每次询问" },
  { value: "acceptEdits", label: "自动接受编辑" },
  { value: "bypassPermissions", label: "跳过所有确认" },
];

export default function ClaudeCodePermissionsTab({ config, onSave }: Props) {
  if (!config) return null;
  const permissions = (config.permissions || {}) as Record<string, unknown>;
  const sandbox = (config.sandbox || {}) as Record<string, unknown>;
  const sandboxFs = (sandbox.filesystem || {}) as Record<string, unknown>;
  const sandboxNet = (sandbox.network || {}) as Record<string, unknown>;

  const updatePerm = (key: string, value: unknown) => {
    const p = { ...permissions };
    if (!value || (Array.isArray(value) && value.length === 0)) delete p[key]; else p[key] = value;
    const c = { ...config };
    if (Object.keys(p).length > 0) c.permissions = p; else delete c.permissions;
    onSave(c);
  };

  const updateSandbox = (updates: Record<string, unknown>) => {
    onSave({ ...config, sandbox: { ...sandbox, ...updates } });
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title="权限">
        <SelectRow label="默认模式" value={String(permissions.defaultMode || "")} options={MODE_OPTIONS}
          onSave={(v) => updatePerm("defaultMode", v || undefined)} />
        <EditableRow label="允许规则" value={Array.isArray(permissions.allow) ? (permissions.allow as string[]).join(", ") : ""}
          onSave={(v) => updatePerm("allow", v.split(",").map(s => s.trim()).filter(Boolean))}
          placeholder="Bash(npm run *)" hint="逗号分隔，格式: Tool(pattern)" />
        <EditableRow label="拒绝规则" value={Array.isArray(permissions.deny) ? (permissions.deny as string[]).join(", ") : ""}
          onSave={(v) => updatePerm("deny", v.split(",").map(s => s.trim()).filter(Boolean))}
          placeholder="Bash(curl *)" />
      </SettingsGroup>

      <SettingsGroup title="沙箱" description="隔离 Bash 命令的文件和网络">
        <EditableRow label="启用" value={String(sandbox.enabled ?? "false")} type="toggle"
          onSave={(v) => updateSandbox({ enabled: v === "true" })} />
        <EditableRow label="沙箱内自动允许 Bash" value={String(sandbox.autoAllowBashIfSandboxed ?? "true")} type="toggle"
          onSave={(v) => updateSandbox({ autoAllowBashIfSandboxed: v === "true" })} />
        <EditableRow label="允许写入" value={Array.isArray(sandboxFs.allowWrite) ? (sandboxFs.allowWrite as string[]).join(", ") : ""}
          onSave={(v) => updateSandbox({ filesystem: { ...sandboxFs, allowWrite: v.split(",").map(s => s.trim()).filter(Boolean) } })}
          placeholder="/tmp/build" />
        <EditableRow label="拒绝读取" value={Array.isArray(sandboxFs.denyRead) ? (sandboxFs.denyRead as string[]).join(", ") : ""}
          onSave={(v) => updateSandbox({ filesystem: { ...sandboxFs, denyRead: v.split(",").map(s => s.trim()).filter(Boolean) } })}
          placeholder="~/.aws/credentials" />
        <EditableRow label="允许域名" value={Array.isArray(sandboxNet.allowedDomains) ? (sandboxNet.allowedDomains as string[]).join(", ") : ""}
          onSave={(v) => updateSandbox({ network: { ...sandboxNet, allowedDomains: v.split(",").map(s => s.trim()).filter(Boolean) } })}
          placeholder="github.com" />
      </SettingsGroup>
    </div>
  );
}
