import type { RuntimeProfile } from "@/lib/types/agents";

export interface SharedChannelAccount {
  enabled?: boolean;
  identifier?: string;
  token?: string;
  secret?: string;
  webhookUrl?: string;
  appId?: string;
  botId?: string;
}

export interface SharedChannelConfig {
  enabled?: boolean;
  groupPolicy?: string;
  streaming?: string;
  transport?: string;
  accounts?: Record<string, SharedChannelAccount>;
}

export interface CustomAgentConfig {
  id: string;
  name: string;
  icon?: string | null;
  runtime_profile: RuntimeProfile;
  model_ids?: string[];
  mcp_server_ids?: string[];
  skill_directories?: string[];
}
