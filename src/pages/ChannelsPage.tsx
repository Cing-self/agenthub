import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  ChannelDmPolicy,
  ChannelGroupPolicy,
  ChannelThreadMode,
  ChannelsConfig,
  FeishuAccountConfig,
  FeishuChannelConfig,
  FeishuConnectionResult,
  FeishuDaemonStatus,
  GatewayWorkerLogTail,
} from "@/lib/types/channels";
import { useAgentsStore } from "@/stores/agents-store";

const FEISHU_PRIMARY_ACCOUNT_ID = "default";
const FEISHU_OPEN_PLATFORM_URL = "https://open.feishu.cn/";

const FEISHU_DM_POLICY_OPTIONS: Array<{
  value: ChannelDmPolicy;
  label: string;
  hint: string;
}> = [
  { value: "allow", label: "允许私聊", hint: "机器人会处理私聊消息。" },
  { value: "deny", label: "忽略私聊", hint: "机器人不会响应私聊消息。" },
];

const FEISHU_GROUP_POLICY_OPTIONS: Array<{
  value: ChannelGroupPolicy;
  label: string;
  hint: string;
}> = [
  {
    value: "mentions-only",
    label: "仅 @ 时响应",
    hint: "群聊里只有被 @ 才会处理。",
  },
  { value: "all", label: "群聊都处理", hint: "群消息默认都会进入当前 Agent。" },
  { value: "none", label: "忽略群聊", hint: "群消息不会进入当前 Agent。" },
  {
    value: "allowlist",
    label: "群白名单",
    hint: "仅 allowedChatIds 中的群会被处理。",
  },
  {
    value: "denylist",
    label: "群黑名单",
    hint: "allowedChatIds 中的群将被忽略。",
  },
];

const FEISHU_THREAD_MODE_OPTIONS: Array<{
  value: ChannelThreadMode;
  label: string;
  hint: string;
}> = [
  {
    value: "thread-per-chat",
    label: "每个聊天独立会话",
    hint: "每个群或私聊各自维护 runtime session。",
  },
  {
    value: "shared-thread",
    label: "共享一个会话",
    hint: "所有聊天复用同一条 runtime session。",
  },
];

const shellInputClass =
  "w-full rounded-[20px] border border-black/8 bg-white px-4 py-3 text-[14px] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-[#93d7ca] focus:ring-4 focus:ring-[#edf9f6]";

const panelClass =
  "rounded-[28px] border border-black/6 bg-white/92 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.18)] backdrop-blur-sm";

const CHANNEL_CATALOG = [
  {
    id: "dingtalk",
    label: "钉钉",
    subtitle: "钉钉机器人",
    badgeText: "钉",
    badgeClass: "bg-[#eef2ff] text-[#667dff]",
    status: "coming" as const,
  },
  {
    id: "wechat",
    label: "微信",
    subtitle: "微信 ClawBot",
    badgeText: "微",
    badgeClass: "bg-[#edf9ef] text-[#2ea664]",
    status: "coming" as const,
  },
  {
    id: "feishu",
    label: "飞书",
    subtitle: "飞书机器人",
    badgeText: "飞",
    badgeClass: "bg-[#eaf1ff] text-[#3d7cff]",
    status: "ready" as const,
  },
  {
    id: "telegram",
    label: "Telegram",
    subtitle: "Telegram Bot",
    badgeText: "TG",
    badgeClass: "bg-[#eef7ff] text-[#3798ff]",
    status: "coming" as const,
  },
  {
    id: "discord",
    label: "Discord",
    subtitle: "Discord Gateway",
    badgeText: "DC",
    badgeClass: "bg-[#f2efff] text-[#7259ff]",
    status: "coming" as const,
  },
] as const;

const FEISHU_GUIDE_STEPS = [
  "登录飞书开放平台，创建企业自建应用，在应用能力中添加机器人能力。",
  "在“凭证与基础信息”页面获取 App ID 和 App Secret。",
  "进入权限管理，批量导入权限，粘贴权限清单",
  "进入「事件与回调 -> 事件配置 -> 订阅方式」，使用长连接接收事件，并添加事件 `im.message.receive_v1`。",
  "创建应用版本并发布，注意检查可用范围选项。",
  "在下方填写凭证，系统会校验 App ID 与 App Secret。",
  "把机器人加入群聊并 @ 机器人，或私聊机器人完成配对授权。",
] as const;

