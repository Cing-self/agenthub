import { create } from "zustand";
import type { ModelProvider, Model, McpServer, HubMediaConfig } from "@/lib/types/hub";
import { compactHubMediaConfig, compactProviderConfig, normalizeHubConfigState } from "@/lib/hub/config-state.js";

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
  media: HubMediaConfig | null;
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  lastSaved: Date | null;

  loadHub: () => Promise<void>;

  addProvider: (provider: ModelProvider) => void;
  updateProvider: (id: string, updates: Partial<ModelProvider>) => void;
  removeProvider: (id: string) => void;
  updateMedia: (media: HubMediaConfig | null) => void;

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


export const useHubStore = create<HubState>((set, get) => ({
  providers: [],
  models: [],
  mcpServers: [],
  media: null,
  loading: true,
  dirty: false,
  saving: false,
  lastSaved: null,

  loadHub: async () => {
    set({ loading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const hub = await invoke<Record<string, unknown>>("read_hub_config");
      const { providers, models, mcpServers, media } = normalizeHubConfigState(hub);
      set({ providers, models, mcpServers, media, loading: false, dirty: false });
    } catch {
      set({ providers: [], models: [], mcpServers: [], media: null, loading: false, dirty: false });
    }
  },

  addProvider: (provider) => {
    set((s) => ({ providers: [...s.providers, compactProviderConfig(provider)], dirty: true }));
    scheduleAutoSave();
  },

  updateProvider: (id, updates) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? compactProviderConfig({ ...p, ...updates }) : p)),
      dirty: true,
    }));
    scheduleAutoSave();
  },

  removeProvider: (id) => {
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id), dirty: true }));
    scheduleAutoSave();
  },

  updateMedia: (media) => {
    set({ media: compactHubMediaConfig(media), dirty: true });
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
    const { providers, models, mcpServers, media } = get();
    set({ saving: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_hub_config_module", { module: "providers", data: providers.map(compactProviderConfig) });
      await invoke("write_hub_config_module", { module: "models", data: models });
      await invoke("write_hub_config_module", { module: "mcpServers", data: mcpServers });
      await invoke("write_hub_config_module", { module: "media", data: compactHubMediaConfig(media) });
      set({ dirty: false, saving: false, lastSaved: new Date() });
    } catch (err) {
      set({ saving: false });
      console.error("Failed to save hub config:", err);
      throw err;
    }
  },
}));
