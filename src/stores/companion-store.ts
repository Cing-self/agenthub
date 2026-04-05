import { create } from "zustand";

interface CompanionState {
  expanded: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCompanionStore = create<CompanionState>((set) => ({
  expanded: false,
  open: () => set({ expanded: true }),
  close: () => set({ expanded: false }),
  toggle: () => set((state) => ({ expanded: !state.expanded })),
}));
