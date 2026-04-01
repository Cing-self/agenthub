import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useModeStore } from "@/stores/mode-store";

function resolveSectionLabel(pathname: string) {
  if (pathname.startsWith("/work/chat")) return "对话";
  if (pathname.startsWith("/work/messages")) return "消息";
  if (pathname.startsWith("/work/tasks")) return "任务";
  if (pathname.startsWith("/work/cron")) return "定时";
  if (pathname.startsWith("/channels")) return "Channels";
  if (pathname.startsWith("/models")) return "Models";
  if (pathname.startsWith("/cli")) return "CLI";
  if (pathname.startsWith("/mcp")) return "MCP";
  if (pathname.startsWith("/skills")) return "Skills";
  if (pathname.startsWith("/memory")) return "Memory";
  if (pathname.startsWith("/collab")) return "Collaboration";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/remote-hosts")) return "Remote Hosts";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/account")) return "Account";
  return "Workspace";
}

export function WindowChrome() {
  const location = useLocation();
  const { currentBundle } = useCollaborationStore();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useModeStore();

  const sectionLabel = useMemo(() => resolveSectionLabel(location.pathname), [location.pathname]);
  const title = useMemo(() => {
    if (location.pathname.startsWith("/work/chat") && currentBundle?.thread.title) {
      return currentBundle.thread.title;
    }
    return sectionLabel;
  }, [currentBundle?.thread.title, location.pathname, sectionLabel]);

  const sidebarRailWidth = sidebarCollapsed ? 114 : 228;
  const chromeStyle = { "--sidebar-rail-width": `${sidebarRailWidth}px` } as CSSProperties;

  return (
    <header
      data-tauri-drag-region
      style={{ ...chromeStyle, WebkitAppRegion: "drag" } as CSSProperties}
      className="relative z-20 h-[52px] select-none text-foreground"
    >
      <div
        className="grid h-full"
        style={{
          gridTemplateColumns: `${sidebarRailWidth}px minmax(0, 1fr)`,
          transition: "grid-template-columns 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          data-tauri-drag-region
          className="relative flex h-full items-start pl-[86px] pt-[7px]"
          style={{ paddingRight: sidebarCollapsed ? "8px" : "12px" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ backgroundColor: "var(--window-sidebar)" }}
          />
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              opacity: sidebarCollapsed ? 1 : 0,
              backgroundColor: "var(--window-chrome)",
            }}
          />

          <div
            className="relative flex w-full"
            style={{ justifyContent: sidebarCollapsed ? "center" : "flex-end" }}
          >
          <button
            type="button"
            onClick={() => toggleSidebarCollapsed()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-foreground/[0.045] hover:text-foreground"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
          </div>
        </div>

        <div
          data-tauri-drag-region
          className="flex h-full items-center justify-center px-4 backdrop-blur-xl"
          style={{ backgroundColor: "var(--window-chrome)" }}
        >
          <div className="pointer-events-none text-[13px] font-medium tracking-[0.01em] text-foreground/80">{title}</div>
        </div>
      </div>
    </header>
  );
}
