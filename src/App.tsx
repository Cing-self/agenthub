import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
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
import DashboardPage from "./pages/DashboardPage";

// Work pages
import ChatPage from "./pages/work/ChatPage";
import MessagesPage from "./pages/work/MessagesPage";
import TasksPage from "./pages/work/TasksPage";
import CronPage from "./pages/work/CronPage";

function App() {
  const { theme } = useThemeStore();
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute -top-[200px] -right-[100px] w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[120px]" />
          <div className="absolute top-[40%] -left-[150px] w-[400px] h-[400px] rounded-full bg-primary/[0.05] blur-[100px]" />
          <div className="absolute -bottom-[100px] right-[20%] w-[350px] h-[350px] rounded-full bg-primary/[0.04] blur-[80px]" />
        </div>

        <main className="flex-1 overflow-y-auto p-6 relative z-10">
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
              <Route path="/mcp" element={<McpServersPage />} />
              <Route path="/skills" element={<SkillsPage />} />
              <Route path="/secrets" element={<SecretsPage />} />
              <Route path="/tokens" element={<TokenMonitorPage />} />
              <Route path="/usage" element={<UsagePage />} />
              <Route path="/prompts" element={<PromptInspectorPage />} />
              <Route path="/memory" element={<MemoryPage />} />
              <Route path="/collab" element={<CollaborationPage />} />
              <Route path="/agent/:agentId/*" element={<AgentInstancePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account" element={<AccountPage />} />

              {/* Default: go to Work chat */}
              <Route path="/" element={<Navigate to="/work/chat" replace />} />
              <Route path="*" element={<Navigate to="/work/chat" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
        <StatusBar />
      </div>
      <Toaster theme={theme} position="bottom-right" />
    </div>
  );
}

export default App;
