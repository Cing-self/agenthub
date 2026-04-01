export type MemoryScope = "global" | "workspace" | "thread" | "agent" | "user" | "device";
export type MemoryProviderKind = "memos" | "openmem";

export type MemoryKind =
  | "preference"
  | "project_fact"
  | "constraint"
  | "decision"
  | "environment"
  | "skill_usage"
  | "mcp_usage"
  | "model_preference"
  | "secret_ref"
  | "note";

export type MemoryVisibility = "visible" | "internal";

export interface MemoryItem {
  id: string;
  content: string;
  kind: MemoryKind | string;
  scope: MemoryScope | string;
  scope_id?: string | null;
  visibility: MemoryVisibility | string;
  source: string;
  confidence: number;
  pinned: boolean;
  hidden: boolean;
  created_by?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
}

export interface CapabilityProfile {
  id: string;
  scope: MemoryScope | string;
  scope_id?: string | null;
  source: string;
  enabled_skills: string[];
  enabled_mcp_servers: string[];
  preferred_models: string[];
  preferred_providers: string[];
  secret_refs: string[];
  default_agent_id?: string | null;
  updated_at: string;
}

export interface MemoryProviderConfig {
  provider: MemoryProviderKind | string;
  enabled: boolean;
  base_url: string;
  access_token?: string | null;
}

export interface MemoryConnectionState {
  provider: MemoryProviderKind | string;
  provider_label: string;
  config: MemoryProviderConfig;
  configured: boolean;
  connected: boolean;
  current_user?: string | null;
  last_error?: string | null;
}

export interface AgentMemoryEntry {
  id: string;
  content: string;
  source_agent: string;
  source_icon: string;
  created_at: string;
  tags: string[];
  synced_to: string[];
}

export interface AgentMemoryInfo {
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  memory_dir: string;
  memory_count: number;
  format: string;
  entries: AgentMemoryEntry[];
}

export interface MemoryDashboard {
  items: MemoryItem[];
  profiles: CapabilityProfile[];
  external_sources: AgentMemoryInfo[];
  connection: MemoryConnectionState;
}

export interface ChatMemoryContext {
  memories: MemoryItem[];
  capability_profile: CapabilityProfile;
}
