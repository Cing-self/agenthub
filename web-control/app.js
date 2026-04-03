const storageKeys = {
  token: "agenthub:web-control:token",
  threadId: "agenthub:web-control:thread-id",
};

const injectedConfig = window.__AGENTHUB_REMOTE_CONFIG__ || {};
const urlParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const sharedToken = urlParams.get("token") || hashParams.get("token") || "";

const state = {
  baseUrl: injectedConfig.baseUrl || "/api",
  token: sharedToken || localStorage.getItem(storageKeys.token) || "",
  connected: false,
  threads: [],
  currentThreadId: localStorage.getItem(storageKeys.threadId) || "",
  currentThread: null,
  pollTimer: null,
  drawerOpen: false,
};

const els = {
  authOverlay: document.querySelector("#auth-overlay"),
  historySheet: document.querySelector("#history-sheet"),
  sheetOverlay: document.querySelector("#sheet-overlay"),
  tokenInput: document.querySelector("#bridge-token"),
  connectBtn: document.querySelector("#connect-btn"),
  refreshBtn: document.querySelector("#refresh-btn"),
  historyToggleBtn: document.querySelector("#history-toggle-btn"),
  historyCloseBtn: document.querySelector("#history-close-btn"),
  heroNewThreadBtn: document.querySelector("#hero-new-thread-btn"),
  healthBadge: document.querySelector("#health-badge"),
  statusText: document.querySelector("#status-text"),
  threadList: document.querySelector("#thread-list"),
  threadTitle: document.querySelector("#thread-title"),
  threadMeta: document.querySelector("#thread-meta"),
  messages: document.querySelector("#messages"),
  composer: document.querySelector("#composer"),
  composerHint: document.querySelector("#composer-hint"),
  messageInput: document.querySelector("#message-input"),
  sendBtn: document.querySelector("#send-btn"),
  newThreadBtn: document.querySelector("#new-thread-btn"),
  threadItemTemplate: document.querySelector("#thread-item-template"),
  messageTemplate: document.querySelector("#message-template"),
};

let drawerHideTimer = null;

function autosizeComposer() {
  els.messageInput.style.height = "0px";
  const nextHeight = Math.min(152, Math.max(24, els.messageInput.scrollHeight));
  els.messageInput.style.height = `${nextHeight}px`;
}

function setDrawerOpen(open) {
  state.drawerOpen = open;
  window.clearTimeout(drawerHideTimer);

  if (open) {
    els.historySheet.hidden = false;
    els.sheetOverlay.hidden = false;
    window.requestAnimationFrame(() => {
      document.body.classList.add("drawer-open");
    });
    return;
  }

  document.body.classList.remove("drawer-open");
  drawerHideTimer = window.setTimeout(() => {
    if (!state.drawerOpen) {
      els.historySheet.hidden = true;
      els.sheetOverlay.hidden = true;
    }
  }, 240);
}

function setAuthOpen(open) {
  els.authOverlay.hidden = !open;
  document.body.classList.toggle("auth-open", open);

  if (open) {
    window.requestAnimationFrame(() => {
      els.tokenInput.focus();
      els.tokenInput.select();
    });
  }
}

function setStatus(text, type = "muted") {
  els.statusText.textContent = text;
  els.healthBadge.className = `badge ${type}`;
  els.healthBadge.textContent =
    type === "success" ? "已连接" : type === "danger" ? "连接失败" : "未连接";
}

