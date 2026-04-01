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
  const runtimeFamily =
    agent.runtime_family ?? agent.runtime_profile?.runtime_family ?? agent.agent_type;

  const cards = [
    <Card key="variant" title="Variant" value={variant} />,
    <Card key="runtime" title="Runtime" value={runtimeFamily} />,
    <Card key="home" title="Home" value={agent.home_dir} />,
    <Card
      key="status"
      title="Status"
      value={agent.running ? `Running (PID ${agent.pid})` : "Stopped"}
      highlight={agent.running ? "green" : "red"}
    />,
  ];

  if (meta?.lastTouchedVersion != null) {
    cards.push(<Card key="version" title="Version" value={String(meta.lastTouchedVersion)} />);
  }

  if (agent.process_name) {
    cards.push(<Card key="process" title="Process" value={agent.process_name} />);
  }

  if (agent.details.type === "custom-agent") {
    cards.push(
      <Card key="auth" title="Auth" value={agent.details.auth_source || "runtime default"} />,
      <Card key="model" title="Default Model" value={agent.details.default_model || "runtime default"} />,
      <Card key="based-on" title="Based On" value={agent.details.based_on_runtime} />,
    );
  } else {
    cards.push(
      <Card key="agents" title="Agents" value={`${agentList.length} configured`} />,
      <Card
        key="channels"
        title="Channels"
        value={enabledChannels.map(([k]) => k).join(", ") || "None"}
      />,
      <Card key="plugins" title="Plugins" value={`${enabledPlugins.length} enabled`} />,
    );
  }

  if (gateway?.port != null) {
    cards.push(<Card key="gateway-port" title="Gateway Port" value={String(gateway.port)} />);
  }

  if (gateway?.mode != null) {
    cards.push(<Card key="gateway-mode" title="Gateway Mode" value={String(gateway.mode)} />);
  }

  if (agent.details.type === "openclaw") {
    cards.push(
      <Card
        key="workspaces"
        title="Workspaces"
        value={`${agent.details.workspace_count} workspace(s)`}
      />,
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards}
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
