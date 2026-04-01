import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, CheckSquare2, CloudSun, DatabaseZap } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  MemoryCardBlock,
  MessageBlock,
  MessagePart,
  SandboxWidgetBlock,
  TaskBoardCardBlock,
  WeatherCardBlock,
} from "@/lib/types/chat";

const WIDGET_HEIGHT_CACHE = new Map<string, number>();
const MESSAGE_MARKDOWN_CLASS =
  "prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed " +
  "[&_p]:my-1 [&_p]:text-[13px] [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 " +
  "[&_code]:text-[11px] [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:rounded " +
  "[&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0";

function shouldCollapseSupplementaryText(content: string) {
  const normalized = content.trim();
  if (!normalized) return false;
  return normalized.length > 260 || /\n\s*[-*]\s+/.test(normalized) || /\|.+\|/.test(normalized);
}

function SupplementaryMarkdown({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = shouldCollapseSupplementaryText(content);

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative",
          !expanded && collapsible && "max-h-28 overflow-hidden",
        )}
      >
        <div className="prose prose-sm max-w-none text-[12px] leading-relaxed text-muted-foreground [&_li]:text-[12px] [&_p]:text-[12px] [&_strong]:text-foreground">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </div>
        {!expanded && collapsible ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-background" />
        ) : null}
      </div>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center rounded-full border border-black/[0.06] bg-white/70 px-3 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
        >
          {expanded ? "收起说明" : "展开说明"}
        </button>
      ) : null}
    </div>
  );
}

function sanitizeWidgetHtml(input: string) {
  return input
    .replace(/<\s*(iframe|object|embed|meta|link|base|form)[^>]*>/gi, "")
    .replace(/<\s*\/\s*(iframe|object|embed|meta|link|base|form)\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^ >]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript:|data:).*?\2/gi, '$1="#"')
    .trim();
}