async function request(pathname, options = {}, requireAuth = true) {
  if (!state.baseUrl) {
    throw new Error("聊天入口尚未就绪。");
  }

  const headers = new Headers(options.headers || {});
  if (requireAuth && state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${state.baseUrl}${pathname}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateHeader() {
  if (!state.currentThread) {
    els.threadTitle.textContent = "Lobster";
    els.threadMeta.textContent = state.connected
      ? "开始一段新对话"
      : "等待连接本地机器";
    return;
  }

  const thread = state.currentThread.thread;
  els.threadTitle.textContent = thread.title || "未命名对话";

  const parts = [];
  if (thread.primaryAgentId) {
    parts.push(`Agent: ${thread.primaryAgentId}`);
  }
  if (thread.updatedAt) {
    parts.push(formatTime(thread.updatedAt));
  }
  els.threadMeta.textContent = parts.join(" · ") || "对话已连接";
}

function renderThreads() {
  els.threadList.innerHTML = "";

  if (!state.threads.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = state.connected
      ? "还没有历史对话，直接发第一句话就行。"
      : "连接成功后，这里会出现历史对话。";
    els.threadList.append(empty);
    return;
  }

  for (const thread of state.threads) {
    const fragment = els.threadItemTemplate.content.cloneNode(true);
    const button = fragment.querySelector(".thread-item");
    button.classList.toggle("active", thread.id === state.currentThreadId);
    fragment.querySelector(".thread-name").textContent =
      thread.title || "未命名对话";
    fragment.querySelector(".thread-time").textContent = formatTime(
      thread.updatedAt,
    );
    fragment.querySelector(".thread-preview").textContent =
      thread.latestMessagePreview || thread.goal || "还没有消息";
    button.addEventListener("click", () => {
      setDrawerOpen(false);
      void selectThread(thread.id);
    });
    els.threadList.append(fragment);
  }
}

function renderEmptyMessages() {
  els.messages.classList.add("empty");
  els.messages.innerHTML = `
    <div class="empty-state">
      <div class="empty-mark">L</div>
      <h2>直接开始说话</h2>
      <p>这里就是和本地 Agent 的聊天窗口，不需要切页面。</p>
    </div>
  `;
}

function renderMessages() {
  els.messages.innerHTML = "";
  updateHeader();

  if (!state.currentThread || !(state.currentThread.messages || []).length) {
    renderEmptyMessages();
    return;
  }

  els.messages.classList.remove("empty");

  for (const message of state.currentThread.messages || []) {
    const fragment = els.messageTemplate.content.cloneNode(true);
    const article = fragment.querySelector(".message");
    article.classList.add(message.role);
    fragment.querySelector(".message-role").textContent =
      message.role === "assistant" ? message.agentId || "Lobster" : "你";
    fragment.querySelector(".message-time").textContent = formatTime(
      message.timestamp,
    );
    fragment.querySelector(".message-bubble").textContent =
      message.content || "（空消息）";
    els.messages.append(fragment);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

async function loadThreads({ keepSelection = true } = {}) {
  const payload = await request("/threads");
  state.threads = payload.threads || [];
  renderThreads();

  if (!keepSelection) {
    state.currentThreadId = "";
    localStorage.removeItem(storageKeys.threadId);
  }

  if (state.currentThreadId) {
    const exists = state.threads.some((thread) => thread.id === state.currentThreadId);
    if (exists) {
      await selectThread(state.currentThreadId, { silent: true });
      return;
    }
  }

  if (state.threads.length) {
    const newestThread = state.threads[0];
    if (newestThread?.id) {
      await selectThread(newestThread.id, { silent: true });
      return;
    }
  }

  state.currentThread = null;
  renderMessages();
}

async function selectThread(threadId, { silent = false } = {}) {
  state.currentThreadId = threadId;
  localStorage.setItem(storageKeys.threadId, threadId);
  renderThreads();
  const payload = await request(`/threads/${encodeURIComponent(threadId)}`);
  state.currentThread = payload;
  renderMessages();
  if (!silent) {
    setStatus("历史对话已同步。", "success");
  }
}

function startPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
  }
  state.pollTimer = window.setInterval(() => {
    void loadThreads();
  }, 5000);
}

async function connectChat() {
  state.token = els.tokenInput.value.trim();

  if (!state.token) {
    setStatus("请输入连接码。", "danger");
    setAuthOpen(true);
    return;
  }

  localStorage.setItem(storageKeys.token, state.token);
  setStatus("正在连接...", "muted");

  try {
    const health = await request(
      "/health",
      {
        headers: {
          Authorization: `Bearer ${state.token}`,
        },
      },
      false,
    );

    state.connected = Boolean(health.ok);
    setStatus(`已连接，本地共有 ${health.threads} 条对话。`, "success");
    setAuthOpen(false);
    await loadThreads();
    startPolling();
  } catch (error) {
    state.connected = false;
    setStatus(`连接失败：${error.message || error}`, "danger");
    setAuthOpen(true);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const message = els.messageInput.value.trim();
  if (!message) return;

  if (!state.connected) {
    setStatus("连接已失效，请重新连接。", "danger");
    setAuthOpen(true);
    return;
  }

  els.sendBtn.disabled = true;
  els.composerHint.textContent = "Lobster 正在思考，请稍等。";

  try {
    const payload = await request("/turn", {
      method: "POST",
      body: JSON.stringify({
        threadId: state.currentThreadId || undefined,
        message,
      }),
    });

    els.messageInput.value = "";
    autosizeComposer();
    state.currentThreadId = payload.threadId;
    localStorage.setItem(storageKeys.threadId, payload.threadId);
    await loadThreads();
    await selectThread(payload.threadId, { silent: true });
    els.composerHint.textContent = "继续发送就好，我会自动续接当前对话。";
  } catch (error) {
    els.composerHint.textContent = "发送失败，请重新连接后再试。";
    setStatus(`发送失败：${error.message || error}`, "danger");
    setAuthOpen(true);
  } finally {
    els.sendBtn.disabled = false;
  }
}

function startNewThread() {
  state.currentThreadId = "";
  state.currentThread = null;
  localStorage.removeItem(storageKeys.threadId);
  renderThreads();
  renderMessages();
  els.messageInput.focus();
  setDrawerOpen(false);
}

function bindComposer() {
  els.messageInput.addEventListener("input", () => {
    autosizeComposer();
  });

  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(event);
    }
  });
}

function boot() {
  els.tokenInput.value = state.token;
  autosizeComposer();

  els.connectBtn.addEventListener("click", () => {
    void connectChat();
  });
  els.refreshBtn.addEventListener("click", () => {
    if (!state.connected) return;
    void loadThreads();
  });
  els.newThreadBtn.addEventListener("click", startNewThread);
  els.heroNewThreadBtn.addEventListener("click", startNewThread);
  els.composer.addEventListener("submit", sendMessage);
  els.historyToggleBtn.addEventListener("click", () => {
    setDrawerOpen(true);
  });
  els.historyCloseBtn.addEventListener("click", () => {
    setDrawerOpen(false);
  });
  els.sheetOverlay.addEventListener("click", () => {
    setDrawerOpen(false);
  });

  bindComposer();
  renderThreads();
  renderMessages();

  if (state.token) {
    void connectChat();
  } else {
    setAuthOpen(true);
  }
}

boot();
