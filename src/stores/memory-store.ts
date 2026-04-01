import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type {
  CapabilityProfile,
  MemoryDashboard,
  MemoryItem,
  MemoryConnectionState,
  MemoryProviderConfig,
} from "@/lib/types/memory";

async function invokeMemory<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}

interface MemoryStoreState {
  items: MemoryItem[];
  profiles: CapabilityProfile[];
  externalSources: MemoryDashboard["external_sources"];
  connection: MemoryConnectionState;
  loading: boolean;
  saving: boolean;

  loadDashboard: () => Promise<void>;
  upsertItem: (item: MemoryItem) => Promise<MemoryItem>;
  deleteItem: (id: string) => Promise<void>;
  saveConfig: (config: MemoryProviderConfig) => Promise<void>;
}

const defaultConnection: MemoryConnectionState = {
  provider: "memos",
  provider_label: "Memos",
  configured: false,
  connected: false,
  current_user: null,
  last_error: null,
  config: {
    provider: "memos",
    enabled: false,
    base_url: "",
    access_token: null,
  },
};

export const useMemoryStore = create<MemoryStoreState>((set, get) => ({
  items: [],
  profiles: [],
  externalSources: [],
  connection: defaultConnection,
  loading: true,
  saving: false,

  loadDashboard: async () => {
    set({ loading: true });
    try {
      const dashboard = await invokeMemory<MemoryDashboard>("get_memory_dashboard");
      set({
        items: dashboard.items,
        profiles: dashboard.profiles,
        externalSources: dashboard.external_sources,
        connection: dashboard.connection,
        loading: false,
      });
    } catch (error) {
      console.error("Failed to load memory dashboard:", error);
      set({ loading: false });
    }
  },

  upsertItem: async (item) => {
    set({ saving: true });
    try {
      const saved = await invokeMemory<MemoryItem>("upsert_memory_item", { item });
      set((state) => ({
        items: state.items.some((entry) => entry.id === saved.id)
          ? state.items.map((entry) => (entry.id === saved.id ? saved : entry))
          : [saved, ...state.items],
        saving: false,
      }));
      return saved;
    } catch (error) {
      console.error("Failed to save memory item:", error);
      set({ saving: false });
      throw error;
    }
  },

  deleteItem: async (id) => {
    set({ saving: true });
    try {
      await invokeMemory("delete_memory_item", { id });
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        saving: false,
      }));
    } catch (error) {
      console.error("Failed to delete memory item:", error);
      set({ saving: false });
      throw error;
    }
  },

  saveConfig: async (config) => {
    set({ saving: true });
    try {
      await invoke("write_hub_config_module", {
        module: "memory",
        data: {
          provider: config.provider,
          enabled: config.enabled,
          base_url: config.base_url.trim(),
          access_token: config.access_token?.trim() || null,
        },
      });
      await get().loadDashboard();
      set({ saving: false });
    } catch (error) {
      console.error("Failed to save memory provider config:", error);
      set({ saving: false });
      throw error;
    }
  },
}));