const FEISHU_PERMISSION_PAYLOAD = {
  scopes: {
    tenant: [
      "contact:contact.base:readonly",
      "docx:document:readonly",
      "im:chat:read",
      "im:chat:update",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message.pins:read",
      "im:message.pins:write_only",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:message:readonly",
      "im:message:recall",
      "im:message:send_as_bot",
      "im:message:send_multi_users",
      "im:message:send_sys_msg",
      "im:message:update",
      "im:resource",
      "application:application:self_manage",
      "cardkit:card:write",
      "cardkit:card:read",
      "contact:user.basic_profile:readonly",
    ],
    user: [
      "contact:user.employee_id:readonly",
      "offline_access",
      "base:app:copy",
      "base:field:create",
      "base:field:delete",
      "base:field:read",
      "base:field:update",
      "base:record:create",
      "base:record:delete",
      "base:record:retrieve",
      "base:record:update",
      "base:table:create",
      "base:table:delete",
      "base:table:read",
      "base:table:update",
      "base:view:read",
      "base:view:write_only",
      "base:app:create",
      "base:app:update",
      "base:app:read",
      "sheets:spreadsheet.meta:read",
      "sheets:spreadsheet:read",
      "sheets:spreadsheet:create",
      "sheets:spreadsheet:write_only",
      "docs:document:export",
      "docs:document.media:upload",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "calendar:calendar:read",
      "calendar:calendar.event:create",
      "calendar:calendar.event:delete",
      "calendar:calendar.event:read",
      "calendar:calendar.event:reply",
      "calendar:calendar.event:update",
      "calendar:calendar.free_busy:read",
      "contact:contact.base:readonly",
      "contact:user.base:readonly",
      "contact:user:search",
      "docs:document.comment:create",
      "docs:document.comment:read",
      "docs:document.comment:update",
      "docs:document.media:download",
      "docs:document:copy",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "drive:drive.metadata:readonly",
      "drive:file:download",
      "drive:file:upload",
      "im:chat.members:read",
      "im:chat:read",
      "im:message",
      "im:message.group_msg:get_as_user",
      "im:message.p2p_msg:get_as_user",
      "im:message:readonly",
      "search:docs:read",
      "search:message",
      "space:document:delete",
      "space:document:move",
      "space:document:retrieve",
      "task:comment:read",
      "task:comment:write",
      "task:task:read",
      "task:task:write",
      "task:task:writeonly",
      "task:tasklist:read",
      "task:tasklist:write",
      "wiki:node:copy",
      "wiki:node:create",
      "wiki:node:move",
      "wiki:node:read",
      "wiki:node:retrieve",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:space:write_only",
      "contact:user.basic_profile:readonly",
    ],
  },
};

const FEISHU_PERMISSION_TEXT = JSON.stringify(
  FEISHU_PERMISSION_PAYLOAD,
  null,
  2,
);
const DEFAULT_DAEMON_STATUS: FeishuDaemonStatus = {
  running: false,
  status: "stopped",
  logPath: "",
};

