import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import type {
  ChannelsConfig,
  ChannelDmPolicy,
  ChannelGroupPolicy,
  ChannelTransport,
  ChannelThreadMode,
  FeishuAccountConfig,
  FeishuChannelConfig,
  FeishuConnectionResult,
} from "@/lib/types/channels";

const shellInputClass =
  "w-full rounded-2xl border border-black/8 bg-[#fcfcfa] px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-black/15 focus:ring-4 focus:ring-white/90";

const sectionLabelClass = "text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/75";
const panelClass =
  "rounded-[24px] border border-black/6 bg-white shadow-[0_20px_60px_-52px_rgba(24,24,27,0.18)]";

const CHANNEL_CATALOG = [
  {
    id: "feishu",
    label: "飞书",
    subtitle: "Bot / 应用",
    status: "ready" as const,
  },
  {
    id: "discord",
    label: "Discord",
    subtitle: "Bot Gateway",
    status: "coming" as const,
  },
  {
    id: "qq",
    label: "QQ",
    subtitle: "Bot / 频道",
    status: "coming" as const,
  },
];

const dmPolicyOptions = [
  { value: "allow", label: "允许私聊" },
  { value: "deny", label: "禁用私聊" },
];

const groupPolicyOptions: Array<{ value: ChannelGroupPolicy; label: string }> = [
  { value: "mentions-only", label: "仅被提及时接入" },
  { value: "allowlist", label: "群组白名单" },
  { value: "denylist", label: "群组黑名单" },
  { value: "all", label: "全部允许" },
  { value: "none", label: "全部禁止" },
];

const transportOptions = [
  { value: "websocket", label: "WebSocket 长连" },
  { value: "webhook", label: "Webhook 回调" },
];

const threadModeOptions: Array<{ value: ChannelThreadMode; label: string }> = [
  { value: "thread-per-chat", label: "每个会话单独建 thread" },
  { value: "shared-thread", label: "全部进入同一 thread" },
];

function createDefaultConfig(): ChannelsConfig {
  return {
    feishu: {
      enabled: false,
      transport: "websocket",
      defaultAccountId: null,
      policy: {
        dmPolicy: "allow",
        groupPolicy: "mentions-only",
        requireMention: true,
        allowedChatIds: [],
        allowedUserIds: [],
      },
      route: {
        defaultAgentId: "dolphin",
        defaultThreadId: null,
        threadMode: "thread-per-chat",
      },
      accounts: {},
    },
  };
}

function normalizeConfig(config: ChannelsConfig | null | undefined): ChannelsConfig {
  return {
    ...createDefaultConfig(),
    ...config,
    feishu: {
      ...createDefaultConfig().feishu,
      ...(config?.feishu || {}),
      policy: {
        ...createDefaultConfig().feishu?.policy,
        ...(config?.feishu?.policy || {}),
      },
      route: {
        ...createDefaultConfig().feishu?.route,
        ...(config?.feishu?.route || {}),
      },
      accounts: {
        ...(config?.feishu?.accounts || {}),
      },
    },
  };
}

