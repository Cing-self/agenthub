import { useEffect, useState } from "react";
import {
  Wrench, Plus, Trash2, ChevronDown, ChevronRight,
  X, Check, AlertCircle, Loader2, Power, PowerOff,
  Terminal, FileCode, Copy, Search, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubStore } from "@/stores/hub-store";
import type { McpServer } from "@/lib/types/hub";
import { toast } from "sonner";

// ── Common MCP server presets ──
const MCP_PRESETS: Omit<McpServer, "enabled">[] = [
  {
    id: "filesystem", name: "Filesystem",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    env: {}, description: "Read/write files on disk",
  },
  {
    id: "brave-search", name: "Brave Search",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" }, description: "Web search via Brave Search API",
  },
  {
    id: "github", name: "GitHub",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" }, description: "GitHub repos, issues, PRs",
  },
  {
    id: "postgres", name: "PostgreSQL",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
    env: {}, description: "Query PostgreSQL databases",
  },
  {
    id: "sqlite", name: "SQLite",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite", "~/data.db"],
    env: {}, description: "Query SQLite databases",
  },
  {
    id: "puppeteer", name: "Puppeteer",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    env: {}, description: "Browser automation & scraping",
  },
  {
    id: "memory", name: "Memory",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"],
    env: {}, description: "Persistent memory for conversations",
  },
  {
    id: "fetch", name: "Fetch",
    command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"],
    env: {}, description: "Fetch web pages and APIs",
  },
];

// ── Inline Edit Field ──
function EditableField({
  label, value, onChange, mono, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition-colors",
          "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
          mono && "font-mono text-xs"
        )}
      />
    </div>
  );
}

// ── Env Editor ──
function EnvEditor({ env, onChange }: { env: Record<string, string>; onChange: (env: Record<string, string>) => void }) {
  const entries = Object.entries(env);
  const [newKey, setNewKey] = useState("");

  const handleAdd = () => {
    if (!newKey.trim()) return;
    onChange({ ...env, [newKey.trim()]: "" });
    setNewKey("");
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Environment Variables</label>
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground/50 italic">No environment variables</p>
      )}
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground min-w-[120px] shrink-0">{key}</span>
          <input
            value={val}
            onChange={(e) => onChange({ ...env, [key]: e.target.value })}
            placeholder="value"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:border-primary/50"
          />
          <button
            onClick={() => {
              const next = { ...env };
              delete next[key];
              onChange(next);
            }}
            className="text-muted-foreground/40 hover:text-destructive transition-colors"
            title="Remove"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="NEW_VAR_NAME"
          className="flex-1 rounded-md border border-dashed border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:border-primary/50"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="text-xs text-primary hover:text-primary/80 disabled:opacity-30 transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ── Server Card (Expanded) ──
function ServerDetail({ server }: { server: McpServer }) {
  const { updateMcpServer, removeMcpServer } = useHubStore();

  const handleCopyJson = () => {
    const json = JSON.stringify({
      [server.id]: {
        command: server.command,
        args: server.args,
        ...(Object.keys(server.env).length > 0 ? { env: server.env } : {}),
      }
    }, null, 2);
    navigator.clipboard.writeText(json);
    toast.success("Copied MCP config JSON");
  };

  return (
    <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/50 bg-card/50">
      <div className="grid grid-cols-2 gap-4">
        <EditableField
          label="Name"
          value={server.name}
          onChange={(v) => updateMcpServer(server.id, { name: v })}
        />
        <EditableField
          label="Description"
          value={server.description}
          onChange={(v) => updateMcpServer(server.id, { description: v })}
          placeholder="What does this server do?"
        />
      </div>

      <EditableField
        label="Command"
        value={server.command}
        onChange={(v) => updateMcpServer(server.id, { command: v })}
        mono
        placeholder="npx, node, python, uvx..."
      />

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Arguments</label>
        <input
          value={server.args.join(" ")}
          onChange={(e) => updateMcpServer(server.id, { args: e.target.value.split(/\s+/).filter(Boolean) })}
          placeholder="-y @modelcontextprotocol/server-xxx"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        />
        <p className="text-[10px] text-muted-foreground/50">Space-separated arguments</p>
      </div>

      <EnvEditor
        env={server.env}
        onChange={(env) => updateMcpServer(server.id, { env })}
      />

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleCopyJson}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <Copy size={12} /> Copy JSON
        </button>
        <div className="flex-1" />
        <button
          onClick={() => {
            removeMcpServer(server.id);
            toast.success(`Removed ${server.name}`);
          }}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  );
}

