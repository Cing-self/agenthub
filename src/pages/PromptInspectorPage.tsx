import { useState } from "react";
import { Eye, Search, ChevronDown, ChevronRight, AlertTriangle, Copy, Check, FileText, Wrench, MessageSquare, Bot, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";

interface PromptCall {
  id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  model: string;
  sections: PromptSection[];
  total_tokens: number;
  context_window: number;
  usage_percent: number;
}

interface PromptSection {
  type: "system" | "history" | "tools" | "user" | "assistant" | "tool_result";
  label: string;
  content: string;
  token_count: number;
  percent: number;
}

// Demo data to show the UI concept
function generateDemoData(agents: { id: string; name: string; icon: string }[]): PromptCall[] {
  return agents.slice(0, 3).map((a, i) => {
    const contextWindow = 200000;
    const systemTokens = 2000 + i * 500;
    const historyTokens = 8000 + i * 3000;
    const toolsTokens = 1500 + i * 800;
    const userTokens = 200 + i * 50;
    const total = systemTokens + historyTokens + toolsTokens + userTokens;

    return {
      id: `call-${i}`,
      timestamp: new Date(Date.now() - i * 60000 * 5).toISOString(),
      agent_id: a.id,
      agent_name: a.name,
      agent_icon: a.icon,
      model: i === 0 ? "claude-sonnet-4-6" : i === 1 ? "gpt-5.4" : "glm-5",
      sections: [
        { type: "system", label: "System Prompt", content: "You are a helpful AI assistant with access to tools...\n[SOUL.md content]\n[Agent persona instructions]\n[Safety guidelines]", token_count: systemTokens, percent: (systemTokens / total) * 100 },
        { type: "history", label: "Conversation History", content: `[${Math.floor(historyTokens / 150)} messages in context]`, token_count: historyTokens, percent: (historyTokens / total) * 100 },
        { type: "tools", label: "Tool Definitions", content: `[${Math.floor(toolsTokens / 100)} tools registered: web_search, file_read, file_write, bash, ...]`, token_count: toolsTokens, percent: (toolsTokens / total) * 100 },
        { type: "user", label: "User Message", content: "Help me analyze this code and suggest improvements", token_count: userTokens, percent: (userTokens / total) * 100 },
      ],
      total_tokens: total,
      context_window: contextWindow,
      usage_percent: (total / contextWindow) * 100,
    };
  });
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  system: <Bot size={14} />,
  history: <MessageSquare size={14} />,
  tools: <Wrench size={14} />,
  user: <FileText size={14} />,
  assistant: <Bot size={14} />,
  tool_result: <Layers size={14} />,
};

const SECTION_COLORS: Record<string, string> = {
  system: "bg-purple-500",
  history: "bg-blue-500",
  tools: "bg-orange-500",
  user: "bg-emerald-500",
  assistant: "bg-cyan-500",
  tool_result: "bg-yellow-500",
};

export default function PromptInspectorPage() {
  const { agents } = useAgentsStore();
  const [calls] = useState<PromptCall[]>(() => generateDemoData(agents));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Eye size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Prompt Inspector</h1>
          <p className="text-sm text-muted-foreground">Inspect context composition for each API call</p>
        </div>
      </div>

      {/* Proxy notice */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-500">Preview mode</p>
          <p className="text-muted-foreground mt-1">
            Enable the AgentHub proxy to capture real prompts. Below is a demo of how the inspector will look.
          </p>
        </div>
      </div>

      {/* Call list */}
      <div className="space-y-3">
        {calls.map((call) => (
          <div key={call.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Call header */}
            <button
              onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            >
              {expandedId === call.id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
              <span>{call.agent_icon}</span>
              <span className="font-medium text-sm">{call.agent_name}</span>
              <span className="text-xs text-muted-foreground font-mono">{call.model}</span>
              <div className="flex-1" />
              <span className="text-xs font-mono text-muted-foreground">{fmt(call.total_tokens)} tokens</span>
              <span className="text-xs text-muted-foreground">({call.usage_percent.toFixed(1)}% of {fmt(call.context_window)})</span>
            </button>

            {/* Context window usage bar */}
            <div className="px-4 pb-2">
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                {call.sections.map((section) => (
                  <div
                    key={section.type}
                    className={cn("h-full", SECTION_COLORS[section.type])}
                    style={{ width: `${(section.token_count / call.context_window) * 100}%` }}
                    title={`${section.label}: ${fmt(section.token_count)} (${section.percent.toFixed(1)}%)`}
                  />
                ))}
              </div>
            </div>

            {/* Expanded detail */}
            {expandedId === call.id && (
              <div className="border-t border-border px-4 py-3 space-y-3">
                {/* Section breakdown */}
                {call.sections.map((section) => (
                  <div key={section.type} className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                      <div className={cn("h-2.5 w-2.5 rounded-full", SECTION_COLORS[section.type])} />
                      {SECTION_ICONS[section.type]}
                      <span className="text-xs font-medium flex-1">{section.label}</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {fmt(section.token_count)} ({section.percent.toFixed(1)}%)
                      </span>
                      <button
                        onClick={() => handleCopy(`${call.id}-${section.type}`, section.content)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copied === `${call.id}-${section.type}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      </button>
                    </div>
                    <pre className="px-3 py-2 text-xs font-mono text-muted-foreground max-h-[120px] overflow-auto whitespace-pre-wrap">
                      {section.content}
                    </pre>
                  </div>
                ))}

                {/* Optimization hints */}
                <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Optimization hints</p>
                  {call.sections.find((s) => s.type === "history" && s.percent > 50) && (
                    <p>- Conversation history uses {call.sections.find((s) => s.type === "history")?.percent.toFixed(0)}% of context. Consider enabling compaction.</p>
                  )}
                  {call.sections.find((s) => s.type === "tools" && s.token_count > 2000) && (
                    <p>- Tool definitions use {fmt(call.sections.find((s) => s.type === "tools")?.token_count || 0)} tokens. Consider disabling unused tools.</p>
                  )}
                  {call.usage_percent < 10 && (
                    <p>- Context usage is very low ({call.usage_percent.toFixed(1)}%). A smaller/cheaper model might work.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.entries(SECTION_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("h-2 w-2 rounded-full", color)} />
            <span className="capitalize">{type.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
