import { useState } from "react";
import { cn } from "@/lib/utils";
import { EditableRow } from "@/components/shared/EditableRow";
import { SelectRow } from "@/components/shared/SelectRow";
import { SettingsGroup } from "@/components/shared/SettingsGroup";
import { toast } from "sonner";
import type { SharedChannelAccount, SharedChannelConfig } from "@/lib/types/custom-agents";

interface Props {
  config: Record<string, unknown> | null;
  onSave?: (module: string, data: unknown) => Promise<void>;
}

const CHANNEL_TYPES = [
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "slack", label: "Slack" },
  { value: "feishu", label: "飞书" },
  { value: "qq", label: "QQ" },
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

const TRANSPORT_OPTIONS = [
  { value: "bot", label: "Bot" },
  { value: "webhook", label: "Webhook" },
  { value: "gateway", label: "Gateway" },
  { value: "custom", label: "Custom" },
];

export default function ChannelsTab({ config, onSave }: Props) {
  const channels = (config?.channels || {}) as Record<string, SharedChannelConfig>;
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelType, setNewChannelType] = useState("");
  const [addingAccountFor, setAddingAccountFor] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState("");

  const channelNames = Object.keys(channels);

  const saveChannels = (updated: Record<string, SharedChannelConfig>) => {
    onSave?.("channels", updated);
  };

  const cloneChannels = () => structuredClone(channels) as Record<string, SharedChannelConfig>;

  const updateChannel = (name: string, key: keyof SharedChannelConfig, value: unknown) => {
    const next = cloneChannels();
    if (!next[name]) next[name] = {};
    if (value === "" || value === undefined) delete next[name][key];
    else (next[name] as Record<string, unknown>)[key] = value;
    saveChannels(next);
  };

  const updateAccount = (
    channelName: string,
    accountName: string,
    key: keyof SharedChannelAccount,
    value: unknown,
  ) => {
    const next = cloneChannels();
    if (!next[channelName]) next[channelName] = {};
    if (!next[channelName].accounts) next[channelName].accounts = {};
    if (!next[channelName].accounts?.[accountName]) {
      next[channelName].accounts![accountName] = {};
    }
    const account = next[channelName].accounts![accountName];
    if (value === "" || value === undefined) delete account[key];
    else (account as Record<string, unknown>)[key] = value;
    saveChannels(next);
  };

  const removeChannel = (name: string) => {
    const next = cloneChannels();
    delete next[name];
    saveChannels(next);
    toast.success(`已删除 ${name}`);
  };

  const addChannel = () => {
    if (!newChannelType) return;
    const next = cloneChannels();
    if (!next[newChannelType]) next[newChannelType] = { enabled: true, transport: "bot" };
    saveChannels(next);
    setExpandedChannel(newChannelType);
    setAddingChannel(false);
    setNewChannelType("");
    toast.success(`已添加 ${newChannelType}`);
  };

  const addAccount = (channelName: string) => {
    const accountName = newAccountName.trim();
    if (!accountName) return;
    const next = cloneChannels();
    if (!next[channelName]) next[channelName] = {};
    if (!next[channelName].accounts) next[channelName].accounts = {};
    if (!next[channelName].accounts?.[accountName]) {
      next[channelName].accounts![accountName] = {
        enabled: true,
      };
      saveChannels(next);
      toast.success(`已添加账号 ${accountName}`);
    }
    setAddingAccountFor(null);
    setNewAccountName("");
  };

  return (
    <div className="space-y-6 max-w-xl pb-8">
      <SettingsGroup title={`Channels (${channelNames.length})`} description="飞书、QQ、Discord 这类接入统一走共享频道模型。当前先把账号、Webhook、Bot 入口收成一套。">
        {channelNames.length === 0 && !addingChannel && (
          <div className="py-6 text-center text-[13px] text-muted-foreground">没有配置频道</div>
        )}
        {channelNames.map(name => {
          const ch = channels[name] || {};
          const isOpen = expandedChannel === name;
          const accounts = ch.accounts || {};
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
                  <SelectRow label="传输方式" value={String(ch.transport || "")} options={TRANSPORT_OPTIONS}
                    onSave={onSave ? (v) => updateChannel(name, "transport", v) : undefined}
                    placeholder="选择 transport" />
                  <SelectRow label="群组策略" value={String(ch.groupPolicy || "")} options={GROUP_POLICY_OPTIONS}
                    onSave={onSave ? (v) => updateChannel(name, "groupPolicy", v) : undefined} />
                  <SelectRow label="流式输出" value={String(ch.streaming || "")} options={STREAMING_OPTIONS}
                    onSave={onSave ? (v) => updateChannel(name, "streaming", v) : undefined} />

                  {accountNames.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[11px] text-muted-foreground mb-1 px-1">账号</div>
                      {accountNames.map(accName => {
                        const acc = accounts[accName] || {};
                        return (
                          <div key={accName} className="glass-subtle rounded-xl p-3 mb-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium">{accName}</span>
                              {onSave && (
                                <button onClick={() => {
                                  const next = cloneChannels();
                                  delete next[name].accounts?.[accName];
                                  if (next[name].accounts && Object.keys(next[name].accounts!).length === 0) {
                                    delete next[name].accounts;
                                  }
                                  saveChannels(next);
                                  toast.success(`已删除账号 ${accName}`);
                                }} className="text-[11px] text-muted-foreground hover:text-foreground">删除</button>
                              )}
                            </div>
                            <EditableRow label="启用" value={String(acc.enabled ?? "false")} type="toggle"
                              onSave={onSave ? (v) => updateAccount(name, accName, "enabled", v === "true") : undefined} />
                            <EditableRow label="Identifier" value={acc.identifier || ""}
                              onSave={onSave ? (v) => updateAccount(name, accName, "identifier", v) : undefined}
                              placeholder="群组 ID / 用户 ID / Channel ID" />
                            <EditableRow label="App ID" value={acc.appId || ""}
                              onSave={onSave ? (v) => updateAccount(name, accName, "appId", v) : undefined}
                              placeholder="飞书 / Discord App ID" />
                            <EditableRow label="Bot ID" value={acc.botId || ""}
                              onSave={onSave ? (v) => updateAccount(name, accName, "botId", v) : undefined}
                              placeholder="Bot 标识" />
                            <EditableRow label="Webhook" value={acc.webhookUrl || ""} mono
                              onSave={onSave ? (v) => updateAccount(name, accName, "webhookUrl", v) : undefined}
                              placeholder="https://..." />
                            <EditableRow label="Token" value={acc.token || ""} mono
                              onSave={onSave ? (v) => updateAccount(name, accName, "token", v) : undefined}
                              placeholder="设置 token" />
                            <EditableRow label="Secret" value={acc.secret || ""} mono
                              onSave={onSave ? (v) => updateAccount(name, accName, "secret", v) : undefined}
                              placeholder="设置 secret" />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {onSave && (
                    addingAccountFor === name ? (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                        <input
                          value={newAccountName}
                          onChange={(event) => setNewAccountName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              addAccount(name);
                            }
                          }}
                          placeholder="账号名称，例如 main / ops / feishu-bot"
                          className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/45"
                        />
                        <button
                          onClick={() => addAccount(name)}
                          className="text-[12px] text-foreground/70 hover:text-foreground"
                        >
                          添加
                        </button>
                        <button
                          onClick={() => {
                            setAddingAccountFor(null);
                            setNewAccountName("");
                          }}
                          className="text-[12px] text-muted-foreground"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingAccountFor(name);
                          setNewAccountName("");
                        }}
                        className="mt-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        + 添加账号
                      </button>
                    )
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
