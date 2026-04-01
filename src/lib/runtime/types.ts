import type { DetectedAgent } from "@/lib/types/agents";
import type { MessageBlock, RuntimeMessageMetadata } from "@/lib/types/chat";

export type RuntimeSessionMode = "native" | "stateless";

export interface RuntimeBootstrapFiles {
  user_profile?: string;
  agent_identity?: string;
  agent_soul?: string;
  workspace_rules?: string;
  capability_notes?: string;
}

export interface RuntimeCapabilities {
  native_sessions: boolean;
  memory_tool: boolean;
  configurable_bootstrap: boolean;
  structured_output: boolean;
  streaming_output: boolean;
}

export interface RuntimeSendParams {
  agent: DetectedAgent;
  threadId: string;
  agentId: string;
  prompt: string;
  runtimeSessionId: string | null;
  requestId?: string | null;
}

export interface RuntimeSendResult {
  rawText: string;
  parsedBlocks: MessageBlock[];
  runtimeSessionId: string | null;
  metadata?: RuntimeMessageMetadata;
}

export interface RuntimeStreamEvent {
  requestId: string;
  rawText: string;
  runtimeSessionId?: string | null;
}

export interface RuntimeAdapter {
  id: string;
  label: string;
  sessionMode: RuntimeSessionMode;
  capabilities: RuntimeCapabilities;
  sendMessage: (params: RuntimeSendParams) => Promise<RuntimeSendResult>;
}
