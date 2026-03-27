export type ConnectorType = "local" | "ssh" | "http" | "cloud";

export type ConnectorStatus =
  | "online"
  | "offline"
  | "degraded"
  | "unauthorized";

export type AgentDeployment = "local" | "remote";

export type ThreadStatus = "active" | "paused" | "completed" | "archived";

export type SessionMode = "native" | "stateless";

export type SessionStatus = "idle" | "running" | "waiting" | "error";

export type TaskStatus =
  | "todo"
  | "claimed"
  | "running"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export type CommunicationMode = "hub-board" | "hub-relay" | "federated";

export type FederatedProtocol = "a2a" | "anp" | "awiki";

export type ConnectorAuthMode = "none" | "token" | "ssh-key" | "oauth";

export type TaskEventType =
  | "thread_created"
  | "thread_renamed"
  | "user_message"
  | "assistant_message"
  | "agent_selected"
  | "session_created"
  | "session_resumed"
  | "summary_updated"
  | "task_created"
  | "task_claimed"
  | "task_completed"
  | "artifact_added"
  | "handoff_generated"
  | "handoff_applied"
  | "run_failed";

export interface ConnectorCapabilities {
  list_agents: boolean;
  get_health: boolean;
  read_config: boolean;
  write_config: boolean;
  launch_agent: boolean;
  stop_agent: boolean;
  stream_logs: boolean;
  create_or_resume_session: boolean;
  submit_handoff: boolean;
}

export interface ConnectorRef {
  id: string;
  name: string;
  type: ConnectorType;
  status: ConnectorStatus;
  location_label: string;
  auth_mode: ConnectorAuthMode;
  base_url?: string;
  capabilities: ConnectorCapabilities;
  metadata?: Record<string, unknown>;
}

export interface RuntimeCapabilities {
  native_session: boolean;
  resume_session: boolean;
  handoff_packet: boolean;
  structured_tasks: boolean;
  streaming_output: boolean;
  tool_calls: boolean;
  federated_inbox: boolean;
}

export interface ManagedAgentRef {
  id: string;
  connector_id: string;
  agent_type: string;
  runtime_family: string;
  name: string;
  deployment: AgentDeployment;
  status: ConnectorStatus;
  config_ref?: string;
  runtime_capabilities: RuntimeCapabilities;
  metadata?: Record<string, unknown>;
}

export interface ThreadRef {
  id: string;
  title: string;
  goal: string;
  status: ThreadStatus;
  default_agent_id?: string;
  board_id: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionRef {
  id: string;
  thread_id: string;
  agent_id: string;
  runtime_session_id: string | null;
  mode: SessionMode;
  status: SessionStatus;
  last_seen_board_version: number;
  last_handoff_version: number;
  created_at: string;
  updated_at: string;
}

export interface BoardArtifact {
  id: string;
  kind: "file" | "link" | "note" | "diff" | "log";
  title: string;
  ref: string;
  summary?: string;
}

export interface TaskBoard {
  id: string;
  thread_id: string;
  version: number;
  objective: string;
  current_focus?: string;
  summary: string;
  decisions: string[];
  open_questions: string[];
  key_files: string[];
  artifacts: BoardArtifact[];
  updated_by?: string;
  updated_at: string;
}

export interface BoardTask {
  id: string;
  thread_id: string;
  board_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigned_agent_id?: string;
  priority: TaskPriority;
  depends_on: string[];
  artifact_refs: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskEvent {
  id: string;
  thread_id: string;
  board_version: number;
  event_type: TaskEventType;
  title: string;
  body?: string;
  agent_id?: string;
  session_id?: string;
  task_id?: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface HandoffPacket {
  thread_id: string;
  board_id: string;
  board_version: number;
  from_agent_id?: string;
  to_agent_id: string;
  objective: string;
  current_focus?: string;
  summary: string;
  open_questions: string[];
  key_files: string[];
  artifact_refs: string[];
  selected_task_ids: string[];
  recent_context: string[];
  latest_user_message: string;
}

export interface CollaborationRoute {
  id: string;
  source_agent_id: string;
  target_agent_id: string;
  mode: CommunicationMode;
  protocol?: FederatedProtocol;
  trigger: string;
  enabled: boolean;
}

export interface ThreadBundle {
  thread: ThreadRef;
  board: TaskBoard;
  tasks: BoardTask[];
  sessions: AgentSessionRef[];
  events: TaskEvent[];
}
