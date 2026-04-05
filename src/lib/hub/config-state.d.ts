import type { HubMediaConfig, McpServer, Model, ModelProvider } from "@/lib/types/hub";

export function compactProviderConfig(provider: ModelProvider): ModelProvider;
export function compactHubMediaConfig(media: HubMediaConfig | null | undefined): HubMediaConfig | null;
export function normalizeHubConfigState(hub: Record<string, unknown> | null | undefined): {
  providers: ModelProvider[];
  models: Model[];
  mcpServers: McpServer[];
  media: HubMediaConfig | null;
};