// ── Add Server Dialog ──
function AddServerDialog({ onClose }: { onClose: () => void }) {
  const { mcpServers, addMcpServer } = useHubStore();
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCommand, setCustomCommand] = useState("");
  const [customArgs, setCustomArgs] = useState("");

  const filteredPresets = MCP_PRESETS.filter(
    (p) => !mcpServers.some((s) => s.id === p.id) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAddPreset = (preset: typeof MCP_PRESETS[0]) => {
    addMcpServer({ ...preset, enabled: true });
    toast.success(`Added ${preset.name}`);
    onClose();
  };

  const handleAddCustom = () => {
    if (!customName.trim() || !customCommand.trim()) return;
    const id = customName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (mcpServers.some((s) => s.id === id)) {
      toast.error("Server ID already exists");
      return;
    }
    addMcpServer({
      id,
      name: customName.trim(),
      command: customCommand.trim(),
      args: customArgs.split(/\s+/).filter(Boolean),
      env: {},
      description: "",
      enabled: true,
    });
    toast.success(`Added ${customName.trim()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[480px] max-h-[70vh] rounded-xl border border-border bg-popover shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Add MCP Server</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Toggle: Preset / Custom */}
        <div className="flex items-center gap-1 px-4 pt-3">
          <button
            onClick={() => setCustomMode(false)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs transition-colors",
              !customMode ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            From Presets
          </button>
          <button
            onClick={() => setCustomMode(true)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs transition-colors",
              customMode ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Custom
          </button>
        </div>

        {!customMode ? (
          <>
            <div className="px-4 pt-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search presets..."
                  className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:border-primary/50"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              {filteredPresets.length === 0 && (
                <p className="text-sm text-muted-foreground/50 text-center py-4">
                  {search ? "No matching presets" : "All presets already added"}
                </p>
              )}
              {filteredPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleAddPreset(preset)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-accent transition-colors group"
                >
                  <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary flex-shrink-0">
                    <Terminal size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{preset.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{preset.description}</div>
                  </div>
                  <span className="text-xs text-muted-foreground/40 font-mono">{preset.command}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="px-4 py-4 space-y-3">
            <EditableField label="Name" value={customName} onChange={setCustomName} placeholder="My Server" />
            <EditableField label="Command" value={customCommand} onChange={setCustomCommand} mono placeholder="npx, node, python..." />
            <EditableField label="Arguments" value={customArgs} onChange={setCustomArgs} mono placeholder="-y @scope/package" />
            <button
              onClick={handleAddCustom}
              disabled={!customName.trim() || !customCommand.trim()}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              Add Server
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──
export default function McpServersPage() {
  const {
    mcpServers, loading, dirty, saving, lastSaved,
    loadHub,
  } = useHubStore();
  const toggleMcpServer = useHubStore((s) => s.toggleMcpServer);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { loadHub(); }, [loadHub]);

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Wrench size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">MCP Servers</h1>
            <p className="text-sm text-muted-foreground">Global MCP server pool — shared across all agents</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
            {!saving && dirty && <span className="flex items-center gap-1 text-yellow-400"><AlertCircle size={12} /> Unsaved</span>}
            {!saving && !dirty && lastSaved && <span className="flex items-center gap-1 text-emerald-400/60"><Check size={12} /> Saved</span>}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Server list */}
      {mcpServers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10">
              <Terminal size={24} className="text-primary/60" />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground/80">No MCP servers configured</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add servers from presets or configure custom ones. Agents can reference these servers to extend their capabilities.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} /> Add MCP Server
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {mcpServers.map((server) => {
            const isExpanded = expandedId === server.id;
            return (
              <div key={server.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                    "hover:bg-accent/50",
                    isExpanded && "bg-accent/30"
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : server.id)}
                >
                  {isExpanded ? <ChevronDown size={14} className="text-muted-foreground/50" /> : <ChevronRight size={14} className="text-muted-foreground/50" />}
                  <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 flex-shrink-0">
                    <Terminal size={14} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{server.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">{server.command}</span>
                    </div>
                    {server.description && (
                      <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{server.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.keys(server.env).length > 0 && (
                      <span className="text-[10px] text-muted-foreground/40" title={`${Object.keys(server.env).length} env vars`}>
                        <Settings2 size={12} />
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMcpServer(server.id);
                      }}
                      className={cn(
                        "flex items-center justify-center h-6 w-6 rounded-md transition-colors",
                        server.enabled
                          ? "text-emerald-400 hover:bg-emerald-400/10"
                          : "text-muted-foreground/30 hover:bg-accent"
                      )}
                      title={server.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                    >
                      {server.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                  </div>
                </div>
                {isExpanded && <ServerDetail server={server} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Info card */}
      <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <FileCode size={14} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground/70 space-y-1">
            <p>MCP servers registered here form a <strong className="text-foreground/70">shared resource pool</strong>. Each agent can select which servers to use from this pool.</p>
            <p>Config saved to <code className="text-[10px] bg-muted/50 px-1 rounded">~/.agenthub/hub.json</code></p>
          </div>
        </div>
      </div>

      {/* Add dialog */}
      {showAdd && <AddServerDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}