function formatTime(value?: string | null) {
  if (!value) return "未测试";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function accountStatusTone(account: FeishuAccountConfig | undefined) {
  if (account?.lastStatus === "connected") {
    return {
      icon: <CheckCircle2 size={14} />,
      label: "已连通",
      className: "text-emerald-600 dark:text-emerald-300",
    };
  }
  if (account?.lastStatus === "error") {
    return {
      icon: <AlertCircle size={14} />,
      label: "连接失败",
      className: "text-rose-600 dark:text-rose-300",
    };
  }
  return {
    icon: <Sparkles size={14} />,
    label: "待验证",
    className: "text-muted-foreground",
  };
}

export default function ChannelsPage() {
  const { agents, refresh: refreshAgents } = useAgentsStore();
  const [config, setConfig] = useState<ChannelsConfig>(createDefaultConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [newAccountId, setNewAccountId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<(typeof CHANNEL_CATALOG)[number]["id"]>("feishu");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const activeAgents = useMemo(() => {
    const running = agents.filter((agent) => agent.running);
    return running.length > 0 ? running : agents;
  }, [agents]);

  const selectedMeta = CHANNEL_CATALOG.find((channel) => channel.id === selectedChannel) || CHANNEL_CATALOG[0];
  const feishu = config.feishu || createDefaultConfig().feishu!;
  const accountEntries = Object.entries(feishu.accounts || {});
  const selectedAccount =
    (selectedAccountId && feishu.accounts?.[selectedAccountId] && [selectedAccountId, feishu.accounts[selectedAccountId]] as const) ||
    (accountEntries[0] ? ([accountEntries[0][0], accountEntries[0][1]] as const) : null);

  useEffect(() => {
    void refreshAgents();
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const next = await invoke<ChannelsConfig>("get_channels_config");
        setConfig(normalizeConfig(next));
      } catch (error) {
        console.error("Failed to load channels config:", error);
        toast.error(`加载 Channels 失败: ${error}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshAgents]);

  useEffect(() => {
    if (!accountEntries.length) {
      setSelectedAccountId(null);
      return;
    }

    if (!selectedAccountId || !feishu.accounts?.[selectedAccountId]) {
      setSelectedAccountId(accountEntries[0][0]);
    }
  }, [accountEntries, feishu.accounts, selectedAccountId]);

  const updateFeishu = (updater: (current: FeishuChannelConfig) => FeishuChannelConfig) => {
    setConfig((current) => {
      const normalized = normalizeConfig(current);
      return {
        ...normalized,
        feishu: updater(normalized.feishu!),
      };
    });
  };

  const persistConfig = async (nextConfig = config, successMessage = "Channels 已保存") => {
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const saved = await invoke<ChannelsConfig>("save_channels_config", { config: nextConfig });
      setConfig(normalizeConfig(saved));
      toast.success(successMessage);
    } catch (error) {
      console.error("Failed to save channels config:", error);
      toast.error(`保存失败: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccount = () => {
    const id = newAccountId.trim();
    if (!id) {
      toast.error("先写一个账号标识，例如 main 或 ops");
      return;
    }
    if (feishu.accounts?.[id]) {
      toast.error("这个账号标识已经存在了");
      return;
    }

    updateFeishu((current) => ({
      ...current,
      defaultAccountId: current.defaultAccountId || id,
      accounts: {
        ...(current.accounts || {}),
        [id]: {
          enabled: true,
          domain: "feishu",
          lastStatus: "untested",
        },
      },
    }));
    setSelectedAccountId(id);
    setNewAccountId("");
  };

  const handleRemoveAccount = (accountId: string) => {
    updateFeishu((current) => {
      const nextAccounts = { ...(current.accounts || {}) };
      delete nextAccounts[accountId];
      return {
        ...current,
        defaultAccountId:
          current.defaultAccountId === accountId ? Object.keys(nextAccounts)[0] || null : current.defaultAccountId,
        accounts: nextAccounts,
      };
    });
  };

  const updateAccount = (accountId: string, updater: (current: FeishuAccountConfig) => FeishuAccountConfig) => {
    updateFeishu((current) => ({
      ...current,
      accounts: {
        ...(current.accounts || {}),
        [accountId]: updater(current.accounts?.[accountId] || {}),
      },
    }));
  };

  const updateCommaSeparated = (field: "allowedChatIds" | "allowedUserIds", value: string) => {
    updateFeishu((current) => ({
      ...current,
      policy: {
        ...(current.policy || {}),
        [field]: value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    }));
  };

  const testFeishuAccount = async (accountId: string) => {
    const account = feishu.accounts?.[accountId];
    if (!account) return;

    if (!account.appId?.trim() || !account.appSecret?.trim()) {
      toast.error("飞书连通测试至少需要 App ID 和 App Secret");
      return;
    }

    setTestingAccountId(accountId);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<FeishuConnectionResult>("test_feishu_channel_connection", {
        account,
      });

      const nextConfig = normalizeConfig(config);
      nextConfig.feishu!.accounts![accountId] = {
        ...nextConfig.feishu!.accounts![accountId],
        lastStatus: "connected",
        lastError: null,
        lastTestedAt: result.testedAt,
        tokenExpiresIn: result.expiresIn,
      };
      await persistConfig(nextConfig, `${accountId} 已连通飞书开放平台`);
    } catch (error) {
      console.error("Failed to test Feishu connection:", error);
      const nextConfig = normalizeConfig(config);
      nextConfig.feishu!.accounts![accountId] = {
        ...nextConfig.feishu!.accounts![accountId],
        lastStatus: "error",
        lastError: String(error),
        lastTestedAt: new Date().toISOString(),
        tokenExpiresIn: null,
      };
      setConfig(nextConfig);
      await persistConfig(nextConfig, "已记录连通测试结果");
      toast.error(String(error));
    } finally {
      setTestingAccountId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" />
        正在加载 Channels...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-3 pb-10">
      <div className={cn(panelClass, "flex flex-wrap items-center justify-between gap-3 px-5 py-4")}>
        <div className="min-w-0">
          <div className={sectionLabelClass}>Channels</div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-[22px] font-semibold tracking-tight">外部平台接入</h1>
            <span className="rounded-full border border-black/6 bg-[#fafaf8] px-2.5 py-1 text-xs text-muted-foreground">
              多平台统一配置
            </span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            左侧选平台，中间配路由，右侧维护账号池。
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-black/6 bg-[#fafaf8] px-3 py-2 text-xs text-muted-foreground">
            已就绪 {CHANNEL_CATALOG.filter((item) => item.status === "ready").length}
          </div>
          <button
            onClick={() => {
              void persistConfig();
            }}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            保存
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_380px]">
        <aside className={cn(panelClass, "p-3")}>
          <div className="px-2 pb-3">
            <div className={sectionLabelClass}>Platforms</div>
            <div className="mt-1 text-sm text-muted-foreground">选择要配置的外部入口。</div>
          </div>

          <div className="space-y-2">
            {CHANNEL_CATALOG.map((channel) => {
              const active = channel.id === selectedChannel;
              const enabled = channel.id === "feishu" ? Boolean(feishu.enabled) : false;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setSelectedChannel(channel.id)}
                  className={cn(
                    "w-full rounded-[20px] border px-3.5 py-3 text-left transition-colors",
                    active ? "border-black/10 bg-[#fafaf8]" : "border-transparent bg-transparent hover:border-black/6 hover:bg-[#fbfbf9]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-foreground">{channel.label}</div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">{channel.subtitle}</div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[10px]",
                        channel.status !== "ready"
                          ? "bg-black/5 text-muted-foreground"
                          : enabled
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-black/5 text-muted-foreground",
                      )}
                    >
                      {channel.status !== "ready" ? "即将支持" : enabled ? "已启用" : "未启用"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {selectedChannel !== "feishu" ? (
          <section className={cn(panelClass, "flex min-h-[420px] flex-col justify-between p-5")}>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[#fbfbf9] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                <Send size={12} />
                {selectedMeta.label}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{selectedMeta.label} 接入</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">沿用同一套账号池、路由策略和桥接模型。</p>
            </div>

            <div className="rounded-[24px] border border-dashed border-black/8 bg-[#fcfcfb] px-5 py-6 text-sm leading-7 text-muted-foreground">
              {selectedMeta.label} 还在接入中。这里后续会支持账号池、路由策略、权限和连通测试。
            </div>
          </section>
        ) : (
          <div className="space-y-3">
            <section className={cn(panelClass, "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[#fbfbf9] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
                    <Send size={12} />
                    Feishu
                  </div>
                  <h2 className="mt-3 text-[20px] font-semibold tracking-tight">飞书接入</h2>
                  <p className="mt-1 text-sm text-muted-foreground">这里配置平台入口本身，不是某个单独 agent。</p>
                </div>

                <label className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-[#fbfbf9] px-4 py-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={Boolean(feishu.enabled)}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }));
                    }}
                  />
                  启用
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className={sectionLabelClass}>连接方式</div>
                  <select
                    value={feishu.transport || "websocket"}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        transport: event.target.value as ChannelTransport,
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    {transportOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className={sectionLabelClass}>默认账号</div>
                  <select
                    value={feishu.defaultAccountId || ""}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        defaultAccountId: event.target.value || null,
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    <option value="">未指定</option>
                    {accountEntries.map(([accountId]) => (
                      <option key={accountId} value={accountId}>
                        {accountId}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className={sectionLabelClass}>默认 Agent</div>
                  <select
                    value={feishu.route?.defaultAgentId || ""}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        route: {
                          ...(current.route || {}),
                          defaultAgentId: event.target.value || null,
                        },
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    <option value="">未指定</option>
                    {activeAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className={sectionLabelClass}>Thread 策略</div>
                  <select
                    value={feishu.route?.threadMode || "thread-per-chat"}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        route: {
                          ...(current.route || {}),
                          threadMode: event.target.value as ChannelThreadMode,
                        },
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    {threadModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className={cn(panelClass, "p-4")}>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Shield size={15} />
                路由与权限
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <div className={sectionLabelClass}>私聊策略</div>
                  <select
                    value={feishu.policy?.dmPolicy || "allow"}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        policy: {
                          ...(current.policy || {}),
                          dmPolicy: event.target.value as ChannelDmPolicy,
                        },
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    {dmPolicyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className={sectionLabelClass}>群聊策略</div>
                  <select
                    value={feishu.policy?.groupPolicy || "mentions-only"}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        policy: {
                          ...(current.policy || {}),
                          groupPolicy: event.target.value as ChannelGroupPolicy,
                        },
                      }));
                    }}
                    className={cn(shellInputClass, "mt-2")}
                  >
                    {groupPolicyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="inline-flex items-center gap-2 rounded-2xl border border-black/6 bg-[#fbfbf9] px-4 py-3 text-sm text-foreground/85">
                  <input
                    type="checkbox"
                    className="rounded border-border"
                    checked={Boolean(feishu.policy?.requireMention)}
                    onChange={(event) => {
                      updateFeishu((current) => ({
                        ...current,
                        policy: {
                          ...(current.policy || {}),
                          requireMention: event.target.checked,
                        },
                      }));
                    }}
                  />
                  群聊必须 @ 机器人
                </label>

                <div className="rounded-2xl border border-black/6 bg-[#fbfbf9] px-4 py-3 text-sm text-muted-foreground">
                  默认 thread: {feishu.route?.threadMode === "shared-thread" ? "共享 thread" : "按会话分 thread"}
                </div>

                <div>
                  <div className={sectionLabelClass}>群组白 / 黑名单</div>
                  <input
                    value={(feishu.policy?.allowedChatIds || []).join(", ")}
                    onChange={(event) => updateCommaSeparated("allowedChatIds", event.target.value)}
                    className={cn(shellInputClass, "mt-2")}
                    placeholder="chat_id1, chat_id2"
                  />
                </div>

                <div>
                  <div className={sectionLabelClass}>用户白 / 黑名单</div>
                  <input
                    value={(feishu.policy?.allowedUserIds || []).join(", ")}
                    onChange={(event) => updateCommaSeparated("allowedUserIds", event.target.value)}
                    className={cn(shellInputClass, "mt-2")}
                    placeholder="user_id1, user_id2"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <aside className={cn(panelClass, "p-4")}>
          {selectedChannel !== "feishu" ? (
            <div className="rounded-[24px] border border-dashed border-black/8 bg-[#fcfcfb] px-4 py-6 text-sm leading-7 text-muted-foreground">
              {selectedMeta.label} 的账号池会在平台接入落地时开放。
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className={sectionLabelClass}>Accounts</div>
                  <div className="mt-1 text-sm text-muted-foreground">一个 channel 可以挂多个机器人或应用。</div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  value={newAccountId}
                  onChange={(event) => setNewAccountId(event.target.value)}
                  className={cn(shellInputClass, "flex-1")}
                  placeholder="main / ops / internal-bot"
                />
                <button
                  onClick={handleAddAccount}
                  className="inline-flex items-center gap-2 rounded-2xl border border-black/6 bg-[#fbfbf9] px-3.5 py-2 text-sm font-medium text-foreground hover:bg-white"
                >
                  <Plus size={14} />
                  添加
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {accountEntries.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-black/8 bg-[#fcfcfb] px-4 py-6 text-sm leading-7 text-muted-foreground">
                    还没有账号。先创建账号标识，再填 App ID 和 App Secret。
                  </div>
                ) : (
                  accountEntries.map(([accountId, account]) => {
                    const tone = accountStatusTone(account);
                    return (
                      <button
                        key={accountId}
                        type="button"
                        onClick={() => setSelectedAccountId(accountId)}
                        className={cn(
                          "w-full rounded-[20px] border px-3.5 py-3 text-left transition-colors",
                          selectedAccount?.[0] === accountId
                            ? "border-black/10 bg-[#fafaf8]"
                            : "border-transparent bg-transparent hover:border-black/6 hover:bg-[#fbfbf9]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[14px] font-medium text-foreground">{accountId}</div>
                            <div className={cn("mt-1 inline-flex items-center gap-1.5 text-xs", tone.className)}>
                              {tone.icon}
                              {tone.label}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-muted-foreground">
                            <div>{account.domain === "larksuite" ? "国际站" : "中国站"}</div>
                            <div>{formatTime(account.lastTestedAt)}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedAccount && (
                <div className="mt-4 rounded-[22px] border border-black/6 bg-[#fbfbf9] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-semibold text-foreground">{selectedAccount[0]}</div>
                      <div className="mt-1 text-xs text-muted-foreground">编辑当前账号的凭证与连通状态。</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 rounded-full border border-black/6 bg-white px-3 py-1.5 text-sm text-foreground/85">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={Boolean(selectedAccount[1].enabled)}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              enabled: event.target.checked,
                            }));
                          }}
                        />
                        启用
                      </label>
                      <button
                        onClick={() => handleRemoveAccount(selectedAccount[0])}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/6 bg-white text-muted-foreground hover:text-foreground"
                        title={`删除 ${selectedAccount[0]}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div>
                      <div className={sectionLabelClass}>显示名称</div>
                      <input
                        value={selectedAccount[1].label || ""}
                        onChange={(event) => {
                          updateAccount(selectedAccount[0], (current) => ({
                            ...current,
                            label: event.target.value,
                          }));
                        }}
                        className={cn(shellInputClass, "mt-2")}
                        placeholder="例如：飞书生产机器人"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className={sectionLabelClass}>域名区域</div>
                        <select
                          value={selectedAccount[1].domain || "feishu"}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              domain: event.target.value as "feishu" | "larksuite",
                            }));
                          }}
                          className={cn(shellInputClass, "mt-2")}
                        >
                          <option value="feishu">中国站 · open.feishu.cn</option>
                          <option value="larksuite">国际站 · open.larksuite.com</option>
                        </select>
                      </div>

                      <div>
                        <div className={sectionLabelClass}>App ID</div>
                        <input
                          value={selectedAccount[1].appId || ""}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              appId: event.target.value,
                            }));
                          }}
                          className={cn(shellInputClass, "mt-2")}
                          placeholder="cli_xxx 或 a123..."
                        />
                      </div>

                      <div>
                        <div className={sectionLabelClass}>App Secret</div>
                        <input
                          value={selectedAccount[1].appSecret || ""}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              appSecret: event.target.value,
                            }));
                          }}
                          className={cn(shellInputClass, "mt-2")}
                          placeholder="填写飞书应用 secret"
                        />
                      </div>

                      <div>
                        <div className={sectionLabelClass}>Verification Token</div>
                        <input
                          value={selectedAccount[1].verificationToken || ""}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              verificationToken: event.target.value,
                            }));
                          }}
                          className={cn(shellInputClass, "mt-2")}
                          placeholder="Webhook 验签时需要"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className={sectionLabelClass}>Encrypt Key</div>
                        <input
                          value={selectedAccount[1].encryptKey || ""}
                          onChange={(event) => {
                            updateAccount(selectedAccount[0], (current) => ({
                              ...current,
                              encryptKey: event.target.value,
                            }));
                          }}
                          className={cn(shellInputClass, "mt-2")}
                          placeholder="事件加密时需要"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/6 bg-white px-4 py-3">
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>最近测试：{formatTime(selectedAccount[1].lastTestedAt)}</div>
                      {selectedAccount[1].lastError ? (
                        <div className="max-w-md text-rose-600 dark:text-rose-300">{selectedAccount[1].lastError}</div>
                      ) : (
                        <div>Token 有效期：{selectedAccount[1].tokenExpiresIn ? `${selectedAccount[1].tokenExpiresIn} 秒` : "未获取"}</div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        void testFeishuAccount(selectedAccount[0]);
                      }}
                      disabled={testingAccountId === selectedAccount[0]}
                      className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                    >
                      {testingAccountId === selectedAccount[0] ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      测试连接
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