function buildWidgetReceiverSrcDoc() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none';"
    />
    <style>
      :root {
        color-scheme: light dark;
        --widget-bg: #ffffff;
        --widget-fg: #141414;
        --widget-muted: #6b7280;
        --widget-border: rgba(17, 24, 39, 0.12);
        --widget-accent: #2563eb;
        --widget-surface: rgba(255, 255, 255, 0.82);
        --widget-surface-strong: rgba(255, 255, 255, 0.94);
        --widget-shadow: 0 22px 48px -34px rgba(15, 23, 42, 0.18);
      }

      html, body {
        margin: 0;
        padding: 0;
        background: transparent;
        color: var(--widget-fg);
        font: 13px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
      }

      #root {
        min-height: 1px;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      img, svg, canvas, video {
        display: block;
        max-width: 100%;
      }

      .agenthub-widget-root {
        color: var(--widget-fg);
        width: 100%;
        overflow-wrap: anywhere;
      }

      .agenthub-widget-root a {
        color: var(--widget-accent);
      }

      .agenthub-widget-root .root {
        width: 100%;
        max-width: 100%;
        color: var(--widget-fg);
      }

      .agenthub-widget-root .header {
        margin-bottom: 14px;
      }

      .agenthub-widget-root .repo-title {
        font-size: 1.02rem;
        font-weight: 700;
        letter-spacing: 0.01em;
      }

      .agenthub-widget-root .repo-desc,
      .agenthub-widget-root .caption,
      .agenthub-widget-root .subtle {
        margin-top: 4px;
        color: var(--widget-muted);
        font-size: 0.8rem;
        line-height: 1.45;
      }

      .agenthub-widget-root .section-title {
        margin: 14px 0 8px;
        color: var(--widget-muted);
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .agenthub-widget-root .stat-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
      }

      .agenthub-widget-root .stat-card {
        border: 1px solid var(--widget-border);
        border-radius: 16px;
        background: var(--widget-surface);
        box-shadow: var(--widget-shadow);
        padding: 12px 10px;
        text-align: center;
      }

      .agenthub-widget-root .stat-val {
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.15;
      }

      .agenthub-widget-root .stat-label {
        margin-top: 4px;
        color: var(--widget-muted);
        font-size: 0.72rem;
      }

      .agenthub-widget-root .pill,
      .agenthub-widget-root .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border-radius: 999px;
        border: 1px solid var(--widget-border);
        background: var(--widget-surface);
        padding: 0.28rem 0.7rem;
        color: var(--widget-fg);
        font-size: 0.73rem;
        white-space: nowrap;
      }

      .agenthub-widget-root .pills,
      .agenthub-widget-root .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .agenthub-widget-root .timeline {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }

      .agenthub-widget-root .tl-item {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
      }

      .agenthub-widget-root .tl-dot {
        width: 8px;
        height: 8px;
        margin-top: 0.38rem;
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--widget-accent);
      }

      .agenthub-widget-root .lang-bar {
        display: flex;
        height: 9px;
        overflow: hidden;
        border-radius: 999px;
        background: color-mix(in srgb, var(--widget-fg) 6%, transparent);
      }

      .agenthub-widget-root .lang-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
        margin-top: 0.45rem;
        color: var(--widget-muted);
        font-size: 0.74rem;
      }

      .agenthub-widget-root .surface {
        background: var(--widget-surface);
        border: 1px solid var(--widget-border);
        box-shadow: var(--widget-shadow);
        backdrop-filter: blur(18px);
      }

      .agenthub-widget-root .surface-strong {
        background: var(--widget-surface-strong);
        border: 1px solid var(--widget-border);
        box-shadow: var(--widget-shadow);
        backdrop-filter: blur(18px);
      }
    </style>
  </head>
  <body>
    <div id="root" class="agenthub-widget-root"></div>
    <script>
      const root = document.getElementById("root");
      let ready = false;
      let currentVisualHtml = "";

      const postHeight = () => {
        const height = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          root.scrollHeight,
        );
        parent.postMessage({ type: "agenthub-widget:resize", height }, "*");
      };

      const parseTemplate = (html) => {
        const template = document.createElement("template");
        template.innerHTML = html;
        return template.content;
      };

      const splitVisualAndScripts = (html) => {
        const fragment = parseTemplate(html);
        const scripts = Array.from(fragment.querySelectorAll("script"));
        const scriptPayloads = scripts.map((script) => ({
          type: script.type || "text/javascript",
          text: script.textContent || "",
        }));
        scripts.forEach((script) => script.remove());
        const container = document.createElement("div");
        container.appendChild(fragment.cloneNode(true));
        return {
          visualHtml: container.innerHTML,
          scriptPayloads,
        };
      };

      const setTheme = (payload) => {
        if (!payload) return;
        document.documentElement.style.setProperty("--widget-bg", payload.background || "#ffffff");
        document.documentElement.style.setProperty("--widget-fg", payload.foreground || "#141414");
        document.documentElement.style.setProperty("--widget-muted", payload.muted || "#6b7280");
        document.documentElement.style.setProperty("--widget-border", payload.border || "rgba(17, 24, 39, 0.12)");
        document.documentElement.style.setProperty("--widget-accent", payload.accent || "#2563eb");
        document.documentElement.style.setProperty("--widget-surface", payload.surface || "rgba(255,255,255,0.82)");
        document.documentElement.style.setProperty("--widget-surface-strong", payload.surfaceStrong || "rgba(255,255,255,0.94)");
        document.documentElement.style.setProperty("--widget-shadow", payload.shadow || "0 22px 48px -34px rgba(15, 23, 42, 0.18)");
      };

      const render = (html, executeScripts) => {
        root.innerHTML = "";
        const fragment = parseTemplate(html).cloneNode(true);
        const scripts = Array.from(fragment.querySelectorAll("script"));
        scripts.forEach((script) => script.remove());
        root.appendChild(fragment);

        if (executeScripts) {
          for (const script of scripts) {
            const next = document.createElement("script");
            next.type = "text/javascript";
            next.textContent = script.textContent || "";
            root.appendChild(next);
          }
        }

        postHeight();
      };

      window.addEventListener("message", (event) => {
        const data = event.data || {};
        if (data.type === "agenthub-widget:theme") {
          setTheme(data.payload);
          postHeight();
        }
        if (data.type === "widget:update") {
          render(String(data.html || ""), false);
          currentVisualHtml = root.innerHTML;
        }
        if (data.type === "widget:finalize") {
          const html = String(data.html || "");
          const { visualHtml, scriptPayloads } = splitVisualAndScripts(html);

          if (visualHtml !== currentVisualHtml) {
            render(html, true);
            currentVisualHtml = root.innerHTML;
            return;
          }

          for (const payload of scriptPayloads) {
            const next = document.createElement("script");
            next.type = payload.type || "text/javascript";
            next.textContent = payload.text || "";
            root.appendChild(next);
          }
          postHeight();
        }
      });

      try {
        ready = true;
        parent.postMessage({ type: "agenthub-widget:ready" }, "*");
      } catch (error) {
        root.innerHTML = '<pre style="white-space:pre-wrap;color:#b91c1c;background:rgba(239,68,68,0.08);padding:12px;border-radius:12px;border:1px solid rgba(239,68,68,0.18)">' + String(error) + '</pre>';
        parent.postMessage({ type: "agenthub-widget:error", error: String(error) }, "*");
        postHeight();
      }

      new ResizeObserver(postHeight).observe(document.body);
      setTimeout(postHeight, 60);
    </script>
  </body>
