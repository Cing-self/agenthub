
import { Settings, Sun, Moon, FileCode, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import { NavLink } from "react-router-dom";

export default function SettingsPage() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Settings size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">AgentHub preferences</p>
        </div>
      </div>

      {/* Appearance */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Appearance</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Theme</div>
              <div className="text-xs text-muted-foreground">Choose your preferred color scheme</div>
            </div>
          </div>
          <div className="flex gap-3">
            {[
              { id: "light" as const, icon: <Sun size={18} />, label: "Light" },
              { id: "dark" as const, icon: <Moon size={18} />, label: "Dark" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 px-6 py-4 transition-colors",
                  theme === opt.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                )}
              >
                <span className={cn("text-muted-foreground", theme === opt.id && "text-primary")}>{opt.icon}</span>
                <span className={cn("text-xs", theme === opt.id ? "font-medium text-primary" : "text-muted-foreground")}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tools</h2>
        <NavLink
          to="/raw"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors"
        >
          <FileCode size={18} className="text-muted-foreground" />
          <div className="flex-1">
            <div className="text-sm font-medium">Raw Config Editor</div>
            <div className="text-xs text-muted-foreground">Edit openclaw.json and hub.json directly</div>
          </div>
          <ChevronRight size={16} className="text-muted-foreground/40" />
        </NavLink>
      </section>

      {/* Agent Scanning */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Agent Scanning</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Auto-scan interval</div>
              <div className="text-xs text-muted-foreground">How often to check for running agents</div>
            </div>
            <span className="text-sm text-muted-foreground">15s</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">AgentHub data directory</div>
              <div className="text-xs text-muted-foreground font-mono">~/.agenthub/</div>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">About</h2>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Runtime</span>
            <span>Tauri 2 + React</span>
          </div>
        </div>
      </section>
    </div>
  );
}
