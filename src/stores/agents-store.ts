import { create } from "zustand";
import type { DetectedAgent, HealthStatus } from "@/lib/types/agents";

interface AgentsState {
  agents: DetectedAgent[];
  totalRunning: number;
  totalDetected: number;
  loading: boolean;
  lastChecked: Date | null;
  selectedAgentId: string | null;

  setHealth: (health: HealthStatus) => void;
  setLoading: (loading: boolean) => void;
  selectAgent: (id: string | null) => void;
  refresh: () => Promise<void>;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  agents: [],
  totalRunning: 0,
  totalDetected: 0,
  loading: true,
  lastChecked: null,
  selectedAgentId: null,

  setHealth: (health) =>
    set({
      agents: health.agents,
      totalRunning: health.total_running,
      totalDetected: health.total_detected,
      lastChecked: new Date(),
      loading: false,
    }),

  setLoading: (loading) => set({ loading }),

  selectAgent: (id) => set({ selectedAgentId: id }),

  refresh: async () => {
    set({ loading: true });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const health = await invoke<HealthStatus>("detect_agents");
      set({
        agents: health.agents,
        totalRunning: health.total_running,
        totalDetected: health.total_detected,
        lastChecked: new Date(),
        loading: false,
      });
    } catch (err) {
      console.error("Failed to detect agents:", err);
      set({ loading: false });
    }
  },
}));
