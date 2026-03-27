import { create } from "zustand";

type AppMode = "config" | "work";

interface ModeState {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: "work",
  setMode: (mode) => set({ mode }),
}));
