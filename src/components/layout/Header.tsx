import { Activity, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgentsStore } from "@/stores/agents-store";
import { useThemeStore } from "@/stores/theme-store";

export function Header() {
  const { totalRunning, totalDetected, loading } = useAgentsStore();
  const { theme, toggleTheme } = useThemeStore();

  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="text-xs text-muted-foreground" />
      <div className="flex items-center gap-2">
        {/* Agent status */}
        <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
          <Activity
            size={14}
            className={cn(
              loading
                ? "text-yellow-500"
                : totalRunning > 0
                ? "text-emerald-500"
                : "text-red-400"
            )}
          />
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              loading
                ? "bg-yellow-500 animate-pulse"
                : totalRunning > 0
                ? "bg-emerald-500"
                : "bg-red-400"
            )}
          />
          <span
            className={cn(
              "text-xs font-medium",
              loading
                ? "text-yellow-500"
                : totalRunning > 0
                ? "text-emerald-500"
                : "text-muted-foreground"
            )}
          >
            {loading
              ? "Scanning..."
              : `${totalRunning} running / ${totalDetected} detected`}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center h-8 w-8 rounded-full bg-secondary hover:bg-accent transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun size={15} className="text-muted-foreground" />
          ) : (
            <Moon size={15} className="text-muted-foreground" />
          )}
        </button>
      </div>
    </header>
  );
}
