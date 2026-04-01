import { create } from "zustand";

type AppMode = "config" | "work";

interface ModeState {
  mode: AppMode;
  sidebarCollapsed: boolean;
  setMode: (mode: AppMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: "work",
  sidebarCollapsed: false,
  setMode: (mode) => set({ mode }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
