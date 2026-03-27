import { create } from "zustand";
import type { ModelProvider, Model, McpServer } from "@/lib/types/hub";

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY = 1500; // ms

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const { dirty, saveHub } = useHubStore.getState();
    if (dirty) {
      try {
        await saveHub();
      } catch {
        // silent fail — user can retry manually
      }
    }
  }, AUTO_SAVE_DELAY);
}

interface HubState {
  providers: ModelProvider[];
  models: Model[];
  mcpServers: McpServer[];
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  lastSaved: Date | null;

  loadHub: () => Promise<void>;

  addProvider: (provider: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;

  addModel: (model: Model) => void;
  updateModel: (id: string, updates: Partial<Model>) => void;
  removeModel: (id: string) => void;
  toggleModel: (id: string) => void;

  addMcpServer: (server: McpServer) => void;
  updateMcpServer: (id: string, updates: Partial<McpServer>) => void;
  removeMcpServer: (id: string) => void;
  toggleMcpServer: (id: string) => void;

  saveHub: () => Promise<void>;
}

function markDirty(set: (fn: (s: HubState) => Partial<HubState>) => void) {
  return (updater: (s: HubState) => Partial<HubState>) => {
    set((s) => ({ ...updater(s), dirty: true }));
    scheduleAutoSave();
  };
}

export const useHubStore = create<HubState>((set, get) => ({
  providers: [],
  models: [],
  mcpServers: [],
  loading: true,
  dirty: false,
  saving: false,
  lastSaved: null,

  loadHub: async () => {
    set({ loading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const hub = await invoke<Record<string, unknown>>("read_hub_config");
      let providers: ModelProvider[] = [];
      let models: Model[] = [];

      const rawProviders = Array.isArray(hub?.providers)
        ? (hub.providers as Record<string, unknown>[])
        : hub?.models && typeof hub.models === "object" && !Array.isArray(hub.models)
          ? ((hub.models as Record<string, unknown>).providers as Record<string, unknown>[]) || []
          : [];

      providers = rawProviders.map((p) => {
        if (Array.isArray(p.endpoints)) {
          return p as unknown as ModelProvider;
        }
        return {
          id: p.id as string,
          name: p.name as string,
          apiKey: (p.apiKey as string) || "",
          endpoints: [{
            baseUrl: (p.baseUrl as string) || "",
            apiType: (p.apiType as "openai" | "anthropic") || "openai",
          }],
        } as ModelProvider;
      });

      if (Array.isArray(hub?.models)) {
        models = hub.models as Model[];
      }

      let mcpServers: McpServer[] = [];
      if (Array.isArray(hub?.mcpServers)) {
        mcpServers = hub.mcpServers as McpServer[];
      }

      set({ providers, models, mcpServers, loading: false, dirty: false });
    } catch {
      set({ providers: [], models: [], mcpServers: [], loading: false, dirty: false });
    }
  },

  addProvider: (provider) => {
    set((s) => ({ providers: [...s.providers, provider], dirty: true }));
    scheduleAutoSave();
  },

  updateProvider: (id, updates) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  removeProvider: (id) => {
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id), dirty: true }));
    scheduleAutoSave();
  },

  addModel: (model) => {
    set((s) => ({ models: [...s.models, model], dirty: true }));
    scheduleAutoSave();
  },

  updateModel: (id, updates) => {
    set((s) => ({
      models: s.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  removeModel: (id) => {
    set((s) => ({ models: s.models.filter((m) => m.id !== id), dirty: true }));
    scheduleAutoSave();
  },

  toggleModel: (id) => {
    set((s) => ({
      models: s.models.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  addMcpServer: (server) => {
    set((s) => ({ mcpServers: [...s.mcpServers, server], dirty: true }));
    scheduleAutoSave();
  },

  updateMcpServer: (id, updates) => {
    set((s) => ({
      mcpServers: s.mcpServers.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  removeMcpServer: (id) => {
    set((s) => ({ mcpServers: s.mcpServers.filter((m) => m.id !== id), dirty: true }));
    scheduleAutoSave();
  },

  toggleMcpServer: (id) => {
    set((s) => ({
      mcpServers: s.mcpServers.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  saveHub: async () => {
    const { providers, models, mcpServers } = get();
    set({ saving: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_hub_config_module", { module: "providers", data: providers });
      await invoke("write_hub_config_module", { module: "models", data: models });
      await invoke("write_hub_config_module", { module: "mcpServers", data: mcpServers });
      set({ dirty: false, saving: false, lastSaved: new Date() });
    } catch (err) {
      set({ saving: false });
      console.error("Failed to save hub config:", err);
      throw err;
    }
  },
}));
