import { useEffect, useState } from "react";
import {
  Lock, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight,
  X, Check, AlertCircle, Loader2, Copy, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Secret = a named reference to a sensitive value (API key, token, etc.)
// Stored in ~/.agenthub/hub.json under "secrets" module
// Agents reference secrets by name (SecretRef), never see raw values in configs

interface Secret {
  id: string;
  name: string;       // human-readable label, e.g. "GitHub Token"
  refKey: string;     // reference key used in configs, e.g. "GITHUB_TOKEN"
  value: string;      // the actual secret value
  description: string;
  createdAt: string;
}

// ── Inline Secret Store (extends hub store pattern) ──
// For simplicity, secrets are managed locally here and persisted via hub config
// In the future this would be a proper encrypted store

function useSecretsStore() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const hub = await invoke<Record<string, unknown>>("read_hub_config");
      if (Array.isArray(hub?.secrets)) {
        setSecrets(hub.secrets as Secret[]);
      }
    } catch {
      setSecrets([]);
    }
    setLoading(false);
  };

  const save = async (data: Secret[]) => {
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_hub_config_module", { module: "secrets", data });
      setDirty(false);
      setSaving(false);
      setLastSaved(new Date());
    } catch {
      setSaving(false);
    }
  };

  const add = (secret: Secret) => {
    const next = [...secrets, secret];
    setSecrets(next);
    setDirty(true);
    save(next);
  };

  const update = (id: string, updates: Partial<Secret>) => {
    const next = secrets.map((s) => (s.id === id ? { ...s, ...updates } : s));
    setSecrets(next);
    setDirty(true);
    save(next);
  };

  const remove = (id: string) => {
    const next = secrets.filter((s) => s.id !== id);
    setSecrets(next);
    setDirty(true);
    save(next);
  };

  return { secrets, loading, dirty, saving, lastSaved, load, add, update, remove };
}

// ── Add Secret Dialog ──
function AddSecretDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (s: Secret) => void }) {
  const [name, setName] = useState("");
  const [refKey, setRefKey] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");

  const handleNameChange = (v: string) => {
    setName(v);
    // Auto-generate refKey from name
    if (!refKey || refKey === name.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "")) {
      setRefKey(v.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, ""));
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !refKey.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(),
      refKey: refKey.trim(),
      value: value,
      description: desc.trim(),
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[440px] rounded-xl border border-border bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Add Secret</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Name</label>
            <input
              value={name} onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. GitHub Token"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Reference Key</label>
            <input
              value={refKey} onChange={(e) => setRefKey(e.target.value)}
              placeholder="GITHUB_TOKEN"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary/50"
            />
            <p className="text-[10px] text-muted-foreground/50">Agents reference this key in their configs</p>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Value</label>
            <input
              type="password"
              value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary/50"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Description (optional)</label>
            <input
              value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="What is this secret used for?"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !refKey.trim()}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors mt-2"
          >
            Add Secret
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Secret Row ──
function SecretRow({
  secret, expanded, onToggle, onUpdate, onRemove,
}: {
  secret: Secret; expanded: boolean;
  onToggle: () => void; onUpdate: (updates: Partial<Secret>) => void; onRemove: () => void;
}) {
  const [showValue, setShowValue] = useState(false);

  const maskValue = (v: string) => {
    if (!v) return "(empty)";
    if (v.length <= 8) return "*".repeat(v.length);
    return v.slice(0, 4) + "..." + v.slice(-4);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
          "hover:bg-accent/50",
          expanded && "bg-accent/30"
        )}
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={14} className="text-muted-foreground/50" /> : <ChevronRight size={14} className="text-muted-foreground/50" />}
        <div className="flex items-center justify-center h-7 w-7 rounded-md bg-amber-500/10 flex-shrink-0">
          <Lock size={14} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{secret.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded">{secret.refKey}</span>
          </div>
          {secret.description && (
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{secret.description}</p>
          )}
        </div>
        <span className="text-[11px] font-mono text-muted-foreground/40">{maskValue(secret.value)}</span>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/50 bg-card/50">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Name</label>
              <input
                value={secret.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Reference Key</label>
              <input
                value={secret.refKey}
                onChange={(e) => onUpdate({ refKey: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Value</label>
            <div className="flex items-center gap-2">
              <input
                type={showValue ? "text" : "password"}
                value={secret.value}
                onChange={(e) => onUpdate({ value: e.target.value })}
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono outline-none focus:border-primary/50"
              />
              <button
                onClick={() => setShowValue(!showValue)}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
                title={showValue ? "Hide" : "Show"}
              >
                {showValue ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(secret.value); toast.success("Copied"); }}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
                title="Copy value"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Description</label>
            <input
              value={secret.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Optional description"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground/40">
              Created {new Date(secret.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => { onRemove(); toast.success(`Removed ${secret.name}`); }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──
export default function SecretsPage() {
  const store = useSecretsStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { store.load(); }, []);

  if (store.loading) return <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-500/10">
            <Lock size={22} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Secrets</h1>
            <p className="text-sm text-muted-foreground">Manage API keys and tokens — referenced by agents via SecretRef</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {store.saving && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
            {!store.saving && store.dirty && <span className="flex items-center gap-1 text-yellow-400"><AlertCircle size={12} /> Unsaved</span>}
            {!store.saving && !store.dirty && store.lastSaved && <span className="flex items-center gap-1 text-emerald-400/60"><Check size={12} /> Saved</span>}
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Secret list */}
      {store.secrets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-amber-500/10">
              <Shield size={24} className="text-amber-500/60" />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground/80">No secrets configured</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Store API keys and tokens here. Agents reference them by key name, so you only update secrets in one place.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} /> Add Secret
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {store.secrets.map((secret) => (
            <SecretRow
              key={secret.id}
              secret={secret}
              expanded={expandedId === secret.id}
              onToggle={() => setExpandedId(expandedId === secret.id ? null : secret.id)}
              onUpdate={(updates) => store.update(secret.id, updates)}
              onRemove={() => store.remove(secret.id)}
            />
          ))}
        </div>
      )}

      {/* Info card */}
      <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Shield size={14} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground/70 space-y-1">
            <p>Secrets are stored locally in <code className="text-[10px] bg-muted/50 px-1 rounded">~/.agenthub/hub.json</code>. Agent configs use <strong className="text-foreground/70">SecretRef</strong> keys instead of raw values.</p>
            <p className="text-amber-500/70">Note: Values are stored in plaintext. For production use, consider integrating with a system keychain.</p>
          </div>
        </div>
      </div>

      {/* Add dialog */}
      {showAdd && (
        <AddSecretDialog
          onClose={() => setShowAdd(false)}
          onAdd={(s) => { store.add(s); toast.success(`Added ${s.name}`); }}
        />
      )}
    </div>
  );
}
