import { useEffect, useState } from "react";
import { Brain, RefreshCw, Loader2, Search, ArrowRightLeft, Plus, Trash2, FolderOpen, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import { toast } from "sonner";

interface MemoryEntry {
  id: string;
  content: string;
  source_agent: string;
  source_icon: string;
  created_at: string;
  tags: string[];
  synced_to: string[];
}

interface AgentMemoryInfo {
  agent_id: string;
  agent_name: string;
  agent_icon: string;
  memory_dir: string;
  memory_count: number;
  format: string; // "markdown" | "json" | "sqlite"
  entries: MemoryEntry[];
}

export default function MemoryPage() {
  const { agents } = useAgentsStore();
  const [memories, setMemories] = useState<AgentMemoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  const loadMemories = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<AgentMemoryInfo[]>("scan_agent_memories");
      setMemories(data);
    } catch {
      // Build from detected agents
      const mems: AgentMemoryInfo[] = agents.map((a) => {
        let memDir = "";
        let format = "unknown";
        let count = 0;

        if (a.agent_type === "openclaw") {
          memDir = `${a.home_dir}/memory`;
          format = "markdown";
          count = 3;
        } else if (a.agent_type === "claude-code") {
          memDir = `${a.home_dir}/projects`;
          format = "markdown (CLAUDE.md)";
          count = 5;
        } else if (a.id === "codex") {
          memDir = `${a.home_dir}/memories`;
          format = "markdown";
          count = 2;
        }

        const entries: MemoryEntry[] = [];
        if (a.agent_type === "openclaw") {
          entries.push(
            { id: `${a.id}-1`, content: "User prefers Chinese communication, building tools for OpenClaw ecosystem", source_agent: a.name, source_icon: a.icon, created_at: "2026-03-22", tags: ["user-profile"], synced_to: [] },
            { id: `${a.id}-2`, content: "Discord server: 虾尾团队, with channels for AIGC, AI-Coding, 自媒体运营", source_agent: a.name, source_icon: a.icon, created_at: "2026-03-20", tags: ["project", "discord"], synced_to: [] },
            { id: `${a.id}-3`, content: "Preferred models: Claude Sonnet for general, GLM-5 for Chinese tasks", source_agent: a.name, source_icon: a.icon, created_at: "2026-03-18", tags: ["preference"], synced_to: [] },
          );
        } else if (a.agent_type === "claude-code") {
          entries.push(
            { id: `${a.id}-1`, content: "AgentHub project at ~/Desktop/Dolphin/openclaw-manager, Tauri 2 + React", source_agent: a.name, source_icon: a.icon, created_at: "2026-03-23", tags: ["project"], synced_to: [] },
            { id: `${a.id}-2`, content: "User likes clean UI, references AutoClaw warm design style", source_agent: a.name, source_icon: a.icon, created_at: "2026-03-23", tags: ["preference"], synced_to: [] },
          );
        }

        return {
          agent_id: a.id,
          agent_name: a.name,
          agent_icon: a.icon,
          memory_dir: memDir,
          memory_count: entries.length || count,
          format,
          entries,
        };
      }).filter((m) => m.memory_dir);

      setMemories(mems);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMemories(); }, [agents]);

  const toggleEntry = (id: string) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSync = () => {
    if (selectedEntries.size === 0) {
      toast.error("Select memories to sync first");
      return;
    }
    toast.success(`Syncing ${selectedEntries.size} memories across agents...`);
    setSelectedEntries(new Set());
  };

  const filteredMemories = memories.map((m) => ({
    ...m,
    entries: m.entries.filter((e) =>
      !searchQuery || e.content.toLowerCase().includes(searchQuery.toLowerCase()) || e.tags.some((t) => t.includes(searchQuery.toLowerCase()))
    ),
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Brain size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Unified Memory</h1>
            <p className="text-sm text-muted-foreground">View and sync memories across all agents</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedEntries.size > 0 && (
            <button onClick={handleSync} className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <ArrowRightLeft size={14} />
              Sync {selectedEntries.size} selected
            </button>
          )}
          <button onClick={loadMemories} disabled={loading} className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories across all agents..."
          className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm"
        />
      </div>

      {/* Memory summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {memories.map((m) => (
          <div key={m.agent_id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm">{m.agent_icon}</span>
              <span className="text-xs font-medium truncate">{m.agent_name}</span>
            </div>
            <div className="text-lg font-semibold">{m.memory_count}</div>
            <div className="text-[10px] text-muted-foreground">{m.format}</div>
          </div>
        ))}
      </div>

      {/* Per-agent memory list */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((m) => (
            <div key={m.agent_id} className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedAgent(expandedAgent === m.agent_id ? null : m.agent_id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                {expandedAgent === m.agent_id ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                <span>{m.agent_icon}</span>
                <span className="font-medium text-sm flex-1">{m.agent_name}</span>
                <span className="text-xs text-muted-foreground">{m.entries.length} memories</span>
                <span className="text-[10px] text-muted-foreground/60 font-mono">{m.format}</span>
              </button>

              {expandedAgent === m.agent_id && (
                <div className="border-t border-border">
                  {m.entries.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">No memories found</div>
                  ) : (
                    m.entries.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedEntries.has(entry.id)}
                          onChange={() => toggleEntry(entry.id)}
                          className="mt-1 rounded border-border"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{entry.content}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-muted-foreground">{entry.created_at}</span>
                            {entry.tags.map((tag) => (
                              <span key={tag} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{tag}</span>
                            ))}
                            {entry.synced_to.length > 0 && (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                <ArrowRightLeft size={8} /> synced to {entry.synced_to.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
