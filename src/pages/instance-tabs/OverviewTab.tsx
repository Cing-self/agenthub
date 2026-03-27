import type { DetectedAgent } from "@/lib/types/agents";

interface Props {
  agent: DetectedAgent;
  config: Record<string, unknown> | null;
}

export default function OverviewTab({ agent, config }: Props) {
  const meta = config?.meta as Record<string, unknown> | undefined;
  const agents = config?.agents as Record<string, unknown> | undefined;
  const agentList = (agents?.list as unknown[]) || [];
  const channels = config?.channels as Record<string, unknown> | undefined;
  const gateway = config?.gateway as Record<string, unknown> | undefined;
  const plugins = config?.plugins as Record<string, unknown> | undefined;
  const pluginEntries = (plugins?.entries || {}) as Record<string, Record<string, unknown>>;
  const enabledPlugins = Object.entries(pluginEntries).filter(([, v]) => v.enabled);

  const enabledChannels = channels
    ? Object.entries(channels).filter(
        ([, v]) => (v as Record<string, unknown>)?.enabled
      )
    : [];

  // Get variant from details
  const variant =
    agent.details.type === "openclaw" ? agent.details.variant : agent.agent_type;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <Card title="Variant" value={variant} />
      <Card title="Home" value={agent.home_dir} />
      <Card
        title="Status"
        value={agent.running ? `Running (PID ${agent.pid})` : "Stopped"}
        highlight={agent.running ? "green" : "red"}
      />
      {meta?.lastTouchedVersion && (
        <Card title="Version" value={String(meta.lastTouchedVersion)} />
      )}
      {agent.process_name && (
        <Card title="Process" value={agent.process_name} />
      )}
      <Card title="Agents" value={`${agentList.length} configured`} />
      <Card
        title="Channels"
        value={enabledChannels.map(([k]) => k).join(", ") || "None"}
      />
      <Card
        title="Plugins"
        value={`${enabledPlugins.length} enabled`}
      />
      {gateway?.port && (
        <Card title="Gateway Port" value={String(gateway.port)} />
      )}
      {gateway?.mode && (
        <Card title="Gateway Mode" value={String(gateway.mode)} />
      )}
      {agent.details.type === "openclaw" && (
        <>
          <Card
            title="Workspaces"
            value={`${agent.details.workspace_count} workspace(s)`}
          />
        </>
      )}
    </div>
  );
}

function Card({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground mb-1">{title}</div>
      <div
        className={`text-sm font-medium truncate ${
          highlight === "green"
            ? "text-emerald-400"
            : highlight === "red"
            ? "text-red-400"
            : ""
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
