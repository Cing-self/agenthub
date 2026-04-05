import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GripHorizontal, Loader2, Minimize2, PanelRightOpen } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
import {
  COMPANION_CONTEXT_EVENT,
  focusMainWindow,
  hideCurrentCompanionWindow,
  syncCurrentCompanionWindowLayout,
} from "@/lib/companion/window";
import { cn } from "@/lib/utils";
import { useCollaborationStore } from "@/stores/collaboration-store";
import { useCompanionStore } from "@/stores/companion-store";

export function CompanionWindow() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [quickDraft, setQuickDraft] = useState("");
  const bootstrappedThreadsRef = useRef(false);
  const requestedThreadId = searchParams.get("thread") ?? "";
  const previousStatusRef = useRef<CompanionStatus | null>(null);

  useEffect(() => {
    void syncCurrentCompanionWindowLayout(expanded);
  }, [expanded]);

  useEffect(() => {
    if (bootstrappedThreadsRef.current) return;
    bootstrappedThreadsRef.current = true;
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!requestedThreadId) return;
    if (selectedThreadId === requestedThreadId && currentBundle?.thread.id === requestedThreadId) return;
    if (!threads.some((thread) => thread.id === requestedThreadId)) return;
    void selectThread(requestedThreadId);
  }, [currentBundle?.thread.id, requestedThreadId, selectThread, selectedThreadId, threads]);

  useEffect(() => {
    if (!requestedThreadId && threads.length > 0 && !selectedThreadId) {
      void selectThread(threads[0].id);
    }
  }, [requestedThreadId, selectedThreadId, selectThread, threads]);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | null = null;

    void appWindow.listen<{ threadId?: string; agentId?: string }>(COMPANION_CONTEXT_EVENT, (event) => {
      const nextParams = new URLSearchParams(searchParams);
      if (event.payload.threadId) {
        nextParams.set("thread", event.payload.threadId);
      }
      if (event.payload.agentId) {
        nextParams.set("agent", event.payload.agentId);
      }
      setSearchParams(nextParams, { replace: true });
      open();
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [open, searchParams, setSearchParams]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSummon = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key === ".";
      if (isSummon) {
        event.preventDefault();
        toggle();
        return;
      }

      if (event.key === "Escape") {
        if (expanded) {
          close();
        } else {
          void hideCurrentCompanionWindow();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, expanded, toggle]);

  useEffect(() => {
    if (previousStatusRef.current === null) {
      previousStatusRef.current = snapshot.status;
      return;
    }

    if (snapshot.status !== previousStatusRef.current && (snapshot.status === "needs-you" || snapshot.status === "done")) {
      open();
    }

    previousStatusRef.current = snapshot.status;
  }, [open, snapshot.status]);

  const openWorkspace = () => {
    void focusMainWindow({
      path: "/work/chat",
      query: {
        thread: currentBundle?.thread.id ?? undefined,
        agent: currentBundle?.thread.primary_agent_id ?? undefined,
        draft: quickDraft.trim() || undefined,
      },
    });
    void hideCurrentCompanionWindow();
  };

  const openBoard = () => {
    void focusMainWindow({
      path: "/collab",
      query: {
        thread: currentBundle?.thread.id ?? undefined,
      },
    });
    void hideCurrentCompanionWindow();
  };

  const pushDraftToChat = () => {
    openWorkspace();
    setQuickDraft("");
  };

  const startDragging = () => {
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const meta = STATUS_META[snapshot.status];

  return (
    <div className="flex h-screen w-screen items-end justify-end overflow-hidden bg-transparent p-0 text-foreground">
      <div
        className={cn(
          "group relative overflow-hidden rounded-[34px] border border-white/15 bg-card/[0.78] shadow-[0_26px_90px_rgba(15,23,42,0.22)] backdrop-blur-[22px] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded ? "h-full w-full max-w-[392px]" : "h-[112px] w-[318px]",
        )}
      >
        <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", meta.panelClassName)} aria-hidden />

        <div
          data-tauri-drag-region
          className="relative flex h-full flex-col"
          style={{ WebkitAppRegion: "drag" } as CSSProperties}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <GripHorizontal size={12} />
              Companion
            </div>
            <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
              <button
                type="button"
                onClick={() => {
                  if (expanded) {
                    close();
                  } else {
                    open();
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/[0.5] text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                aria-label={expanded ? "收起 Companion" : "展开 Companion"}
              >
                {expanded ? <Minimize2 size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </div>
          </div>

          {expanded ? (
            <div className="relative flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
              <button
                type="button"
                onMouseDown={startDragging}
                className="mb-2 flex items-center gap-3 rounded-[28px] text-left"
              >
                <div className={cn("rounded-[26px] p-1.5", snapshot.status === "needs-you" || snapshot.status === "done" ? "companion-soft-glow" : "companion-breathe")}>
                  <CatAvatar status={snapshot.status} />
                </div>
                <div className="min-w-0">
                  <div className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", meta.chipClassName)}>
                    <StatusIcon status={snapshot.status} />
                    {formatFriendlyStatus(snapshot.status)}
                  </div>
                  <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground">{snapshot.title}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{snapshot.subtitle}</div>
                </div>
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                <div className="rounded-[24px] border border-border/70 bg-background/[0.6] p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">当前线程</div>
                  <div className="mt-2 text-base font-medium text-foreground">{snapshot.threadTitle ?? "还没有选中的线程"}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{snapshot.focus}</div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MetricPill label="处理中" value={snapshot.activeTaskCount} />
                  <MetricPill label="待确认" value={snapshot.blockedTaskCount} />
                  <MetricPill label="已完成" value={snapshot.doneTaskCount} />
                </div>

                <div className="rounded-[24px] border border-border/70 bg-background/[0.6] p-4">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    {snapshot.question ? "这一步等你决定" : "最近动态"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-foreground">{snapshot.question ?? snapshot.recentLine}</div>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-background/[0.6] p-4">
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
                    rows={4}
                    className="mt-3 min-h-[112px] w-full resize-none rounded-[18px] border border-border/70 bg-background/[0.72] px-3 py-3 text-[13px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{shortcutLabel} 展开或收起，⌘/Ctrl + Enter 带回聊天</div>
                    <button
                      type="button"
                      onClick={pushDraftToChat}
                      className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-transform hover:-translate-y-0.5"
                    >
                      继续聊
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={openWorkspace}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  打开主对话
                  <ExternalLink size={16} />
                </button>
                <button
                  type="button"
                  onClick={openBoard}
                  className="inline-flex h-11 items-center rounded-full border border-border/70 bg-background/[0.7] px-4 text-sm font-medium text-foreground"
                >
                  任务板
                </button>
                <button
                  type="button"
                  onClick={() => void hideCurrentCompanionWindow()}
                  className="ml-auto inline-flex h-11 items-center rounded-full border border-border/70 bg-background/[0.56] px-4 text-sm font-medium text-muted-foreground"
                >
                  隐藏
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={open}
              className="relative flex h-full w-full items-center gap-3 px-4 pb-4 pt-2 text-left"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <div className={cn("rounded-[26px] p-1.5", snapshot.status === "needs-you" || snapshot.status === "done" ? "companion-soft-glow" : "companion-breathe")}>
                <CatAvatar status={snapshot.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.chipClassName)}>
                    {formatFriendlyStatus(snapshot.status)}
                  </span>
                  {bundleLoading || threadsLoading ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 size={12} className="animate-spin" />
                      同步中
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-semibold text-foreground">{snapshot.threadTitle ?? "Companion"}</div>
                <div className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{snapshot.focus}</div>
              </div>
              <div className="self-end rounded-full border border-border/70 bg-background/[0.6] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {shortcutLabel}
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
