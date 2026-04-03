export type ChannelPlatform = "feishu";
export type GatewayKind = "feishu";
export type ChannelTransport = "websocket" | "webhook";
export type ChannelDmPolicy = "allow" | "deny";
export type ChannelGroupPolicy =
  | "mentions-only"
  | "allowlist"
  | "denylist"
  | "all"
  | "none";
export type ChannelThreadMode = "thread-per-chat" | "shared-thread";
export type FeishuDomain = "feishu" | "larksuite";

export interface ChannelRouteConfig {
  defaultAgentId?: string | null;
  defaultThreadId?: string | null;
  threadMode?: ChannelThreadMode | null;
}

export interface ChannelPolicyConfig {
  dmPolicy?: ChannelDmPolicy | null;
  groupPolicy?: ChannelGroupPolicy | null;
  requireMention?: boolean | null;
  streaming?: boolean | null;
  allowedChatIds?: string[];
  allowedUserIds?: string[];
}

export interface FeishuAccountConfig {
  enabled?: boolean | null;
  label?: string | null;
  domain?: FeishuDomain | null;
  appId?: string | null;
  appSecret?: string | null;
  verificationToken?: string | null;
  encryptKey?: string | null;
  lastStatus?: "connected" | "error" | "untested" | null;
  lastError?: string | null;
  lastTestedAt?: string | null;
  tokenExpiresIn?: number | null;
  cardkitAvailable?: boolean | null;
  cardkitCheckedAt?: string | null;
  cardkitMessage?: string | null;
}

export interface FeishuChannelConfig {
  enabled?: boolean | null;
  transport?: ChannelTransport | null;
  defaultAccountId?: string | null;
  policy?: ChannelPolicyConfig | null;
  route?: ChannelRouteConfig | null;
  accounts?: Record<string, FeishuAccountConfig>;
}

export interface ChannelsConfig {
  feishu?: FeishuChannelConfig | null;
}

export interface FeishuConnectionResult {
  domain: string;
  endpoint: string;
  testedAt: string;
  expiresIn: number | null;
  tokenPreview: string | null;
  message: string;
  cardkitAvailable: boolean;
  cardkitMessage: string | null;
}

export interface GatewayWorkerStatus {
  running: boolean;
  pid?: number | null;
  status: "stopped" | "starting" | "running" | "error" | string;
  startedAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  lastReplyAt?: string | null;
  lastError?: string | null;
  accountId?: string | null;
  agentId?: string | null;
  transport?: string | null;
  runtimeBackend?: string | null;
  runtimeBackendDetail?: string | null;
  botOpenId?: string | null;
  gatewayId?: string | null;
  gatewayKind?: GatewayKind | string | null;
  conversationStorePath?: string | null;
  logPath: string;
}

export interface GatewayWorkerLogTail {
  logPath: string;
  lines: string[];
  truncated: boolean;
  updatedAt: string;
}

export type FeishuDaemonStatus = GatewayWorkerStatus;
