import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MonitorUp, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CatAvatar,
  MetricPill,
  STATUS_META,
  StatusIcon,
  formatFriendlyStatus,
  platformShortcutLabel,
  resolveCompanionSnapshot,
  type CompanionStatus,
} from "@/components/companion/companion-shared";
import { openCompanionWindow } from "@/lib/companion/window";
import { cn } from "@/lib/utils";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useCompanionStore } from "@/stores/companion-store";

export function CompanionShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const shortcutLabel = useMemo(() => platformShortcutLabel(), []);
  const {
    currentBundle,
    threads,
    selectedThreadId,
    threadsLoading,
    bundleLoading,
    loadThreads,
    selectThread,
  } = useCollaborationStore();
  const { expanded, open, close, toggle } = useCompanionStore();
  const snapshot = useMemo(() => resolveCompanionSnapshot(currentBundle), [currentBundle]);
  const hasAttention = snapshot.status === "needs-you" || snapshot.status === "done";
  const previousStatusRef = useRef<CompanionStatus | null>(null);
  const bootstrappedThreadsRef = useRef(false);
  const [quickDraft, setQuickDraft] = useState("");

  useEffect(() => {
    if (bootstrappedThreadsRef.current) return;
    if (!threadsLoading && threads.length === 0 && !currentBundle) {
      bootstrappedThreadsRef.current = true;
      void loadThreads();
    }
  }, [currentBundle, loadThreads, threads.length, threadsLoading]);

  useEffect(() => {
    if (threads.length > 0 && !selectedThreadId) {
      void selectThread(threads[0].id);
    }
  }, [selectedThreadId, selectThread, threads]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSummon = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === ".";
      if (isSummon) {
        event.preventDefault();
        toggle();
        return;
      }

      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, toggle]);

  useEffect(() => {
    if (previousStatusRef.current === null) {
      previousStatusRef.current = snapshot.status;
      return;
    }

    if (snapshot.status !== previousStatusRef.current && hasAttention) {
      open();
    }

    previousStatusRef.current = snapshot.status;
  }, [hasAttention, open, snapshot.status]);

  const openWorkspace = () => {
    const params = new URLSearchParams();
    if (currentBundle?.thread.id) {
      params.set("thread", currentBundle.thread.id);
    }
    if (currentBundle?.thread.primary_agent_id) {
      params.set("agent", currentBundle.thread.primary_agent_id);
    }

    const search = params.toString();
    if (location.pathname !== "/work/chat" || search) {
      navigate({
        pathname: "/work/chat",
        search: search ? `?${search}` : "",
      });
    }
    close();
  };

  const pushDraftToChat = () => {
    const trimmed = quickDraft.trim();
    const params = new URLSearchParams();

    if (currentBundle?.thread.id) {
      params.set("thread", currentBundle.thread.id);
    }
    if (currentBundle?.thread.primary_agent_id) {
      params.set("agent", currentBundle.thread.primary_agent_id);
    }
    if (trimmed) {
      params.set("draft", trimmed);
    }

    navigate({
      pathname: "/work/chat",
      search: `?${params.toString()}`,
    });
    setQuickDraft("");
    close();
  };

  const popOutCompanion = () => {
    void openCompanionWindow({
      threadId: currentBundle?.thread.id ?? null,
      agentId: currentBundle?.thread.primary_agent_id ?? null,
    });
    close();
  };

  const openBoard = () => {
    if (location.pathname !== "/collab") {
      navigate("/collab");
    }
    close();
  };

  const meta = STATUS_META[snapshot.status];

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute bottom-24 right-6 flex max-w-[calc(100vw-48px)] flex-col items-end gap-3">
        <div
          className={cn(
            "pointer-events-auto w-[380px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[28px] border border-border/70 bg-card/[0.78] shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-95 opacity-0",
          )}
        >
          <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", meta.panelClassName)} aria-hidden />

          <div className="relative flex items-start gap-4 p-5">
            <div className="companion-breathe">
              <CatAvatar status={snapshot.status} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", meta.chipClassName)}>
                    <StatusIcon status={snapshot.status} />
                    {formatFriendlyStatus(snapshot.status)}
                  </div>
                  <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-foreground">{snapshot.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{snapshot.subtitle}</p>
                </div>

                <button
                  type="button"
                  onClick={close}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/[0.55] text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                  aria-label="收起 Companion"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 rounded-[22px] border border-border/70 bg-background/[0.62] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">当前线程</div>
                <div className="mt-2 text-base font-medium text-foreground">
                  {snapshot.threadTitle ?? "还没有选中的线程"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">{snapshot.focus}</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricPill label="处理中" value={snapshot.activeTaskCount} />
                <MetricPill label="待确认" value={snapshot.blockedTaskCount} />
                <MetricPill label="已完成" value={snapshot.doneTaskCount} />
              </div>

              <div className="mt-3 rounded-[22px] border border-border/70 bg-background/[0.62] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  {snapshot.question ? "这一步等你决定" : "最近动态"}
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground">
                  {snapshot.question ?? snapshot.recentLine}
                </div>
              </div>

              <div className="mt-3 rounded-[24px] border border-border/70 bg-background/[0.62] p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">现在就交代一句</div>
                <textarea
                  value={quickDraft}
                  onChange={(event) => setQuickDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      pushDraftToChat();
                    }
                  }}
                  placeholder="例如：帮我把今天这条线程收一下，列出还缺的点。"
                  rows={3}
                  className="mt-3 min-h-[84px] w-full resize-none rounded-[18px] border border-border/70 bg-background/[0.7] px-3 py-3 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">⌘/Ctrl + Enter 可直接带进聊天框</div>
                  <button
                    type="button"
                    onClick={pushDraftToChat}
                    className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
                  >
                    带去继续聊
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={openWorkspace}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_16px_40px_rgba(14,165,233,0.16)] transition-transform hover:-translate-y-0.5"
                >
                  继续对话
                  <ExternalLink size={16} />
                </button>
                <button
                  type="button"
                  onClick={openBoard}
                  className="inline-flex h-11 items-center rounded-full border border-border/70 bg-background/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-background"
                >
                  查看任务板
                </button>
                <button
                  type="button"
                  onClick={popOutCompanion}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-border/70 bg-background/[0.56] px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                >
                  弹到桌面
                  <MonitorUp size={16} />
                </button>
                <div className="ml-auto text-xs text-muted-foreground">{shortcutLabel}</div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          className={cn(
            "pointer-events-auto group relative flex min-h-[90px] w-[306px] max-w-[calc(100vw-48px)] items-center gap-3 overflow-hidden rounded-[32px] border border-border/70 bg-card/[0.76] px-4 py-3 text-left shadow-[0_20px_72px_rgba(15,23,42,0.16)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(15,23,42,0.2)]",
            hasAttention && "ring-1 ring-primary/30",
            expanded && "translate-y-1 scale-[0.98] opacity-90",
          )}
          aria-expanded={expanded}
          aria-label="打开 Companion"
        >
          <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", meta.panelClassName)} aria-hidden />
          <div className="relative flex items-center gap-3">
            <div className={cn("rounded-[26px] p-1.5", hasAttention && "companion-soft-glow", !hasAttention && "companion-breathe")}>
              <CatAvatar status={snapshot.status} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.chipClassName)}>
                  {formatFriendlyStatus(snapshot.status)}
                </span>
                {bundleLoading ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 size={12} className="animate-spin" />
                    同步中
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">{snapshot.threadTitle ?? "Companion"}</div>
              <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{snapshot.focus}</div>
            </div>
          </div>

          <div className="relative ml-auto shrink-0 self-end rounded-full border border-border/70 bg-background/[0.65] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {shortcutLabel}
          </div>
        </button>
      </div>
    </div>
  );
}
