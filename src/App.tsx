import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { CompanionShell } from "./components/companion/CompanionShell";
import { Sidebar } from "./components/layout/Sidebar";
import { WindowChrome } from "./components/layout/WindowChrome";
import { useThemeStore } from "./stores/theme-store";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";

// Config pages
import ModelsPage from "./pages/ModelsPage";
import McpServersPage from "./pages/McpServersPage";
import SkillsPage from "./pages/SkillsPage";
import SecretsPage from "./pages/SecretsPage";
import TokenMonitorPage from "./pages/TokenMonitorPage";
import PromptInspectorPage from "./pages/PromptInspectorPage";
import MemoryPage from "./pages/MemoryPage";
import CollaborationPage from "./pages/CollaborationPage";
import UsagePage from "./pages/UsagePage";
import AgentInstancePage from "./pages/AgentInstancePage";
import SettingsPage from "./pages/SettingsPage";
import AccountPage from "./pages/AccountPage";
import RemoteHostsPage from "./pages/RemoteHostsPage";
import DashboardPage from "./pages/DashboardPage";
import CliPage from "./pages/CliPage";
import ChannelsPage from "./pages/ChannelsPage";

// Work pages
import ChatPage from "./pages/work/ChatPage";
import MessagesPage from "./pages/work/MessagesPage";
import TasksPage from "./pages/work/TasksPage";
import CronPage from "./pages/work/CronPage";
import type { CronJob } from "./lib/types/cron";

function App() {
  const { theme } = useThemeStore();
  const location = useLocation();
  const chatOwnsScroll = location.pathname === "/work/chat";

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const triggered = await invoke<CronJob[]>("poll_cron_jobs");
        if (!disposed && triggered.length > 0) {
          triggered.forEach((job) => {
            toast.success(`定时任务已触发：${job.title}`);
          });
        }
      } catch (error) {
        if (!disposed) {
          console.error("Failed to poll cron jobs:", error);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 30_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <WindowChrome />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden" style={{ backgroundColor: "var(--window-bg)" }}>
          {/* Background gradient orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            <div className="absolute -top-[200px] -right-[100px] w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[120px]" />
            <div className="absolute top-[40%] -left-[150px] w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-[100px]" />
            <div className="absolute -bottom-[100px] right-[20%] w-[350px] h-[350px] rounded-full bg-primary/[0.04] blur-[80px]" />
          </div>

          <main className={`flex-1 p-6 relative z-10 ${chatOwnsScroll ? "overflow-hidden" : "overflow-y-auto"}`}>
            <ErrorBoundary>
              <Routes>
                {/* Work mode */}
                <Route path="/work/chat" element={<ChatPage />} />
                <Route path="/work/messages" element={<MessagesPage />} />
                <Route path="/work/tasks" element={<TasksPage />} />
                <Route path="/work/cron" element={<CronPage />} />

                {/* Config mode */}
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/cli" element={<CliPage />} />
                <Route path="/channels" element={<ChannelsPage />} />
                <Route path="/mcp" element={<McpServersPage />} />
                <Route path="/skills" element={<SkillsPage />} />
                <Route path="/secrets" element={<SecretsPage />} />
                <Route path="/tokens" element={<TokenMonitorPage />} />
                <Route path="/usage" element={<UsagePage />} />
                <Route path="/prompts" element={<PromptInspectorPage />} />
                <Route path="/memory" element={<MemoryPage />} />
                <Route path="/collab" element={<CollaborationPage />} />
                <Route path="/agent/:agentId/*" element={<AgentInstancePage />} />
                <Route path="/remote-hosts" element={<RemoteHostsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/account" element={<AccountPage />} />

                {/* Default: go to Work chat */}
                <Route path="/" element={<Navigate to="/work/chat" replace />} />
                <Route path="*" element={<Navigate to="/work/chat" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <CompanionShell />
      <Toaster theme={theme} position="bottom-right" />
    </div>
  );
}

export default App;
