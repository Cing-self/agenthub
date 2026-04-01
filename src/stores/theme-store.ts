import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const WINDOW_COLORS: Record<Theme, string> = {
  light: "#f6f3ee",
  dark: "#0f0f0f",
};

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(theme);
  }

  if (typeof window !== "undefined") {
    localStorage.setItem("agenthub-theme", theme);

    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        void win.setTheme(theme).catch(() => undefined);
        void win.setBackgroundColor(WINDOW_COLORS[theme]).catch(() => undefined);
      })
      .catch(() => undefined);
  }
}

export const useThemeStore = create<ThemeState>((set) => {
  // Read from localStorage on init
  const saved = (typeof window !== "undefined" && localStorage.getItem("agenthub-theme")) as Theme | null;
  const initial: Theme = saved || "dark";

  applyTheme(initial);

  return {
    theme: initial,
    toggleTheme: () =>
      set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        return { theme: next };
      }),
    setTheme: (theme) =>
      set(() => {
        applyTheme(theme);
        return { theme };
      }),
  };
});
