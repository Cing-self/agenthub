export interface OpenClawDetails {
  type: "openclaw";
  has_discord: boolean;
  has_telegram: boolean;
  has_whatsapp: boolean;
  agent_count: number;
  workspace_count: number;
}

export interface ClaudeCodeDetails {
  type: "claude-code";
  has_skills: boolean;
  has_plugins: boolean;
  project_count: number;
}

export interface CodexDetails {
  type: "codex";
  has_config: boolean;
  has_skills: boolean;
}

export interface OpenCodeDetails {
  type: "opencode";
  has_agents: boolean;
  has_skills: boolean;
}

export type AgentDetails =
  | OpenClawDetails
  | ClaudeCodeDetails
  | CodexDetails
  | OpenCodeDetails;

export interface DetectedAgent {
  id: string;
  agent_type: string;
  name: string;
  icon: string;
  config_path: string;
  home_dir: string;
  running: boolean;
  pid: number | null;
  process_name: string | null;
  version: string | null;
  details: AgentDetails;
}

export interface HealthStatus {
  agents: DetectedAgent[];
  total_running: number;
  total_detected: number;
}
