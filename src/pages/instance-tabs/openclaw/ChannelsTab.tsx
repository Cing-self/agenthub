import { useState } from "react";
import { cn } from "@/lib/utils";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}

const CHANNEL_TYPES = [
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "slack", label: "Slack" },
  { value: "feishu", label: "飞书" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "weixin", label: "微信" },
];

const GROUP_POLICY_OPTIONS = [
  { value: "allowlist", label: "白名单" },
  { value: "denylist", label: "黑名单" },
  { value: "all", label: "全部允许" },
  { value: "none", label: "全部禁止" },
];

const STREAMING_OPTIONS = [
  { value: "off", label: "关闭" },
  { value: "partial", label: "部分" },
  { value: "full", label: "完整" },
];

export default function ChannelsTab({ config, onSave }: Props) {
  const channels = (config?.channels || {}) as Record<string, unknown>;
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelType, setNewChannelType] = useState("");

  const channelNames = Object.keys(channels);

  const saveChannels = (updated: Record<string, unknown>) => {
    onSave?.("channels", updated);
  };

  const updateChannel = (name: string, key: string, value: unknown) => {
    const ch = JSON.parse(JSON.stringify(channels));
    if (!ch[name]) ch[name] = {};
    if (value === "" || value === undefined) delete (ch[name] as Record<string, unknown>)[key];
    else (ch[name] as Record<string, unknown>)[key] = value;
    saveChannels(ch);
  };

  const removeChannel = (name: string) => {
    const ch = JSON.parse(JSON.stringify(channels));
    delete ch[name];
    saveChannels(ch);
    toast.success(`已删除 ${name}`);
  };

  const addChannel = () => {
    if (!newChannelType) return;
    const ch = JSON.parse(JSON.stringify(channels));
    if (!ch[newChannelType]) ch[newChannelType] = { enabled: true };
    saveChannels(ch);
    setExpandedChannel(newChannelType);
    setAddingChannel(false);
    setNewChannelType("");
    toast.success(`已添加 ${newChannelType}`);
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title={`频道 (${channelNames.length})`}>
        {channelNames.length === 0 && !addingChannel && (
          <div className="py-6 text-center text-[13px] text-muted-foreground">没有配置频道</div>
        )}
        {channelNames.map(name => {
          const ch = (channels[name] || {}) as Record<string, unknown>;
          const isOpen = expandedChannel === name;
          const accounts = (ch.accounts || {}) as Record<string, unknown>;
          const accountNames = Object.keys(accounts);

          return (
            <div key={name} className="py-1">
              <div className="flex items-center justify-between min-h-[44px] px-1 cursor-pointer"
                onClick={() => setExpandedChannel(isOpen ? null : name)}>
                <div>
                  <span className="text-[13px] font-medium capitalize">{name}</span>
                  <span className={cn("text-[11px] ml-2", ch.enabled ? "text-muted-foreground" : "text-muted-foreground/50")}>
                    {ch.enabled ? (accountNames.length > 0 ? `${accountNames.length} 账号` : "已启用") : "已禁用"}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">{isOpen ? "收起" : "展开"}</span>
              </div>

              {isOpen && (
                <div className="pb-2 px-1 space-y-1">
                  <EditableRow label="启用" value={String(ch.enabled ?? "false")} type="toggle"
                    onSave={onSave ? (v) => updateChannel(name, "enabled", v === "true") : undefined} />
                  <SelectRow label="群组策略" value={String(ch.groupPolicy || "")} options={GROUP_POLICY_OPTIONS}
                    onSave={onSave ? (v) => updateChannel(name, "groupPolicy", v) : undefined} />
                  <SelectRow label="流式输出" value={String(ch.streaming || "")} options={STREAMING_OPTIONS}
                    onSave={onSave ? (v) => updateChannel(name, "streaming", v) : undefined} />

                  {accountNames.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] text-muted-foreground mb-1 px-1">账号</div>
                      {accountNames.map(accName => {
                        const acc = (accounts[accName] || {}) as Record<string, unknown>;
                        return (
                          <div key={accName} className="glass-subtle rounded-xl p-3 mb-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium">{accName}</span>
                              {onSave && (
                                <button onClick={() => {
                                  const ch2 = JSON.parse(JSON.stringify(channels));
                                  delete (ch2[name] as Record<string, unknown>).accounts;
                                  const accs = JSON.parse(JSON.stringify(accounts));
                                  delete accs[accName];
                                  if (Object.keys(accs).length > 0) (ch2[name] as Record<string, unknown>).accounts = accs;
                                  saveChannels(ch2);
                                  toast.success(`已删除账号 ${accName}`);
                                }} className="text-[11px] text-muted-foreground hover:text-foreground">删除</button>
                              )}
                            </div>
                            <EditableRow label="Token" value={acc.token ? "••••••" : ""} mono
                              onSave={onSave ? (v) => {
                                const ch2 = JSON.parse(JSON.stringify(channels));
                                (ch2[name] as Record<string, unknown>).accounts = { ...accounts, [accName]: { ...acc, token: v } };
                                saveChannels(ch2);
                              } : undefined} placeholder="设置" />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {onSave && (
                    <button onClick={() => removeChannel(name)}
                      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors mt-2">删除频道</button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {onSave && (
          addingChannel ? (
            <div className="flex items-center gap-2 min-h-[44px] px-1">
              <select value={newChannelType} onChange={e => setNewChannelType(e.target.value)}
                style={{ WebkitAppearance: "none", appearance: "none", border: "none", outline: "none", background: "none", padding: 0, font: "inherit" }}
                className="flex-1 text-[13px] cursor-pointer">
                <option value="">选择频道类型...</option>
                {CHANNEL_TYPES.filter(t => !channelNames.includes(t.value)).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button onClick={addChannel} className="text-[12px] text-foreground/70 hover:text-foreground">添加</button>
              <button onClick={() => setAddingChannel(false)} className="text-[12px] text-muted-foreground">取消</button>
            </div>
          ) : (
            <div className="min-h-[44px] px-1 flex items-center">
              <button onClick={() => setAddingChannel(true)}
                className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">+ 添加频道</button>
            </div>
          )
        )}
      </SettingsGroup>
    </div>
  );
}
