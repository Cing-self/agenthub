import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const COMPANION_WINDOW_LABEL = "companion";
export const COMPANION_CONTEXT_EVENT = "agenthub://companion/context";
export const COMPANION_NAVIGATE_EVENT = "agenthub://companion/navigate";

interface CompanionWindowContext {
  threadId?: string | null;
  agentId?: string | null;
}

interface MainWindowNavigationTarget {
  path: string;
  query?: Record<string, string | null | undefined>;
}

const COMPANION_COLLAPSED_SIZE = {
  width: 318,
  height: 112,
};

const COMPANION_EXPANDED_SIZE = {
  width: 392,
  height: 628,
};

const COMPANION_MARGIN = 22;

function buildCompanionUrl(context?: CompanionWindowContext) {
  const url = new URL("/", window.location.href);
  url.searchParams.set("surface", "companion");
  if (context?.threadId) {
    url.searchParams.set("thread", context.threadId);
  }
  if (context?.agentId) {
    url.searchParams.set("agent", context.agentId);
  }
  return url.toString();
}

async function ensureWindowReady(window: WebviewWindow) {
  return new Promise<WebviewWindow>((resolve, reject) => {
    let settled = false;
    void window.once("tauri://created", () => {
      if (settled) return;
      settled = true;
      resolve(window);
    });
    void window.once("tauri://error", (event) => {
      if (settled) return;
      settled = true;
      reject(event.payload);
    });
  });
}

export async function syncCurrentCompanionWindowLayout(expanded: boolean) {
  const appWindow = getCurrentWindow();
  const targetSize = expanded ? COMPANION_EXPANDED_SIZE : COMPANION_COLLAPSED_SIZE;

  await appWindow.setResizable(false).catch(() => undefined);
  await appWindow.setAlwaysOnTop(true).catch(() => undefined);
  await appWindow.setSkipTaskbar(true).catch(() => undefined);
  await appWindow.setVisibleOnAllWorkspaces(true).catch(() => undefined);
  await appWindow.setSize(new LogicalSize(targetSize.width, targetSize.height));

  const monitor = await currentMonitor().catch(() => null);
  if (!monitor) return;

  const scale = monitor.scaleFactor || 1;
  const workAreaLeft = monitor.workArea.position.x / scale;
  const workAreaTop = monitor.workArea.position.y / scale;
  const workAreaWidth = monitor.workArea.size.width / scale;
  const workAreaHeight = monitor.workArea.size.height / scale;
  const nextX = Math.round(workAreaLeft + workAreaWidth - targetSize.width - COMPANION_MARGIN);
  const nextY = Math.round(workAreaTop + workAreaHeight - targetSize.height - COMPANION_MARGIN);

  await appWindow.setPosition(new LogicalPosition(nextX, nextY));
}

export async function openCompanionWindow(context?: CompanionWindowContext) {
  let window = await WebviewWindow.getByLabel(COMPANION_WINDOW_LABEL);

  if (!window) {
    window = new WebviewWindow(COMPANION_WINDOW_LABEL, {
      url: buildCompanionUrl(context),
      title: "AgentHub Companion",
      width: COMPANION_COLLAPSED_SIZE.width,
      height: COMPANION_COLLAPSED_SIZE.height,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      visibleOnAllWorkspaces: true,
      shadow: false,
      hiddenTitle: true,
      focus: true,
    });
    await ensureWindowReady(window);
  } else if (context) {
    await window.emit(COMPANION_CONTEXT_EVENT, context).catch(() => undefined);
  }

  await window.show().catch(() => undefined);
  await window.setFocus().catch(() => undefined);
  return window;
}

export async function hideCurrentCompanionWindow() {
  await getCurrentWindow().hide();
}

export async function focusMainWindow(target: MainWindowNavigationTarget) {
  const mainWindow = await WebviewWindow.getByLabel("main");
  if (!mainWindow) return;

  await mainWindow.emit(COMPANION_NAVIGATE_EVENT, target).catch(() => undefined);
  await mainWindow.show().catch(() => undefined);
  await mainWindow.setFocus().catch(() => undefined);
}
