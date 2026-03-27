import { useState } from "react";
import { cn } from "@/lib/utils";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}

const AUTH_MODE = [{ value: "token", label: "Token" }, { value: "password", label: "密码" }];
const BIND_MODE = [{ value: "loopback", label: "本地" }, { value: "tailnet", label: "Tailnet" }, { value: "lan", label: "局域网" }, { value: "auto", label: "自动" }, { value: "custom", label: "自定义" }];
const TAILSCALE_MODE = [{ value: "off", label: "关闭" }, { value: "serve", label: "Serve" }, { value: "funnel", label: "Funnel" }];
const DM_SCOPE = [{ value: "per-channel-peer", label: "按频道用户" }, { value: "per-user", label: "按用户" }, { value: "per-channel", label: "按频道" }, { value: "global", label: "全局" }];
const NATIVE_CMD = [{ value: "auto", label: "自动" }, { value: "true", label: "启用" }, { value: "false", label: "禁用" }];

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

export default function GatewayTab({ config, onSave }: Props) {
  const [showToken, setShowToken] = useState(false);
  const gw = (config?.gateway || {}) as Record<string, unknown>;
  const auth = (gw.auth || {}) as Record<string, unknown>;
  const tailscale = (gw.tailscale || {}) as Record<string, unknown>;
  const session = (config?.session || {}) as Record<string, unknown>;
  const hooks = (config?.hooks || {}) as Record<string, unknown>;
  const internal = (hooks.internal || {}) as Record<string, unknown>;
  const hookEntries = (internal.entries || {}) as Record<string, Record<string, unknown>>;
  const messages = (config?.messages || {}) as Record<string, unknown>;
  const commands = (config?.commands || {}) as Record<string, unknown>;

  const saveGw = (path: string, value: unknown) => onSave?.("gateway", setNested(gw, path, value));
  const saveSes = (path: string, value: unknown) => onSave?.("session", setNested(session, path, value));
  const saveMsg = (path: string, value: unknown) => onSave?.("messages", setNested(messages, path, value));
  const saveCmd = (key: string, value: unknown) => {
    const c = JSON.parse(JSON.stringify(commands));
    c[key] = value === "true" ? true : value === "false" ? false : value;
    onSave?.("commands", c);
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title="网关">
        <EditableRow label="端口" value={String(gw.port || "18789")} mono
          onSave={onSave ? (v) => saveGw("port", parseInt(v) || 18789) : undefined} />
        <SelectRow label="绑定" value={String(gw.bind || "")} options={BIND_MODE}
          onSave={onSave ? (v) => saveGw("bind", v) : undefined} />
        <SelectRow label="认证方式" value={String(auth.mode || "")} options={AUTH_MODE}
          onSave={onSave ? (v) => saveGw("auth.mode", v) : undefined} />
        {auth.token != null && (
          <div className="flex items-center justify-between min-h-[44px] px-1">
            <span className="text-[13px]">Token</span>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono text-foreground/70">{showToken ? String(auth.token) : "••••••••"}</span>
              <button onClick={() => setShowToken(!showToken)} className="text-[11px] text-muted-foreground hover:text-foreground">
                {showToken ? "隐藏" : "显示"}
              </button>
            </div>
          </div>
        )}
      </SettingsGroup>

      <SettingsGroup title="Tailscale">
        <SelectRow label="模式" value={String(tailscale.mode || "off")} options={TAILSCALE_MODE}
          onSave={onSave ? (v) => saveGw("tailscale.mode", v) : undefined} />
        <EditableRow label="退出时重置" value={String(tailscale.resetOnExit ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveGw("tailscale.resetOnExit", v) : undefined} />
      </SettingsGroup>

      <SettingsGroup title="会话">
        <SelectRow label="DM 范围" value={String(session.dmScope || "")} options={DM_SCOPE}
          onSave={onSave ? (v) => saveSes("dmScope", v) : undefined} />
      </SettingsGroup>

      <SettingsGroup title="内部 Hooks">
        <EditableRow label="启用" value={String(internal.enabled ?? "false")} type="toggle"
          onSave={onSave ? (v) => {
            const h = JSON.parse(JSON.stringify(hooks));
            h.internal = { ...h.internal, enabled: v === "true" };
            onSave("hooks", h);
          } : undefined} />
        {Object.entries(hookEntries).map(([name, entry]) => (
          <div key={name} className="flex items-center justify-between min-h-[40px] px-1">
            <span className="text-[13px]">{name}</span>
            <button onClick={() => {
              if (!onSave) return;
              const h = JSON.parse(JSON.stringify(hooks));
              h.internal.entries[name].enabled = !entry.enabled;
              onSave("hooks", h);
            }} className={cn("text-[11px] px-2 py-0.5 rounded-full",
              entry.enabled ? "text-foreground bg-foreground/5" : "text-muted-foreground bg-foreground/[0.02]")}>
              {entry.enabled ? "开" : "关"}
            </button>
          </div>
        ))}
      </SettingsGroup>

      <SettingsGroup title="消息">
        <EditableRow label="确认回应范围" value={String(messages.ackReactionScope || "")}
          onSave={onSave ? (v) => saveMsg("ackReactionScope", v) : undefined} />
      </SettingsGroup>

      <SettingsGroup title="命令">
        <SelectRow label="原生命令" value={String(commands.native ?? "")} options={NATIVE_CMD}
          onSave={onSave ? (v) => saveCmd("native", v) : undefined} />
        <SelectRow label="原生技能" value={String(commands.nativeSkills ?? "")} options={NATIVE_CMD}
          onSave={onSave ? (v) => saveCmd("nativeSkills", v) : undefined} />
        <EditableRow label="重启" value={String(commands.restart ?? "false")} type="toggle"
          onSave={onSave ? (v) => saveCmd("restart", v) : undefined} />
      </SettingsGroup>
    </div>
  );
}