function createDefaultConfig(): ChannelsConfig {
  return {
    feishu: {
      enabled: false,
      transport: "websocket",
      defaultAccountId: FEISHU_PRIMARY_ACCOUNT_ID,
      policy: {
        dmPolicy: "allow",
        groupPolicy: "mentions-only",
        requireMention: true,
        streaming: false,
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

function normalizeConfig(
  config: ChannelsConfig | null | undefined,
): ChannelsConfig {
  return {
    ...createDefaultConfig(),
    ...config,
    feishu: {
      ...createDefaultConfig().feishu,
      ...(config?.feishu || {}),
      transport: "websocket",
      defaultAccountId:
        config?.feishu?.defaultAccountId ||
        Object.keys(config?.feishu?.accounts || {})[0] ||
        FEISHU_PRIMARY_ACCOUNT_ID,
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

function getPrimaryAccountId(feishu: FeishuChannelConfig) {
  if (feishu.defaultAccountId && feishu.accounts?.[feishu.defaultAccountId]) {
    return feishu.defaultAccountId;
  }
  return Object.keys(feishu.accounts || {})[0] || FEISHU_PRIMARY_ACCOUNT_ID;
}

function getPrimaryAccount(
  feishu: FeishuChannelConfig,
): [string, FeishuAccountConfig] {
  const accountId = getPrimaryAccountId(feishu);
  return [
    accountId,
    {
      enabled: true,
      domain: "feishu",
      lastStatus: "untested",
      ...(feishu.accounts?.[accountId] || {}),
    },
  ];
}

function canStartFeishuDaemon(feishu: FeishuChannelConfig) {
  const [, account] = getPrimaryAccount(feishu);
  return Boolean(
    feishu.enabled &&
    account.lastStatus === "connected" &&
    account.appId?.trim() &&
    account.appSecret?.trim() &&
    feishu.route?.defaultAgentId?.trim(),
  );
}

function accountStatusTone(account: FeishuAccountConfig | undefined) {
  if (account?.lastStatus === "connected") {
    return {
      icon: <CheckCircle2 size={14} />,
      label: "凭证已验证",
      className: "text-emerald-600",
    };
  }
  if (account?.lastStatus === "error") {
    return {
      icon: <AlertCircle size={14} />,
      label: "连接失败",
      className: "text-rose-600",
    };
  }
  return {
    icon: <Sparkles size={14} />,
    label: "待验证",
    className: "text-muted-foreground",
  };
}

function ChannelBadge({
  channel,
  active = false,
}: {
  channel: (typeof CHANNEL_CATALOG)[number];
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-2xl text-[15px] font-semibold shadow-[0_16px_28px_-20px_rgba(15,23,42,0.35)]",
        channel.badgeClass,
        active && "ring-4 ring-white/90",
      )}
    >
      {channel.badgeText}
    </div>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[18px] border border-black/7 bg-[#fcfcfb] px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const { agents, refresh: refreshAgents } = useAgentsStore();
  const [config, setConfig] = useState<ChannelsConfig>(createDefaultConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingDaemon, setSyncingDaemon] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState<FeishuDaemonStatus>(
    DEFAULT_DAEMON_STATUS,
  );
  const [daemonLog, setDaemonLog] = useState<GatewayWorkerLogTail | null>(null);
  const [loadingDaemonLog, setLoadingDaemonLog] = useState(false);
  const [selectedChannel, setSelectedChannel] =
    useState<(typeof CHANNEL_CATALOG)[number]["id"]>("feishu");
  const [showFeishuDialog, setShowFeishuDialog] = useState(false);

  const selectedMeta =
    CHANNEL_CATALOG.find((channel) => channel.id === selectedChannel) ||
    CHANNEL_CATALOG[0];
  const feishu = config.feishu || createDefaultConfig().feishu!;
  const [primaryAccountId, primaryAccount] = useMemo(
    () => getPrimaryAccount(feishu),
    [feishu],
  );
  const primaryAccountTone = accountStatusTone(primaryAccount);
  const appIdReady = Boolean(primaryAccount.appId?.trim());
  const appSecretReady = Boolean(primaryAccount.appSecret?.trim());
  const configured = appIdReady && appSecretReady;
  const enabledChannelCount = Number(Boolean(feishu.enabled));
  const selectableAgents = useMemo(() => {
    return [...agents]
      .filter((agent) => agent.agent_type === "custom-agent")
      .sort((left, right) => {
        if (left.running !== right.running) {
          return left.running ? -1 : 1;
        }
        return left.name.localeCompare(right.name, "zh-CN");
      });
  }, [agents]);
  const selectedAgentId = feishu.route?.defaultAgentId || "";
  const selectedAgent =
    selectableAgents.find((agent) => agent.id === selectedAgentId) ||
    agents.find(
      (agent) =>
        agent.agent_type === "custom-agent" && agent.id === selectedAgentId,
    ) ||
    null;
  const selectedAgentInvalid = Boolean(selectedAgentId && !selectedAgent);
  const daemonRunning = daemonStatus.running;
  const selectedDmPolicy = feishu.policy?.dmPolicy || "allow";
  const selectedGroupPolicy = feishu.policy?.groupPolicy || "mentions-only";
  const selectedThreadMode = feishu.route?.threadMode || "thread-per-chat";
  const streamingEnabled = feishu.policy?.streaming === true;
  const requireMention = feishu.policy?.requireMention !== false;
  const cardkitReady = primaryAccount.cardkitAvailable === true;
  const replyModeLabel = streamingEnabled
    ? cardkitReady
      ? "流式卡片"
      : "整段返回（Card Kit 未就绪）"
    : "整段返回";
  const daemonStateLabel = daemonRunning
    ? "网关运行中"
    : daemonStatus.status === "error"
      ? "网关异常"
      : "网关未运行";
  const daemonStateClass = daemonRunning
    ? "text-emerald-600"
    : daemonStatus.status === "error"
      ? "text-rose-600"
      : "text-muted-foreground";

  const refreshDaemonStatus = async ({
    reconcile = false,
    forceRestart = false,
    quiet = false,
  }: {
    reconcile?: boolean;
    forceRestart?: boolean;
    quiet?: boolean;
  } = {}) => {
    if (reconcile) {
      setSyncingDaemon(true);
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = reconcile
        ? await invoke<FeishuDaemonStatus>("sync_gateway_worker", {
            kind: "feishu",
            forceRestart,
          })
        : await invoke<FeishuDaemonStatus>("get_gateway_worker_status", {
            kind: "feishu",
          });
      setDaemonStatus(status);
      void refreshDaemonLog(true);
      if (!quiet && !status.running && status.lastError) {
        toast.error(`飞书网关未启动：${status.lastError}`);
      }
      return status;
    } catch (error) {
      console.error("Failed to refresh Feishu daemon status:", error);
      const fallback: FeishuDaemonStatus = {
        ...DEFAULT_DAEMON_STATUS,
        status: "error",
        lastError: String(error),
      };
      setDaemonStatus(fallback);
      setDaemonLog(null);
      if (!quiet) {
        toast.error(`读取飞书网关状态失败: ${error}`);
      }
      return fallback;
    } finally {
      if (reconcile) {
        setSyncingDaemon(false);
      }
    }
  };

  const refreshDaemonLog = async (quiet = false) => {
    setLoadingDaemonLog(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const next = await invoke<GatewayWorkerLogTail>("read_gateway_worker_log", {
        kind: "feishu",
        tailLines: 80,
      });
      setDaemonLog(next);
      return next;
    } catch (error) {
      console.error("Failed to read Feishu gateway log:", error);
      if (!quiet) {
        toast.error(`读取飞书网关日志失败: ${error}`);
      }
      return null;
    } finally {
      setLoadingDaemonLog(false);
    }
  };

  const stopDaemonStatus = async (quiet = false) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const status = await invoke<FeishuDaemonStatus>("stop_gateway_worker", {
        kind: "feishu",
      });
      setDaemonStatus(status);
      void refreshDaemonLog(true);
      return status;
    } catch (error) {
      console.error("Failed to stop Feishu daemon:", error);
      if (!quiet) {
        toast.error(`停止飞书网关失败: ${error}`);
      }
      const fallback: FeishuDaemonStatus = {
        ...DEFAULT_DAEMON_STATUS,
        status: "error",
        lastError: String(error),
      };
      setDaemonStatus(fallback);
      setDaemonLog(null);
      return fallback;
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [{ invoke }] = await Promise.all([
          import("@tauri-apps/api/core"),
          refreshAgents(),
        ]);
        const next = await invoke<ChannelsConfig>("get_channels_config");
        const normalized = normalizeConfig(next);
        setConfig(normalized);
        if (
          canStartFeishuDaemon(
            normalized.feishu || createDefaultConfig().feishu!,
          )
        ) {
          await refreshDaemonStatus({ reconcile: true, quiet: true });
        } else {
          await stopDaemonStatus(true);
        }
        await refreshDaemonLog(true);
      } catch (error) {
        console.error("Failed to load channels config:", error);
        toast.error(`加载 Channels 失败: ${error}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshAgents]);

  useEffect(() => {
    if (!showFeishuDialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowFeishuDialog(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showFeishuDialog]);

  const updateFeishu = (
    updater: (current: FeishuChannelConfig) => FeishuChannelConfig,
  ) => {
    setConfig((current) => {
      const normalized = normalizeConfig(current);
      const nextFeishu = updater(normalized.feishu!);
      return {
        ...normalized,
        feishu: {
          ...nextFeishu,
          transport: "websocket",
          defaultAccountId: getPrimaryAccountId(nextFeishu),
        },
      };
    });
  };

  const updatePrimaryAccount = (
    updater: (current: FeishuAccountConfig) => FeishuAccountConfig,
  ) => {
    updateFeishu((current) => {
      const accountId = getPrimaryAccountId(current);
      return {
        ...current,
        accounts: {
          ...(current.accounts || {}),
          [accountId]: updater(current.accounts?.[accountId] || {}),
        },
      };
    });
  };

  const persistConfig = async (
    nextConfig = config,
    successMessage = "Channels 已保存",
  ) => {
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const saved = await invoke<ChannelsConfig>("save_channels_config", {
        config: normalizeConfig(nextConfig),
      });
      const normalized = normalizeConfig(saved);
      setConfig(normalized);
      if (
        canStartFeishuDaemon(normalized.feishu || createDefaultConfig().feishu!)
      ) {
        const status = await refreshDaemonStatus({
          reconcile: true,
          forceRestart: true,
          quiet: true,
        });
        if (!status.running && status.lastError) {
          toast.error(`飞书网关未启动：${status.lastError}`);
        }
      } else {
        await stopDaemonStatus(true);
      }
      toast.success(successMessage);
    } catch (error) {
      console.error("Failed to save channels config:", error);
      toast.error(`保存失败: ${error}`);
    } finally {
      setSaving(false);
    }
  };

  const setDefaultAgentId = async (agentId: string) => {
    const nextConfig = normalizeConfig(config);
    nextConfig.feishu = {
      ...nextConfig.feishu,
      route: {
        ...(nextConfig.feishu?.route || {}),
        defaultAgentId: agentId || null,
      },
    };
    setConfig(nextConfig);

    if (
      primaryAccount.lastStatus === "connected" &&
      appIdReady &&
      appSecretReady
    ) {
      await persistConfig(
        nextConfig,
        agentId ? "已切换处理智能体" : "已清空处理智能体",
      );
    }
  };

  const testFeishuConnection = async () => {
    const account: FeishuAccountConfig = {
      ...primaryAccount,
      domain: "feishu",
      enabled: true,
    };

    if (!account.appId?.trim() || !account.appSecret?.trim()) {
      toast.error("飞书连通测试至少需要 App ID 和 App Secret");
      return;
    }

    setTesting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<FeishuConnectionResult>(
        "test_feishu_channel_connection",
        {
          account,
        },
      );

      const nextConfig = normalizeConfig(config);
      nextConfig.feishu = {
        ...nextConfig.feishu,
        enabled: true,
        transport: "websocket",
        defaultAccountId: primaryAccountId,
        accounts: {
          ...(nextConfig.feishu?.accounts || {}),
          [primaryAccountId]: {
            ...(nextConfig.feishu?.accounts?.[primaryAccountId] || {}),
            ...account,
            lastStatus: "connected",
            lastError: null,
            lastTestedAt: result.testedAt,
            tokenExpiresIn: result.expiresIn,
            cardkitAvailable: result.cardkitAvailable,
            cardkitCheckedAt: result.testedAt,
            cardkitMessage: result.cardkitMessage,
          },
        },
      };
      await persistConfig(nextConfig, result.message);
    } catch (error) {
      console.error("Failed to test Feishu connection:", error);
      const nextConfig = normalizeConfig(config);
      nextConfig.feishu = {
        ...nextConfig.feishu,
        transport: "websocket",
        defaultAccountId: primaryAccountId,
        accounts: {
          ...(nextConfig.feishu?.accounts || {}),
          [primaryAccountId]: {
            ...(nextConfig.feishu?.accounts?.[primaryAccountId] || {}),
            ...account,
            lastStatus: "error",
            lastError: String(error),
            lastTestedAt: new Date().toISOString(),
            tokenExpiresIn: null,
            cardkitAvailable: null,
            cardkitCheckedAt: null,
            cardkitMessage: null,
          },
        },
      };
      setConfig(nextConfig);
      await persistConfig(nextConfig, "已记录飞书连接结果");
      toast.error(String(error));
    } finally {
      setTesting(false);
    }
  };

  const openChannelSetup = (
    channelId: (typeof CHANNEL_CATALOG)[number]["id"],
  ) => {
    setSelectedChannel(channelId);
    if (channelId === "feishu") {
      setShowFeishuDialog(true);
    }
  };

  const copyFeishuPermissions = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(FEISHU_PERMISSION_TEXT);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = FEISHU_PERMISSION_TEXT;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("权限清单已复制");
    } catch (error) {
      console.error("Failed to copy Feishu permissions:", error);
      toast.error("复制失败，请稍后重试");
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

  const feishuDialog =
    showFeishuDialog && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-[rgba(15,23,42,0.36)] px-4 py-6 backdrop-blur-sm"
            onClick={() => setShowFeishuDialog(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="连接飞书"
              className="flex max-h-[90vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[32px] border border-black/8 bg-[#fbfaf7] shadow-[0_40px_140px_rgba(15,23,42,0.28)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-black/6 bg-white/82 px-7 py-6 backdrop-blur">
                <div className="flex items-center gap-4">
                  <ChannelBadge channel={selectedMeta} active />
                  <div>
                    <div className="text-[31px] font-semibold tracking-tight text-foreground">
                      连接飞书
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      默认使用 WebSocket 长连接收事件，不需要配置回调安全。
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowFeishuDialog(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/4 hover:text-foreground"
                  title="关闭"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto px-7 py-7">
                <div className="rounded-[28px] border border-[#efdc83] bg-[#fffbe9] px-5 py-5 shadow-[0_18px_38px_-30px_rgba(195,152,29,0.55)]">
                  <div className="text-[16px] font-semibold text-[#936300]">
                    如何连接：
                  </div>
                  <ol className="mt-3 space-y-2.5 text-[15px] leading-7 text-[#6d5a23]">
                    {FEISHU_GUIDE_STEPS.map((step, index) => (
                      <li key={step} className="flex gap-2.5">
                        <span className="w-5 shrink-0 font-medium">
                          {index + 1}.
                        </span>
                        <span>
                          {index === 0 ? (
                            <>
                              登录
                              <a
                                href={FEISHU_OPEN_PLATFORM_URL}
                                target="_blank"
                                rel="noreferrer"
                                className="mx-1 text-[#4d7cff] underline underline-offset-2 hover:text-[#2f6ef2]"
                              >
                                飞书开放平台
                              </a>
                              ，创建企业自建应用，在应用能力中添加机器人能力。
                            </>
                          ) : (
                            step
                          )}
                          {index === 2 ? (
                            <>
                              （
                              <button
                                type="button"
                                onClick={() => {
                                  void copyFeishuPermissions();
                                }}
                                className="inline-flex items-center gap-1 text-[#8a6500] underline underline-offset-2 hover:text-[#6d5000]"
                              >
                                <Copy size={13} />
                                点击复制
                              </button>
                              ）
                            </>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-7 space-y-5">
                  <div>
                    <div className="mb-2 text-[18px] font-medium text-foreground">
                      App ID *
                    </div>
                    <input
                      value={primaryAccount.appId || ""}
                      onChange={(event) => {
                        updatePrimaryAccount((current) => ({
                          ...current,
                          enabled: true,
                          domain: "feishu",
                          appId: event.target.value,
                          lastStatus: "untested",
                          lastError: null,
                        }));
                      }}
                      className={cn(
                        shellInputClass,
                        "border-[#b8e3da] focus:border-[#78cfbc]",
                      )}
                      placeholder="在「凭证与基础信息」中复制，例如 cli_xxxxxxxxx"
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-[18px] font-medium text-foreground">
                      App Secret *
                    </div>
                    <input
                      value={primaryAccount.appSecret || ""}
                      onChange={(event) => {
                        updatePrimaryAccount((current) => ({
                          ...current,
                          enabled: true,
                          domain: "feishu",
                          appSecret: event.target.value,
                          lastStatus: "untested",
                          lastError: null,
                        }));
                      }}
                      className={shellInputClass}
                      placeholder="在「凭证与基础信息」中复制 App Secret"
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-[18px] font-medium text-foreground">
                      处理智能体
                    </div>
                    {selectableAgents.length > 0 ? (
                      <select
                        value={selectedAgentId}
                        onChange={(event) => {
                          void setDefaultAgentId(event.target.value);
                        }}
                        disabled={saving || testing || syncingDaemon}
                        className={shellInputClass}
                      >
                        <option value="">请选择智能体</option>
                        {selectableAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {`${agent.icon} ${agent.name}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-black/8 bg-white px-4 py-3 text-sm text-muted-foreground">
                        暂无可选智能体，请先在 Agent 页面创建一个自定义智能体。
                      </div>
                    )}
                    <div className="mt-2 text-sm text-muted-foreground">
                      选择一个智能体来处理飞书渠道中的消息。
                    </div>
                    {selectedAgentInvalid ? (
                      <div className="mt-2 text-sm text-rose-600">
                        当前配置引用的不是自定义智能体，请重新选择一个 Agent
                        页面里创建的智能体。
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[24px] border border-black/6 bg-white/75 p-4">
                    <div className="text-[17px] font-medium text-foreground">
                      会话与触发策略
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      这几项决定飞书网关如何把消息接进来，以及落到哪个 runtime
                      session。
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-sm font-medium text-foreground">
                          私聊策略
                        </div>
                        <select
                          value={selectedDmPolicy}
                          onChange={(event) => {
                            updateFeishu((current) => ({
                              ...current,
                              policy: {
                                ...(current.policy || {}),
                                dmPolicy: event.target.value as ChannelDmPolicy,
                              },
                            }));
                          }}
                          className={shellInputClass}
                        >
                          {FEISHU_DM_POLICY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {
                            FEISHU_DM_POLICY_OPTIONS.find(
                              (option) => option.value === selectedDmPolicy,
                            )?.hint
                          }
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium text-foreground">
                          群聊策略
                        </div>
                        <select
                          value={selectedGroupPolicy}
                          onChange={(event) => {
                            updateFeishu((current) => ({
                              ...current,
                              policy: {
                                ...(current.policy || {}),
                                groupPolicy: event.target
                                  .value as ChannelGroupPolicy,
                              },
                            }));
                          }}
                          className={shellInputClass}
                        >
                          {FEISHU_GROUP_POLICY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {
                            FEISHU_GROUP_POLICY_OPTIONS.find(
                              (option) => option.value === selectedGroupPolicy,
                            )?.hint
                          }
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium text-foreground">
                          Thread Session
                        </div>
                        <select
                          value={selectedThreadMode}
                          onChange={(event) => {
                            updateFeishu((current) => ({
                              ...current,
                              route: {
                                ...(current.route || {}),
                                threadMode: event.target
                                  .value as ChannelThreadMode,
                              },
                            }));
                          }}
                          className={shellInputClass}
                        >
                          {FEISHU_THREAD_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {
                            FEISHU_THREAD_MODE_OPTIONS.find(
                              (option) => option.value === selectedThreadMode,
                            )?.hint
                          }
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-black/6 bg-[#fcfcfb] px-4 py-3">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={streamingEnabled}
                            onChange={(event) => {
                              updateFeishu((current) => ({
                                ...current,
                                policy: {
                                  ...(current.policy || {}),
                                  streaming: event.target.checked,
                                },
                              }));
                            }}
                            className="mt-1 h-4 w-4 rounded border-black/15 text-[#3d7cff] focus:ring-[#3d7cff]/30"
                          />
                          <span>
                            <span className="block text-sm font-medium text-foreground">
                              流式回复
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              仅在飞书应用具备 Card Kit 能力时启用流式卡片；否则等待完整结果后一次性返回。
                            </span>
                          </span>
                        </label>
                      </div>

                      <div className="rounded-[20px] border border-black/6 bg-[#fcfcfb] px-4 py-3">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={requireMention}
                            disabled={
                              selectedGroupPolicy === "mentions-only" ||
                              selectedGroupPolicy === "none"
                            }
                            onChange={(event) => {
                              updateFeishu((current) => ({
                                ...current,
                                policy: {
                                  ...(current.policy || {}),
                                  requireMention: event.target.checked,
                                },
                              }));
                            }}
                            className="mt-1 h-4 w-4 rounded border-black/15 text-[#3d7cff] focus:ring-[#3d7cff]/30"
                          />
                          <span>
                            <span className="block text-sm font-medium text-foreground">
                              群聊必须 @ 机器人
                            </span>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {selectedGroupPolicy === "mentions-only"
                                ? "当前群聊策略已经要求只有被 @ 时才会处理。"
                                : selectedGroupPolicy === "none"
                                  ? "当前群聊策略已关闭群消息处理。"
                                  : "开启后，群消息即使满足群策略也仍然需要 @ 机器人。"}
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>

                    {selectedGroupPolicy === "allowlist" ||
                    selectedGroupPolicy === "denylist" ? (
                      <div className="mt-3 rounded-[18px] border border-dashed border-black/8 bg-[#fcfcfb] px-4 py-3 text-sm text-muted-foreground">
                        当前白名单 /
                        黑名单模式已经可以被网关执行；`allowedChatIds`
                        先沿用配置文件字段，后面我会再补一个可视化编辑器。
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[22px] border border-black/6 bg-white/75 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          primaryAccountTone.className,
                        )}
                      >
                        {primaryAccountTone.icon}
                        {primaryAccountTone.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          daemonStateClass,
                        )}
                      >
                        {daemonRunning ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <AlertCircle size={14} />
                        )}
                        {daemonStateLabel}
                      </span>
                      <span className="text-muted-foreground">
                        智能体：
                        {selectedAgent
                          ? `${selectedAgent.icon} ${selectedAgent.name}`
                          : "未选择"}
                      </span>
                      <span className="text-muted-foreground">
                        连接方式：WebSocket 长连
                      </span>
                      <span className="text-muted-foreground">
                        会话：
                        {
                          FEISHU_THREAD_MODE_OPTIONS.find(
                            (option) => option.value === selectedThreadMode,
                          )?.label
                        }
                      </span>
                      <span className="text-muted-foreground">
                        回复：{replyModeLabel}
                      </span>
                      <span className="text-muted-foreground">
                        最近测试：{formatTime(primaryAccount.lastTestedAt)}
                      </span>
                    </div>
                    {daemonStatus.runtimeBackend ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        执行内核：
                        {daemonStatus.runtimeBackend === "claude-code-main"
                          ? " claude-code-main"
                          : daemonStatus.runtimeBackend === "claude-agent-sdk"
                            ? " Claude Agent SDK"
                            : " 系统 claude CLI"}
                      </div>
                    ) : null}
                    {daemonStatus.lastError ? (
                      <div className="mt-2 text-sm leading-6 text-rose-600">
                        {daemonStatus.lastError}
                      </div>
                    ) : primaryAccount.lastError ? (
                      <div className="mt-2 text-sm leading-6 text-rose-600">
                        {primaryAccount.lastError}
                      </div>
                    ) : primaryAccount.tokenExpiresIn ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        Token 有效期：{primaryAccount.tokenExpiresIn} 秒
                      </div>
                    ) : null}
                    {primaryAccount.cardkitMessage ? (
                      <div className="mt-2 text-sm text-muted-foreground">
                        流式能力：
                        <span
                          className={cn(
                            "ml-1",
                            primaryAccount.cardkitAvailable
                              ? "text-emerald-600"
                              : "text-amber-600",
                          )}
                        >
                          {primaryAccount.cardkitMessage}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[22px] border border-black/6 bg-[#0f172a] px-4 py-3 text-white/92">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">网关日志</div>
                        <div className="mt-1 text-xs text-white/55">
                          {daemonLog?.logPath || daemonStatus.logPath || "暂无日志文件"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void refreshDaemonLog();
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs text-white/88 transition-colors hover:bg-white/12"
                      >
                        {loadingDaemonLog ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RefreshCw size={12} />
                        )}
                        刷新日志
                      </button>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-[18px] border border-white/10 bg-black/24">
                      <pre className="max-h-[220px] overflow-auto px-4 py-3 text-[11px] leading-5 text-white/80">
                        {daemonLog?.lines?.length
                          ? daemonLog.lines.join("\n")
                          : "暂时还没有网关日志输出。"}
                      </pre>
                    </div>
                    {daemonLog?.truncated ? (
                      <div className="mt-2 text-[11px] text-white/45">
                        这里只显示最近 80 行，更多内容请查看本地日志文件。
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-black/6 bg-white/78 px-7 py-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowFeishuDialog(false)}
                  className="inline-flex min-w-[164px] items-center justify-center rounded-[20px] border border-black/8 bg-white px-4 py-3 text-[16px] font-medium text-foreground transition-colors hover:bg-[#fafaf8]"
                >
                  取消
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void testFeishuConnection();
                  }}
                  disabled={testing || syncingDaemon}
                  className="inline-flex min-w-[192px] items-center justify-center gap-2 rounded-[20px] bg-[#3d7cff] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[#2f6ef2] disabled:opacity-60"
                >
                  {testing || syncingDaemon ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  连接
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <div className="text-[34px] font-semibold tracking-tight text-foreground">
            消息渠道
          </div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            配置 AI
            智能体与用户交互的消息平台。所有连接数据存储在本地，无需云端托管。
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            {CHANNEL_CATALOG.length} 个渠道
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-black/6 bg-white/80 px-4 py-2 text-sm text-muted-foreground">
            已启用 {enabledChannelCount} / {CHANNEL_CATALOG.length}
          </div>
          <button
            onClick={() => {
              void persistConfig();
            }}
            disabled={saving || syncingDaemon}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving || syncingDaemon ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            保存全部
          </button>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        {CHANNEL_CATALOG.map((channel) => {
          const active = channel.id === selectedChannel;
          const isReady = channel.status === "ready";
          const isFeishu = channel.id === "feishu";
          const statusLabel = !isReady
            ? "未开放"
            : daemonRunning
              ? "网关运行中"
              : primaryAccount.lastStatus === "connected"
                ? "凭证已验证"
                : configured
                  ? "待验证"
                  : "未关联";
          const statusClass = !isReady
            ? "bg-black/5 text-muted-foreground"
            : daemonRunning
              ? "bg-emerald-500/12 text-emerald-700"
              : primaryAccount.lastStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-700"
                : configured
                  ? "bg-[#3d7cff]/10 text-[#2f6ef2]"
                  : "bg-black/5 text-muted-foreground";
          const actionLabel = isReady
            ? configured
              ? "配置渠道"
              : "连接渠道"
            : "即将支持";

          return (
            <div
              key={channel.id}
              className={cn(
                panelClass,
                "p-5 transition-all",
                active
                  ? "border-black/10 shadow-[0_28px_70px_-54px_rgba(61,124,255,0.42)]"
                  : "",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <ChannelBadge channel={channel} active={active} />
                  <div className="min-w-0">
                    <div className="text-[28px] font-semibold tracking-tight text-foreground">
                      {channel.label}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {channel.subtitle}
                      <button
                        type="button"
                        onClick={() => {
                          if (isReady) {
                            openChannelSetup(channel.id);
                            return;
                          }
                          setSelectedChannel(channel.id);
                        }}
                        className="ml-2 text-[#4d7cff] underline underline-offset-2"
                      >
                        {isReady ? "如何接入？" : "查看规划"}
                      </button>
                    </div>
                  </div>
                </div>

                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium",
                    statusClass,
                  )}
                >
                  {statusLabel}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricPill
                  label={isFeishu ? "App ID" : "已配对用户"}
                  value={isFeishu ? (appIdReady ? "已填" : "未填") : 0}
                />
                <MetricPill
                  label={isFeishu ? "App Secret" : "已配对群聊"}
                  value={isFeishu ? (appSecretReady ? "已填" : "未填") : 0}
                />
                <MetricPill
                  label={isFeishu ? "连接方式" : "待处理请求"}
                  value={isFeishu ? "长连" : 0}
                />
              </div>

              <div className="mt-4 rounded-[24px] border border-dashed border-black/8 bg-[#fcfcfb] p-4">
                {isFeishu ? (
                  <>
                    <div className="text-sm font-medium text-foreground">
                      {selectedAgent ? "已配置智能体" : "请配置智能体"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {selectedAgent
                        ? `当前由 ${selectedAgent.icon} ${selectedAgent.name} 处理此渠道消息。`
                        : "选择一个智能体来处理此渠道的消息。"}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      网关状态：
                      <span
                        className={cn("ml-1 font-medium", daemonStateClass)}
                      >
                        {daemonStateLabel}
                      </span>
                    </div>
                    <div className="mt-3">
                      {selectableAgents.length > 0 ? (
                        <select
                          value={selectedAgentId}
                          onChange={(event) => {
                            void setDefaultAgentId(event.target.value);
                          }}
                          disabled={saving || testing || syncingDaemon}
                          className={shellInputClass}
                        >
                          <option value="">请选择智能体</option>
                          {selectableAgents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {`${agent.icon} ${agent.name}`}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-black/8 bg-white px-4 py-3 text-sm text-muted-foreground">
                          暂无可选智能体，请先在 Agent
                          页面创建一个自定义智能体。
                        </div>
                      )}
                    </div>
                    {selectedAgentInvalid ? (
                      <div className="mt-2 text-sm text-rose-600">
                        当前保存的不是自定义智能体，所以飞书网关不会按它路由；请重新选择。
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        渠道规划
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        当前你可以先参考飞书的连接方式，后续平台会沿用同一套弹窗接入体验。
                      </div>
                    </div>
                    <div className="pt-1 text-muted-foreground">›</div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (isReady) {
                      openChannelSetup(channel.id);
                      return;
                    }
                    setSelectedChannel(channel.id);
                  }}
                  className={cn(
                    "w-full rounded-[18px] px-4 py-3 text-sm font-medium transition-colors",
                    isReady
                      ? "border border-[#3278ff]/15 bg-[#3d7cff] text-white hover:bg-[#2f6ef2]"
                      : "border border-black/6 bg-[#fbfbf9] text-muted-foreground",
                  )}
                >
                  {actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {selectedChannel !== "feishu" ? (
        <section className={cn(panelClass, "p-6")}>
          <div className="flex items-center gap-4">
            <ChannelBadge channel={selectedMeta} />
            <div>
              <div className="text-[28px] font-semibold tracking-tight text-foreground">
                {selectedMeta.label} 接入
              </div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {selectedMeta.label} 正在接入中。后续会沿用飞书这套“渠道卡片 +
                连接弹窗”的方式逐步补齐。
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-dashed border-black/8 bg-[#fcfcfb] px-5 py-6 text-sm leading-7 text-muted-foreground">
            当前你可以先参考飞书的配置流程，我们会把其它平台也做成更轻量的单页接入体验。
          </div>
        </section>
      ) : null}

      {feishuDialog}
    </div>
  );
}
