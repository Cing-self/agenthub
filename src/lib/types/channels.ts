export type ChannelPlatform = "feishu";
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
}