</html>`;
}

function useWidgetThemePayload() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return {
        background: "#ffffff",
        foreground: "#141414",
        muted: "#6b7280",
        border: "rgba(17, 24, 39, 0.12)",
        accent: "#2563eb",
      };
    }

    const target = document.documentElement;
    const style = getComputedStyle(target);
    const dark = document.documentElement.classList.contains("dark");

    return {
      background: dark ? "rgba(12, 16, 24, 0.96)" : "rgba(255, 255, 255, 0.98)",
      foreground: style.getPropertyValue("--foreground").trim() || (dark ? "#f5f5f5" : "#141414"),
      muted: style.getPropertyValue("--muted-foreground").trim() || (dark ? "#9ca3af" : "#6b7280"),
      border: dark ? "rgba(255,255,255,0.10)" : "rgba(17,24,39,0.12)",
      accent: style.getPropertyValue("--primary").trim() || "#2563eb",
      surface: dark ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.84)",
      surfaceStrong: dark ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.95)",
      shadow: dark ? "0 28px 64px -40px rgba(0, 0, 0, 0.45)" : "0 22px 48px -34px rgba(15, 23, 42, 0.18)",
    };
  }, []);
}

function SandboxWidgetFrame({ block }: { block: SandboxWidgetBlock }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetCacheKey = useMemo(() => block.widget_code.slice(0, 200), [block.widget_code]);
  const [height, setHeight] = useState(() => WIDGET_HEIGHT_CACHE.get(widgetCacheKey) ?? 220);
  const [error, setError] = useState<string | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const theme = useWidgetThemePayload();
  const srcDoc = useMemo(() => buildWidgetReceiverSrcDoc(), []);
  const sanitizedWidgetHtml = useMemo(() => sanitizeWidgetHtml(block.widget_code), [block.widget_code]);

  const postWidgetPayload = (mode: "update" | "finalize") => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow) return;

    frameWindow.postMessage(
      {
        type: mode === "update" ? "widget:update" : "widget:finalize",
        html: sanitizedWidgetHtml,
      },
      "*",
    );
  };

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      if (event.data?.type === "agenthub-widget:resize") {
        const nextHeight = Number(event.data.height);
        if (Number.isFinite(nextHeight) && nextHeight > 0) {
          const clampedHeight = Math.max(160, Math.min(nextHeight + 6, 900));
          WIDGET_HEIGHT_CACHE.set(widgetCacheKey, clampedHeight);
          setHeight(clampedHeight);
        }
      }
      if (event.data?.type === "agenthub-widget:error") {
        setError(typeof event.data.error === "string" ? event.data.error : "Widget 渲染失败");
      }
      if (event.data?.type === "agenthub-widget:ready") {
        setIframeReady(true);
        frameWindow.postMessage({ type: "agenthub-widget:theme", payload: theme }, "*");
        postWidgetPayload(block.partial ? "update" : "finalize");
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [block.partial, theme, widgetCacheKey, sanitizedWidgetHtml]);

  useEffect(() => {
    if (!iframeReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: "agenthub-widget:theme",
        payload: theme,
      },
      "*",
    );
  }, [iframeReady, theme]);

  useEffect(() => {
    if (!iframeReady) return;
    const timer = window.setTimeout(() => {
      postWidgetPayload(block.partial ? "update" : "finalize");
    }, block.partial ? 120 : 0);

    return () => window.clearTimeout(timer);
  }, [block.partial, iframeReady, sanitizedWidgetHtml]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "agenthub-widget:theme",
          payload: theme,
        },
        "*",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [theme]);

  return (
    <div className="space-y-2.5">
      <div className="relative overflow-hidden rounded-[24px]">
        <div className="relative">
          {!iframeReady && (
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0.12))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.26),rgba(15,23,42,0.08))]">
              <div className="space-y-3 px-4 py-4">
                <div className="h-4 w-28 animate-pulse rounded-full bg-black/[0.06] dark:bg-white/[0.08]" />
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="h-24 animate-pulse rounded-[18px] bg-black/[0.05] dark:bg-white/[0.06]" />
                  <div className="h-24 animate-pulse rounded-[18px] bg-black/[0.05] dark:bg-white/[0.06]" />
                </div>
                <div className="h-40 animate-pulse rounded-[22px] bg-black/[0.05] dark:bg-white/[0.06]" />
              </div>
            </div>
          )}
          {block.partial && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/92 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.2)] backdrop-blur dark:border-white/10 dark:bg-black/45 dark:text-slate-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
              <span>正在生成...</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            title={block.title || "sandbox-widget"}
            srcDoc={srcDoc}
            sandbox="allow-scripts"
              className="block w-full rounded-[22px] border-0 bg-transparent transition-[height] duration-200 ease-out"
              style={{ height }}
            onLoad={() => {
              setIframeReady(true);
              iframeRef.current?.contentWindow?.postMessage(
                {
                  type: "agenthub-widget:theme",
                  payload: theme,
                },
                "*",
              );
              postWidgetPayload(block.partial ? "update" : "finalize");
            }}
          />
        </div>
      </div>
      {error && (
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50 px-3 py-1 text-[12px] text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function weatherConditionGlyph(condition: string) {
  const text = condition.toLowerCase();
  if (text.includes("雷")) return "⛈";
  if (text.includes("雪")) return "❄";
  if (text.includes("雨")) return "🌧";
  if (text.includes("雾")) return "🌫";
  if (text.includes("阴")) return "☁";
  if (text.includes("云")) return "⛅";
  return "☀";
}

function formatWeatherTimestamp(value?: string) {
  if (!value) return "实时";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatForecastLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
}

function WeatherCard({ block }: { block: WeatherCardBlock }) {
  const conditionGlyph = weatherConditionGlyph(block.data.condition);

  return (
    <div className="relative overflow-hidden rounded-[26px] border border-sky-200/80 bg-[linear-gradient(145deg,rgba(247,252,255,0.98),rgba(234,245,255,0.94)_52%,rgba(248,251,255,0.98))] p-5 shadow-[0_22px_48px_-30px_rgba(14,116,144,0.28)] dark:border-sky-400/15 dark:bg-[linear-gradient(145deg,rgba(12,23,37,0.94),rgba(17,35,56,0.92)_50%,rgba(10,20,32,0.96))]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-sky-300/35 blur-3xl dark:bg-sky-400/10" />
        <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-cyan-200/45 blur-3xl dark:bg-cyan-300/10" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-sky-700/75 dark:text-sky-200/65">
              {block.title || "Weather"}
            </div>
            <div className="mt-2 text-[30px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              {block.data.location}
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-200/90 bg-white/75 px-3 py-1 text-[12px] font-medium text-sky-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/10 dark:bg-white/[0.06] dark:text-sky-100">
              <span className="text-[14px] leading-none">{conditionGlyph}</span>
              <span>{block.data.condition}</span>
            </div>
          </div>

          <div className="rounded-[22px] border border-white/55 bg-white/78 px-4 py-3 text-right shadow-[0_18px_40px_-32px_rgba(14,116,144,0.45)] backdrop-blur dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex items-center justify-end gap-2 text-sky-700 dark:text-sky-200">
              <CloudSun size={20} />
              <span className="text-[44px] font-semibold leading-none tracking-[-0.04em]">
                {Math.round(block.data.temperature_c)}°
              </span>
            </div>
            <div className="mt-2 text-[12px] text-slate-500 dark:text-slate-300/75">
              {block.data.feels_like_c != null ? `体感 ${Math.round(block.data.feels_like_c)}°` : "当前体感稳定"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[20px] border border-slate-200/80 bg-white/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-white/8 dark:bg-white/[0.05]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300/65">体感</div>
            <div className="mt-2 text-[22px] font-semibold text-slate-950 dark:text-slate-50">
              {block.data.feels_like_c != null ? `${Math.round(block.data.feels_like_c)}°` : "—"}
            </div>
          </div>
          <div className="rounded-[20px] border border-slate-200/80 bg-white/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-white/8 dark:bg-white/[0.05]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300/65">最高 / 最低</div>
            <div className="mt-2 text-[22px] font-semibold text-slate-950 dark:text-slate-50">
              {block.data.high_c != null ? Math.round(block.data.high_c) : "—"}° / {block.data.low_c != null ? Math.round(block.data.low_c) : "—"}°
            </div>
          </div>
          <div className="rounded-[20px] border border-slate-200/80 bg-white/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-white/8 dark:bg-white/[0.05]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300/65">风速</div>
            <div className="mt-2 text-[22px] font-semibold text-slate-950 dark:text-slate-50">
              {block.data.wind_speed_kmh != null ? `${Math.round(block.data.wind_speed_kmh)}` : "—"}
              <span className="ml-1 text-[13px] font-medium text-slate-500 dark:text-slate-300/70">km/h</span>
            </div>
          </div>
          <div className="rounded-[20px] border border-slate-200/80 bg-white/72 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-white/8 dark:bg-white/[0.05]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300/65">更新时间</div>
            <div className="mt-2 truncate text-[17px] font-semibold text-slate-950 dark:text-slate-50">
              {formatWeatherTimestamp(block.data.updated_at ?? block.data.timezone)}
            </div>
          </div>
        </div>

        {block.data.daily?.length ? (
          <div className="mt-5">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300/65">
              未来五日
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              {block.data.daily.slice(0, 5).map((item) => (
                <div
                  key={item.date}
                  className="rounded-[18px] border border-slate-200/80 bg-white/76 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-white/8 dark:bg-white/[0.05]"
                >
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300/65">
                    {formatForecastLabel(item.date)}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-100">
                    <span className="text-[16px] leading-none">{weatherConditionGlyph(item.condition)}</span>
                    <span className="truncate">{item.condition}</span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="text-[22px] font-semibold text-slate-950 dark:text-slate-50">
                      {Math.round(item.high_c)}°
                    </div>
                    <div className="text-[15px] font-medium text-slate-500 dark:text-slate-300/75">
                      {Math.round(item.low_c)}°
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MemoryCard({ block }: { block: MemoryCardBlock }) {
  return (
    <div className="rounded-[20px] border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-4 shadow-[0_18px_38px_-28px_rgba(109,40,217,0.25)] dark:border-violet-400/15 dark:from-violet-500/10 dark:via-slate-900 dark:to-indigo-500/10">
      <div className="flex items-center gap-2">
        <DatabaseZap size={18} className="text-violet-600 dark:text-violet-300" />
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-700/70 dark:text-violet-200/70">
            {block.title || "Memory"}
          </div>
          {block.data.query && <div className="mt-1 text-[13px] text-muted-foreground">查询：{block.data.query}</div>}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {block.data.items.map((item, index) => (
          <div
            key={item.id || `${item.scope || "memory"}-${index}`}
            className="rounded-2xl border border-black/5 bg-white/72 px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]"
          >
            <div className="text-[13px] leading-relaxed">{item.content}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {item.scope && <span className="rounded-full bg-foreground/5 px-2 py-0.5">{item.scope}</span>}
              {item.updated_at && <span>{item.updated_at}</span>}
              {item.tags?.map((tag) => (
                <span key={tag} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-200">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskBoardCard({ block }: { block: TaskBoardCardBlock }) {
  return (
    <div className="rounded-[20px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-[0_18px_38px_-28px_rgba(5,150,105,0.25)] dark:border-emerald-400/15 dark:from-emerald-500/10 dark:via-slate-900 dark:to-teal-500/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700/70 dark:text-emerald-200/70">
            {block.title || "Task Board"}
          </div>
          <div className="mt-1 text-lg font-semibold">{block.data.thread_title}</div>
          <div className="mt-1 text-[13px] text-muted-foreground">{block.data.objective}</div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-white/70 px-3 py-1 text-[12px] font-medium text-emerald-700 dark:border-emerald-400/15 dark:bg-white/[0.04] dark:text-emerald-200">
          <CheckSquare2 size={14} />
          {block.data.tasks.length} tasks
        </div>
      </div>

      {block.data.current_focus && (
        <div className="mt-3 rounded-2xl border border-black/5 bg-white/70 px-3 py-2 text-[13px] dark:border-white/8 dark:bg-white/[0.04]">
          当前焦点：{block.data.current_focus}
        </div>
      )}

      {block.data.summary && (
        <div className="mt-3 rounded-2xl border border-black/5 bg-white/70 px-3 py-2 text-[13px] leading-relaxed dark:border-white/8 dark:bg-white/[0.04]">
          {block.data.summary}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {block.data.tasks.slice(0, 6).map((task, index) => (
          <div
            key={`${task.title}-${index}`}
            className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white/72 px-3 py-2 text-[12px] dark:border-white/8 dark:bg-white/[0.04]"
          >
            <div>
              <div className="font-medium">{task.title}</div>
              <div className="mt-1 text-muted-foreground">
                {task.assigned_agent_id ? `负责人：${task.assigned_agent_id}` : "未分配"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px]">{task.status}</span>
              {task.priority && <span className="text-[11px] text-muted-foreground">{task.priority}</span>}
            </div>
          </div>
        ))}
      </div>

      {(block.data.open_questions?.length || block.data.key_files?.length) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {block.data.open_questions?.length ? (
            <div className="rounded-2xl border border-black/5 bg-white/72 px-3 py-2 text-[12px] dark:border-white/8 dark:bg-white/[0.04]">
              <div className="font-medium">待解决</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                {block.data.open_questions.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {block.data.key_files?.length ? (
            <div className="rounded-2xl border border-black/5 bg-white/72 px-3 py-2 text-[12px] dark:border-white/8 dark:bg-white/[0.04]">
              <div className="font-medium">关键文件</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {block.data.key_files.slice(0, 4).map((item) => (
                  <li key={item} className="truncate">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function renderBlock(block: MessageBlock) {
  switch (block.type) {
    case "weather_card":
      return <WeatherCard block={block} />;
    case "memory_card":
      return <MemoryCard block={block} />;
    case "task_board_card":
      return <TaskBoardCard block={block} />;
    case "sandbox_widget":
      return <SandboxWidgetFrame block={block} />;
    default:
      return null;
  }
}

export function MessageBlocksRenderer({
  parts,
  className,
}: {
  parts: MessagePart[];
  className?: string;
}) {
  const hasBlocks = parts.some((part) => part.type === "block");

  return (
    <div className={cn("space-y-3", className)}>
      {parts.map((part, index) => {
        const followsBlock = hasBlocks && index > 0 && parts[index - 1]?.type === "block";
        return (
        part.type === "text" ? (
          part.content.trim() ? (
            <div
              key={`text-${index}`}
              className={cn(
                followsBlock
                  ? "pt-0.5"
                  : MESSAGE_MARKDOWN_CLASS,
              )}
            >
              {followsBlock ? (
                <SupplementaryMarkdown content={part.content} />
              ) : (
                <Markdown remarkPlugins={[remarkGfm]}>{part.content}</Markdown>
              )}
            </div>
          ) : null
        ) : (
          <div key={`block-${index}`}>{renderBlock(part.block)}</div>
        )
        );
      })}
    </div>
  );
}
