import { useEffect, useState } from "react";
import {
  Plug, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight,
  X, Check, AlertCircle, Box, Globe, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useHubStore } from "@/stores/hub-store";
import { PROVIDER_PRESETS, MODEL_PRESETS } from "@/lib/types/hub";
import type { ModelProvider, Model } from "@/lib/types/hub";
import { toast } from "sonner";

type Tab = "providers" | "models";

export default function ModelsPage() {
  const {
    providers, models, loading, dirty, saving, lastSaved,
    loadHub, addProvider, updateProvider, removeProvider,
    addModel, removeModel, toggleModel, saveHub,
  } = useHubStore();

  const [tab, setTab] = useState<Tab>("providers");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddModel, setShowAddModel] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => { loadHub(); }, [loadHub]);

  const syncDolphinModels = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("sync_custom_agent_resources", {
        id: "dolphin",
        includeModels: true,
        includeMcpServers: false,
        includeSkills: false,
      });
      const { useAgentsStore } = await import("@/stores/agents-store");
      await useAgentsStore.getState().refresh();
      toast.success("已把启用中的 Models 同步到 dolphin");
    } catch (error) {
      toast.error(`同步到 dolphin 失败: ${error}`);
    }
  };

  const handleAddPresetProvider = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset || providers.some((p) => p.id === preset.id)) return;
    addProvider({ ...preset, apiKey: "" });
    setShowAddProvider(false);
    setExpandedId(preset.id);
    toast.success(`Added ${preset.name}`);
  };

  const handleAddPresetModels = (vendorModels: typeof MODEL_PRESETS) => {
    let count = 0;
    vendorModels.forEach((preset) => {
      if (!models.some((m) => m.id === preset.id)) {
        addModel({ ...preset, enabled: true });
        count++;
      }
    });
    setShowAddModel(false);
    if (count > 0) toast.success(`Added ${count} models`);
    else toast.info("All models already added");
  };

  const filteredPresets = PROVIDER_PRESETS.filter(
    (p) => !providers.some((ep) => ep.id === p.id) &&
      (!searchFilter || p.name.toLowerCase().includes(searchFilter.toLowerCase()) || p.endpoints.some((e) => e.baseUrl.toLowerCase().includes(searchFilter.toLowerCase())))
  );

  // Group models by vendor
  const vendorGroups = new Map<string, typeof MODEL_PRESETS>();
  MODEL_PRESETS.forEach((m) => {
    const existing = vendorGroups.get(m.vendor) || [];
    existing.push(m);
    vendorGroups.set(m.vendor, existing);
  });

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <Plug size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Models</h1>
            <p className="text-sm text-muted-foreground">Providers and models — shared across all agents</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              void syncDolphinModels();
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            同步到 dolphin
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving...</span>}
          {!saving && dirty && <span className="flex items-center gap-1 text-yellow-400"><AlertCircle size={12} /> Unsaved</span>}
          {!saving && !dirty && lastSaved && <span className="flex items-center gap-1 text-emerald-400/60"><Check size={12} /> Saved</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button onClick={() => setTab("providers")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-[1px] transition-colors", tab === "providers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Globe size={14} /> Providers ({providers.length})
        </button>
        <button onClick={() => setTab("models")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-[1px] transition-colors", tab === "models" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
          <Box size={14} /> Models ({models.length})
        </button>
        <div className="ml-auto">
          {tab === "providers" && (
            <button onClick={() => setShowAddProvider(true)} className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs hover:bg-accent transition-colors">
              <Plus size={12} /> Add
            </button>
          )}
          {tab === "models" && (
            <button onClick={() => setShowAddModel(true)} className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs hover:bg-accent transition-colors">
              <Plus size={12} /> Add
            </button>
          )}
        </div>
      </div>

      {/* ── Providers Tab ── */}
      {tab === "providers" && (
        <div className="space-y-3">

          {providers.length === 0 ? (
            <Empty icon={<Globe size={28} />} text="No providers configured" sub="Add a provider to connect to model APIs" />
          ) : (
            providers.map((p) => (
              <ProviderCard
                key={p.id} provider={p}
                expanded={expandedId === p.id}
                showKey={showKeyMap[p.id] || false}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onToggleKey={() => setShowKeyMap((m) => ({ ...m, [p.id]: !m[p.id] }))}
                onUpdate={(u) => updateProvider(p.id, u)}
                onRemove={() => { removeProvider(p.id); toast.success(`Removed ${p.name}`); }}
                modelCount={models.filter((m) => m.providerIds.includes(p.id)).length}
                onFetchModels={async () => {
                  try {
                    // Save first so Rust can read the latest hub.json
                    await saveHub();
                    const { invoke } = await import("@tauri-apps/api/core");
                    const result = await invoke<{ provider_id: string; models: { id: string; owned_by: string | null }[]; error: string | null }>("fetch_provider_models", { providerId: p.id });
                    if (result.error) { toast.error(result.error); return; }
                    let added = 0;
                    result.models.forEach((m) => {
                      if (!models.some((em) => em.id === m.id)) {
                        addModel({ id: m.id, name: m.id, vendor: p.name, providerIds: [p.id], enabled: true, capabilities: ["text"] });
                        added++;
                      } else {
                        // Add this provider to existing model if not already there
                        const existing = models.find((em) => em.id === m.id);
                        if (existing && !existing.providerIds.includes(p.id)) {
                          const { updateModel } = useHubStore.getState();
                          updateModel(m.id, { providerIds: [...existing.providerIds, p.id] });
                        }
                      }
                    });
                    toast.success(`Found ${result.models.length} models, added ${added} new`);
                  } catch (e) { toast.error(`Failed: ${e}`); }
                }}
              />
            ))
          )}

          {/* Add Provider Dialog */}
          {showAddProvider && (
            <Dialog title="Add Provider" onClose={() => { setShowAddProvider(false); setSearchFilter(""); }}>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search providers..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm mb-4 placeholder:text-muted-foreground/40"
                autoFocus
              />
              <div className="space-y-2">
                {filteredPresets.map((p) => {
                  const domain = p.endpoints[0]?.baseUrl?.replace(/^https?:\/\//, "").split("/")[0] || "";
                  const apiTypes = [...new Set(p.endpoints.map((e) => e.apiType))];
                  return (
                    <button key={p.id} onClick={() => handleAddPresetProvider(p.id)} className="w-full flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-accent transition-colors text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{p.name}</span>
                          {p.region && (
                            <span className={cn(
                              "text-[8px] px-1 py-0.5 rounded font-semibold",
                              p.region === "cn" ? "bg-red-500/10 text-red-400" : "bg-sky-500/10 text-sky-400"
                            )}>
                              {p.region === "cn" ? "CN" : "Global"}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {domain}
                          {p.endpoints.length > 1 && ` · ${p.endpoints.length} endpoints`}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {apiTypes.map((t) => (
                          <span key={t} className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded",
                            t === "anthropic" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                          )}>{t}</span>
                        ))}
                      </div>
                    </button>
                  );
                })}
                {filteredPresets.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-4">No matching providers</div>
                )}
              </div>
            </Dialog>
          )}
        </div>
      )}

      {/* ── Models Tab ── */}
      {tab === "models" && (
        <div className="space-y-3">
          {models.length === 0 ? (
            <Empty icon={<Box size={28} />} text="No models configured" sub="Add models and map them to providers" />
          ) : (
            <ModelsListWithFilters models={models} providers={providers} toggleModel={toggleModel} removeModel={removeModel} />
          )}

          {/* Add Models Dialog */}
          {showAddModel && (
            <Dialog title="Add Models" onClose={() => setShowAddModel(false)}>
              <p className="text-xs text-muted-foreground mb-3">Select a vendor to add all its models at once.</p>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {Array.from(vendorGroups.entries()).map(([vendor, vendorModels]) => {
                  const alreadyAdded = vendorModels.filter((m) => models.some((em) => em.id === m.id)).length;
                  return (
                    <button key={vendor} onClick={() => handleAddPresetModels(vendorModels)} className="w-full flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent transition-colors text-left">
                      <div>
                        <div className="text-sm font-medium">{vendor}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {vendorModels.map((m) => m.name).join(", ")}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{alreadyAdded}/{vendorModels.length} added</span>
                    </button>
                  );
                })}
              </div>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}

// ── Models list with vendor & capability filters ──

function ModelsListWithFilters({ models, providers, toggleModel, removeModel }: {
  models: Model[]; providers: ModelProvider[];
  toggleModel: (id: string) => void; removeModel: (id: string) => void;
}) {
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [capFilter, setCapFilter] = useState<string>("all");

  // Collect unique vendors and capabilities
  const vendors = [...new Set(models.map((m) => m.vendor))].sort();
  const capabilities = [...new Set(models.flatMap((m) => m.capabilities || []))].sort();

  const filtered = models.filter((m) => {
    if (vendorFilter !== "all" && m.vendor !== vendorFilter) return false;
    if (capFilter !== "all" && !(m.capabilities || []).includes(capFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-4">
        {/* Vendor filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-0.5">Vendor</span>
          <button onClick={() => setVendorFilter("all")} className={cn("text-[11px] px-2 py-0.5 rounded-full transition-colors", vendorFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>All</button>
          {vendors.map((v) => (
            <button key={v} onClick={() => setVendorFilter(vendorFilter === v ? "all" : v)} className={cn("text-[11px] px-2 py-0.5 rounded-full transition-colors", vendorFilter === v ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
              {v}
            </button>
          ))}
        </div>
        {/* Capability filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mr-0.5">Capability</span>
          <button onClick={() => setCapFilter("all")} className={cn("text-[11px] px-2 py-0.5 rounded-full transition-colors", capFilter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>All</button>
          {capabilities.map((c) => (
            <button key={c} onClick={() => setCapFilter(capFilter === c ? "all" : c)} className={cn("text-[11px] px-2 py-0.5 rounded-full transition-colors", capFilter === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Filtered count */}
      {(vendorFilter !== "all" || capFilter !== "all") && (
        <div className="text-[11px] text-muted-foreground">
          {filtered.length} of {models.length} models
        </div>
      )}

      {/* Model list */}
      {filtered.map((m) => {
        const availableProviders = providers.filter((p) => m.providerIds.includes(p.id));
        return (
          <div key={m.id} className={cn("rounded-lg border bg-card p-3 flex items-center gap-3 transition-colors", m.enabled ? "border-border" : "border-border opacity-50")}>
            <button onClick={() => toggleModel(m.id)} className={cn("h-4 w-4 rounded border flex items-center justify-center transition-colors flex-shrink-0", m.enabled ? "bg-primary border-primary" : "border-input")}>
              {m.enabled && <Check size={10} className="text-primary-foreground" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-[10px] text-muted-foreground">{m.vendor}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-mono text-muted-foreground/60">{m.id}</span>
                {m.capabilities?.map((c) => (
                  <span key={c} className="text-[9px] bg-secondary px-1 py-0.5 rounded text-muted-foreground">{c}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {availableProviders.length > 0 ? (
                availableProviders.map((p) => (
                  <span key={p.id} className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded" title={p.name}>
                    {p.name}{p.region ? (p.region === "cn" ? " CN" : " Global") : ""}
                  </span>
                ))
              ) : (
                <span className="text-[9px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded">No provider</span>
              )}
            </div>
            <button onClick={() => removeModel(m.id)} className="text-muted-foreground hover:text-red-400 transition-colors p-1 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        );
      })}

      {filtered.length === 0 && models.length > 0 && (
        <div className="text-center text-sm text-muted-foreground py-4">No models match the current filters</div>
      )}
    </div>
  );
}

// ── Sub-components ──

function ProviderCard({ provider, expanded, showKey, onToggle, onToggleKey, onUpdate, onRemove, modelCount, onFetchModels }: {
  provider: ModelProvider; expanded: boolean; showKey: boolean; modelCount: number;
  onToggle: () => void; onToggleKey: () => void; onUpdate: (u: Partial<ModelProvider>) => void; onRemove: () => void;
  onFetchModels: () => void;
}) {
  const hasKey = provider.apiKey.length > 0;
  const endpoints = provider.endpoints || [];
  const primaryDomain = endpoints[0]?.baseUrl?.replace(/^https?:\/\//, "").split("/")[0] || "";
  const apiTypes = [...new Set(endpoints.map((e) => e.apiType))];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
        {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{provider.name}</span>
            {provider.region && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-medium",
                provider.region === "cn" ? "bg-red-500/10 text-red-400" : "bg-sky-500/10 text-sky-400"
              )}>
                {provider.region === "cn" ? "CN" : "Global"}
              </span>
            )}
            <span className={cn("h-1.5 w-1.5 rounded-full", hasKey ? "bg-emerald-400" : "bg-yellow-400")} />
            {apiTypes.map((t) => (
              <span key={t} className="text-[10px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground/50 mt-0.5">
            {primaryDomain}{endpoints.length > 1 ? ` (+${endpoints.length - 1} endpoint${endpoints.length > 2 ? "s" : ""})` : ""}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{modelCount} models</span>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-muted-foreground hover:text-red-400 p-1"><Trash2 size={13} /></button>
      </button>
      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          <Field label="Name"><input type="text" value={provider.name} onChange={(e) => onUpdate({ name: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" /></Field>
          <Field label="API Key">
            <div className="flex gap-2">
              <input type={showKey ? "text" : "password"} value={provider.apiKey} onChange={(e) => onUpdate({ apiKey: e.target.value })} placeholder="sk-..." className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono" />
              <button onClick={onToggleKey} className="rounded-md border border-input px-2 hover:bg-accent">{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
            </div>
          </Field>

          {/* Endpoints list */}
          <Field label={`Endpoints (${endpoints.length})`}>
            <div className="space-y-2">
              {endpoints.map((ep, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2.5 bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono text-foreground truncate">{ep.baseUrl}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-medium",
                        ep.apiType === "anthropic" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                      )}>
                        {ep.apiType}
                      </span>
                      {ep.label && <span className="text-[10px] text-muted-foreground">{ep.label}</span>}
                    </div>
                  </div>
                  {endpoints.length > 1 && (
                    <button
                      onClick={() => {
                        const newEndpoints = endpoints.filter((_, j) => j !== i);
                        onUpdate({ endpoints: newEndpoints });
                      }}
                      className="text-muted-foreground/40 hover:text-red-400 transition-colors p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
              {/* Add endpoint button */}
              <button
                onClick={() => {
                  onUpdate({
                    endpoints: [...endpoints, { baseUrl: "https://", apiType: "openai", label: "" }],
                  });
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={12} /> Add endpoint
              </button>
            </div>
          </Field>

          {hasKey && (
            <button
              onClick={onFetchModels}
              className="flex items-center gap-2 rounded-md bg-primary/10 text-primary px-3 py-2 text-sm hover:bg-primary/20 transition-colors w-full justify-center font-medium"
            >
              <Globe size={14} />
              Fetch Available Models
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
      <div className="mx-auto mb-3 opacity-30">{icon}</div>
      <p>{text}</p>
      <p className="text-sm mt-1">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-muted-foreground mb-1 block">{label}</label>{children}</div>;
}
