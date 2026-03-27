import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Read from localStorage on init
  const saved = (typeof window !== "undefined" && localStorage.getItem("agenthub-theme")) as Theme | null;
  const initial: Theme = saved || "dark";

  // Apply immediately
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.classList.toggle("light", initial === "light");
  }

  return {
    theme: initial,
    toggleTheme: () =>
      set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(next);
        localStorage.setItem("agenthub-theme", next);
        return { theme: next };
      }),
    setTheme: (theme) =>
      set(() => {
        document.documentElement.classList.remove("dark", "light");
        document.documentElement.classList.add(theme);
        localStorage.setItem("agenthub-theme", theme);
        return { theme };
      }),
  };
});
